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

  describe "POST /api/v1/auth/sign_up" do
    it "returns 429 after 3 attempts from the same IP within 1 hour" do
      3.times do |i|
        post "/api/v1/auth/sign_up",
          params: { user: { email: "user#{i}@example.com", password: "password123" } },
          as: :json
        expect(response).to have_http_status(:created)
      end

      post "/api/v1/auth/sign_up",
        params: { user: { email: "fourth@example.com", password: "password123" } },
        as: :json

      expect(response).to have_http_status(:too_many_requests)
      expect(response.headers["Retry-After"]).to eq("3600")
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
end
