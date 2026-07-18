require "rails_helper"

RSpec.describe "Rack::Attack throttling", type: :request, skip_n_plus_one: true do
  before do
    Rack::Attack.enabled     = true
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
  end

  after { Rack::Attack.enabled = false }

  describe "POST /api/v1/auth/sign_in" do
    let(:body) { { user: { email: "nobody@example.com", password: "wrongpass" } } }

    it "returns 429 after 5 attempts from the same IP within 1 minute" do
      5.times do
        post "/api/v1/auth/sign_in", params: body, as: :json
        expect(response).to have_http_status(:unauthorized)
      end

      post "/api/v1/auth/sign_in", params: body, as: :json

      expect(response).to have_http_status(:too_many_requests)
      expect(response.headers["Retry-After"]).to eq("60")
      payload = JSON.parse(response.body)
      expect(payload["error"]).to match(/Too many requests/)
      expect(payload["code"]).to eq("rate_limited")
    end
  end

  # The auth/sign_up throttle was deleted along with the endpoint it protected
  # (SPEC.md § Registration is closed). The unauthenticated writes are sign_in
  # above and the passkey ceremony below.

  describe "POST /api/v1/auth/passkey* — per-IP ceremony throttle" do
    # Options and verify share one 10/min family: a ceremony costs two
    # requests, so the budget is the same five sign-ins a minute the password
    # throttle allows (SPEC.md § Passkeys).
    it "returns 429 on the 11th ceremony request from one IP, across both legs" do
      10.times do
        post "/api/v1/auth/passkey/options"
        expect(response).to have_http_status(:ok)
      end

      post "/api/v1/auth/passkey", params: { challenge: "x", credential: { id: "x" } }, as: :json

      expect(response).to have_http_status(:too_many_requests)
      expect(response.parsed_body["code"]).to eq("rate_limited")
    end
  end

  describe "writes to /api/v1/passkeys — per-account enrollment cap" do
    let(:user)  { create(:user) }
    let(:token) { jwt_for(user) }

    it "returns 429 after 10 enrollment writes in a minute" do
      10.times do
        post "/api/v1/passkeys/options", headers: { "Authorization" => token }
        expect(response).to have_http_status(:ok)
      end

      post "/api/v1/passkeys/options", headers: { "Authorization" => token }

      expect(response).to have_http_status(:too_many_requests)
    end

    it "does not throttle a delete — it gives capacity back" do
      credential = create(:credential, user: user)
      10.times { post "/api/v1/passkeys/options", headers: { "Authorization" => token } }

      delete "/api/v1/passkeys/#{credential.id}", headers: { "Authorization" => token }

      expect(response).to have_http_status(:no_content)
    end
  end

  describe "POST /api/v1/auth/sign_in — per-account brute-force backstop" do
    let(:body) { { user: { email: "victim@example.com", password: "wrongpass" } } }

    # Rotate the source IP each attempt so the per-IP throttle (5/min) never
    # fires — isolating the email-keyed backstop, which is what defends against
    # a distributed, IP-rotating attack on one account.
    it "returns 429 after 10 attempts against the same email across different IPs" do
      10.times do |i|
        post "/api/v1/auth/sign_in", params: body, as: :json,
          headers: { "REMOTE_ADDR" => "203.0.113.#{i}" }
        expect(response).to have_http_status(:unauthorized)
      end

      post "/api/v1/auth/sign_in", params: body, as: :json,
        headers: { "REMOTE_ADDR" => "203.0.113.200" }

      expect(response).to have_http_status(:too_many_requests)
      expect(response.headers["Retry-After"]).to eq("300")
    end

    it "counts a different email separately" do
      10.times do |i|
        post "/api/v1/auth/sign_in",
          params: { user: { email: "victim@example.com", password: "x" } },
          as: :json, headers: { "REMOTE_ADDR" => "203.0.113.#{i}" }
      end

      post "/api/v1/auth/sign_in",
        params: { user: { email: "someone-else@example.com", password: "x" } },
        as: :json, headers: { "REMOTE_ADDR" => "203.0.113.201" }

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "POST /api/v1/applications/prefill — per-account cap" do
    let(:user) { create(:user) }

    before do
      allow(Applications::UrlPrefillService).to receive(:new).and_return(
        instance_double(Applications::UrlPrefillService,
          call: { company: "Mercari", role: "Backend Engineer", url: "https://example.com/jobs/42" })
      )
    end

    # Rotate the source IP so the per-IP prefill throttle (also 10/min) can't
    # fire first — isolating the per-account cap under test.
    it "returns 429 after 10 prefills for one account within 1 minute" do
      token = jwt_for(user)
      10.times do |i|
        post "/api/v1/applications/prefill",
          params: { url: "https://example.com/jobs/42" }, as: :json,
          headers: { "Authorization" => token, "REMOTE_ADDR" => "198.51.100.#{i}" }
        expect(response).to have_http_status(:ok)
      end

      post "/api/v1/applications/prefill",
        params: { url: "https://example.com/jobs/42" }, as: :json,
        headers: { "Authorization" => token, "REMOTE_ADDR" => "198.51.100.200" }

      expect(response).to have_http_status(:too_many_requests)
      expect(response.headers["Retry-After"]).to eq("60")
    end

    it "caps each account independently" do
      token = jwt_for(user)
      10.times do |i|
        post "/api/v1/applications/prefill",
          params: { url: "https://example.com/jobs/42" }, as: :json,
          headers: { "Authorization" => token, "REMOTE_ADDR" => "198.51.100.#{i}" }
      end

      other = create(:user)
      post "/api/v1/applications/prefill",
        params: { url: "https://example.com/jobs/42" }, as: :json,
        headers: { "Authorization" => jwt_for(other), "REMOTE_ADDR" => "198.51.100.201" }

      expect(response).to have_http_status(:ok)
    end
  end

  # Not a money vector but a work vector: /exports/account reads every blob the user owns
  # and assembles the zip in memory, so a signed-in client looping it is the cheapest way
  # to push the app over its memory ceiling. Capped per-account, so rotating the source IP
  # (as below) buys an attacker nothing.
  describe "GET /api/v1/exports — per-account cap" do
    let(:user) { create(:user) }

    it "returns 429 after 10 exports for one account within 1 minute" do
      token = jwt_for(user)
      10.times do |i|
        get "/api/v1/exports/account",
          headers: { "Authorization" => token, "REMOTE_ADDR" => "198.51.100.#{i}" }
        expect(response).to have_http_status(:ok)
      end

      get "/api/v1/exports/account",
        headers: { "Authorization" => token, "REMOTE_ADDR" => "198.51.100.200" }

      expect(response).to have_http_status(:too_many_requests)
      expect(response.headers["Retry-After"]).to eq("60")
    end

    # One budget across both endpoints — the cost is a function of whose data is being
    # assembled, not of which URL asked for it.
    it "counts both export endpoints against the same budget" do
      token = jwt_for(user)
      10.times { get "/api/v1/exports/applications", headers: { "Authorization" => token } }

      get "/api/v1/exports/account", headers: { "Authorization" => token }
      expect(response).to have_http_status(:too_many_requests)
    end

    it "caps each account independently" do
      token = jwt_for(user)
      10.times { get "/api/v1/exports/account", headers: { "Authorization" => token } }

      get "/api/v1/exports/account", headers: { "Authorization" => jwt_for(create(:user)) }
      expect(response).to have_http_status(:ok)
    end
  end

  # The upload path. These bound CPU and write I/O, not storage — an upload overwrites, so a
  # PATCH loop's footprint stays flat, and Application::MAX_PER_USER is what bounds the total.
  # Capped per-account, so rotating the source IP (as below) buys an attacker nothing.
  describe "writes to /api/v1/applications — per-account cap" do
    let(:user)   { create(:user) }
    let(:record) { create(:application, :draft, user: user) }

    def edit(token, note, ip)
      patch "/api/v1/applications/#{record.id}",
        params: { application: { notes: note } }, as: :json,
        headers: { "Authorization" => token, "REMOTE_ADDR" => ip }
    end

    it "returns 429 after 30 writes for one account within 1 minute" do
      token = jwt_for(user)
      30.times do |i|
        edit(token, "edit #{i}", "198.51.100.#{i}")
        expect(response).to have_http_status(:ok)
      end

      edit(token, "one too many", "198.51.100.200")

      expect(response).to have_http_status(:too_many_requests)
      expect(response.headers["Retry-After"]).to eq("60")
    end

    # One budget across both verbs: creating an application and uploading to one are the same
    # cost, and an attacker choosing between them should not get two budgets.
    it "counts a create against the same budget as an update" do
      token = jwt_for(user)
      30.times { |i| edit(token, "edit #{i}", "198.51.100.#{i}") }

      post "/api/v1/applications",
        params: { application: { company: "Mercari", role: "Backend Engineer" } }, as: :json,
        headers: { "Authorization" => token }

      expect(response).to have_http_status(:too_many_requests)
    end

    it "caps each account independently" do
      token = jwt_for(user)
      30.times { |i| edit(token, "edit #{i}", "198.51.100.#{i}") }

      other = create(:user)
      post "/api/v1/applications",
        params: { application: { company: "Mercari", role: "Backend Engineer" } }, as: :json,
        headers: { "Authorization" => jwt_for(other) }

      expect(response).to have_http_status(:created)
    end

    # The path regex is anchored on /\d+\z precisely so the neighbours keep their own treatment.
    it "does not count a transition, which is a different path with a different cost" do
      token = jwt_for(user)
      30.times { |i| edit(token, "edit #{i}", "198.51.100.#{i}") }

      patch "/api/v1/applications/#{record.id}/transition",
        params: { status: "applied" }, as: :json, headers: { "Authorization" => token }

      expect(response).to have_http_status(:ok)
    end

    # DELETE is the one write that gives storage back — throttling it would be perverse.
    it "does not throttle a delete" do
      token = jwt_for(user)
      30.times { |i| edit(token, "edit #{i}", "198.51.100.#{i}") }

      delete "/api/v1/applications/#{record.id}", headers: { "Authorization" => token }

      expect(response).to have_http_status(:no_content)
    end
  end

  # Every throttle above proves itself on the canonical path — the input we already knew
  # reached the guard. These prove an input we didn't: Rack::Attack runs above the router, so
  # it sees raw PATH_INFO, while Rails routes "/api/v1/auth/sign_in.json" to the very same
  # action. Each request below reached its controller while matching no throttle at all until
  # Rack::Attack.normalized_path existed. The 429 is the assertion; the point is that the
  # counter saw the request. See SPEC.md § Security.
  #
  # Only the .json form is testable here. Rack::Test rewrites the URI before it builds the
  # env, so a trailing or doubled slash arrives at the middleware already collapsed and a
  # spec written at this level would pass with or without the fix. Those forms are covered in
  # spec/lib/rack_attack_normalized_path_spec.rb, which builds the env by hand — the only
  # level at which the assertion can fail.
  describe "path normalization — a throttle must not be opt-out by suffix" do
    # Exhausts the budget on the canonical path, then spends the bypass form: a 429 proves
    # the two share one counter, which is stronger than the bypass form merely counting
    # itself.
    describe "POST /api/v1/auth/sign_in" do
      let(:body) { { user: { email: "nobody@example.com", password: "wrongpass" } } }

      it "counts a .json suffix against the per-IP budget" do
        5.times { post "/api/v1/auth/sign_in", params: body, as: :json }

        post "/api/v1/auth/sign_in.json", params: body, as: :json

        expect(response).to have_http_status(:too_many_requests)
      end

      # The email-keyed backstop is the one that survives an IP-rotating attacker, so it is
      # the one whose bypass matters most: rotate the IP so only the email key can fire.
      it "counts a .json suffix against the email-keyed budget" do
        10.times do |i|
          post "/api/v1/auth/sign_in", params: body, as: :json,
            headers: { "REMOTE_ADDR" => "203.0.113.#{i}" }
        end

        post "/api/v1/auth/sign_in.json", params: body, as: :json,
          headers: { "REMOTE_ADDR" => "203.0.113.200" }

        expect(response).to have_http_status(:too_many_requests)
      end
    end

    describe "POST /api/v1/applications/prefill" do
      let(:user) { create(:user) }

      before do
        allow(Applications::UrlPrefillService).to receive(:new).and_return(
          instance_double(Applications::UrlPrefillService,
            call: { company: "Mercari", role: "Backend Engineer", url: "https://example.com/jobs/42" })
        )
      end

      it "counts a .json suffix against the per-account budget" do
        token = jwt_for(user)
        10.times do |i|
          post "/api/v1/applications/prefill",
            params: { url: "https://example.com/jobs/42" }, as: :json,
            headers: { "Authorization" => token, "REMOTE_ADDR" => "198.51.100.#{i}" }
        end

        post "/api/v1/applications/prefill.json",
          params: { url: "https://example.com/jobs/42" }, as: :json,
          headers: { "Authorization" => token, "REMOTE_ADDR" => "198.51.100.200" }

        expect(response).to have_http_status(:too_many_requests)
      end
    end

    describe "writes to /api/v1/applications" do
      let(:user)   { create(:user) }
      let(:record) { create(:application, :draft, user: user) }

      def exhaust(token)
        30.times do |i|
          patch "/api/v1/applications/#{record.id}",
            params: { application: { notes: "edit #{i}" } }, as: :json,
            headers: { "Authorization" => token, "REMOTE_ADDR" => "198.51.100.#{i}" }
        end
      end

      it "counts a .json suffix on a create" do
        token = jwt_for(user)
        exhaust(token)

        post "/api/v1/applications.json",
          params: { application: { company: "Mercari", role: "Backend Engineer" } }, as: :json,
          headers: { "Authorization" => token }

        expect(response).to have_http_status(:too_many_requests)
      end

      it "counts a .json suffix on an update" do
        token = jwt_for(user)
        exhaust(token)

        patch "/api/v1/applications/#{record.id}.json",
          params: { application: { notes: "one too many" } }, as: :json,
          headers: { "Authorization" => token }

        expect(response).to have_http_status(:too_many_requests)
      end
    end
  end
end
