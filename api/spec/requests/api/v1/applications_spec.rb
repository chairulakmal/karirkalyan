require "swagger_helper"

RSpec.describe "Applications", type: :request do
  let(:user) { create(:user) }

  path "/api/v1/applications" do
    get "List applications (scoped to current user)" do
      tags "Applications"
      security [ bearerAuth: [] ]
      produces "application/json"

      # Every filter is optional, and input the server cannot parse is ignored
      # rather than rejected — these arrive from navigation (a stale bookmark, a
      # hand-edited URL), not a form, so a 422 would be the wrong answer. The
      # filters AND together. Behaviour lives in Applications::ListQuery; these
      # blocks only publish it, since rswag emits nothing the spec does not
      # declare.
      parameter name: :status, in: :query, required: false, schema: { type: :string },
                description: "Comma-separated states, e.g. `applied,offer` — any member matches. " \
                             "Unknown states are dropped, and a list left with none is **unfiltered, " \
                             "not empty**: a query the server understood nothing of has told it nothing, " \
                             "so it must not answer with a blank page dressed as a real result. There is " \
                             "deliberately no query meaning \"show nothing\"."
      parameter name: :company, in: :query, required: false, schema: { type: :string },
                description: "Exact company name, case-sensitive. Unlike `status`, a name no application " \
                             "carries is a real filter and legitimately matches nothing — but blank or " \
                             "whitespace-only is ignored, like `status`, and returns everything."
      parameter name: :source, in: :query, required: false, schema: { type: :string },
                description: "Job board, matched as a case-insensitive substring of the URL (e.g. " \
                             "`linkedin.com`); there is no `source` column. Pass `(none)` for applications " \
                             "with no link. Like `company`, an unmatched value legitimately returns nothing, " \
                             "while blank or whitespace-only is ignored."
      parameter name: :after, in: :query, required: false, schema: { type: :string },
                description: "Cursor from a previous page's `meta.next_cursor` — an opaque Base64 " \
                             "timestamp. A malformed cursor returns the first page."
      parameter name: :limit, in: :query, required: false,
                schema: { type: :integer, minimum: 1, maximum: 100, default: 10 },
                description: "Page size, clamped to 1..100 rather than rejected. Non-numeric reads as 1; " \
                             "absent or empty reads as the default 10."

      response "200", "paginated envelope with data + meta" do
        let(:Authorization) { jwt_for(user) }
        before { without_n_plus_one_scanning { create_list(:application, 2, :applied, user: user) } }

        run_test! do |response|
          body = JSON.parse(response.body)
          expect(body["data"].length).to eq(2)
          expect(body["data"].first.keys).to include("id", "company", "role", "status")
          expect(body["data"].first.keys).not_to include("resume", "cover_letter")
          expect(body["meta"]).to include("has_more" => false, "next_cursor" => nil)
        end
      end

      response "200", "does not return another user's applications" do
        let(:Authorization) { jwt_for(user) }
        before do
          create(:application, :applied, user: user)
          create(:application, :applied, user: create(:user))
        end

        run_test! do |response|
          expect(JSON.parse(response.body)["data"].length).to eq(1)
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test!
      end
    end

    post "Create an application" do
      tags "Applications"
      security [ bearerAuth: [] ]
      consumes "application/json"
      produces "application/json"
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          application: {
            type: :object,
            properties: {
              company:      { type: :string, example: "Basecamp" },
              role:         { type: :string, example: "Rails Engineer" },
              status:       { type: :string, enum: ApplicationFSM::ENTRY_STATES, example: "applied",
                              description: "Initial state — one of the entry states (defaults to draft). Later changes go through /transition." },
              applied_at:   { type: :string, format: "date-time",
                              description: "Optional; only used when status is 'applied'. Backdates applied_at (defaults to now)." },
              url:          { type: :string },
              notes:        { type: :string },
              follow_up_at: { type: :string, format: "date-time" }
            },
            required: %w[company role]
          }
        },
        required: %w[application]
      }

      response "201", "created in a chosen entry state (wishlist)" do
        let(:Authorization) { jwt_for(user) }
        let(:body) { { application: { company: "Basecamp", role: "Rails Engineer", status: "wishlist" } } }
        run_test! do |response|
          expect(JSON.parse(response.body)["status"]).to eq("wishlist")
        end
      end

      response "201", "created as applied with a backdated applied_at" do
        let(:Authorization) { jwt_for(user) }
        let(:body) { { application: { company: "Mercari", role: "Backend Engineer", status: "applied", applied_at: "2026-05-20" } } }
        run_test! do |_response|
          record = user.applications.order(:created_at).last
          expect(record.status).to eq("applied")
          expect(record.applied_at.to_date).to eq(Date.new(2026, 5, 20))
        end
      end

      response "201", "defaults to draft when status is omitted" do
        let(:Authorization) { jwt_for(user) }
        let(:body) { { application: { company: "Cookpad", role: "SRE" } } }
        run_test! do |response|
          expect(JSON.parse(response.body)["status"]).to eq("draft")
        end
      end

      response "422", "rejects a non-entry initial state" do
        let(:Authorization) { jwt_for(user) }
        let(:body) { { application: { company: "DeNA", role: "PM", status: "offer" } } }
        run_test! do |response|
          payload = JSON.parse(response.body)
          expect(payload["error"]).to match(/must be one of/)
          expect(payload["code"]).to eq("validation_failed")
          expect(payload["details"]).to include("field" => "status", "code" => "inclusion")
        end
      end

      response "422", "validation failed (blank company or role)" do
        let(:Authorization) { jwt_for(user) }
        let(:body) { { application: { company: "", role: "" } } }
        run_test! do |response|
          payload = JSON.parse(response.body)
          expect(payload["error"]).to be_a(String)
          expect(payload["code"]).to eq("validation_failed")
          expect(payload["details"]).to include(
            { "field" => "company", "code" => "blank" },
            { "field" => "role",    "code" => "blank" }
          )
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:body) { { application: { company: "Basecamp", role: "Rails Engineer" } } }
        run_test!
      end
    end
  end

  describe "GET /api/v1/applications — filtering" do
    let(:headers) { { "Authorization" => jwt_for(user) } }

    it "filters by company (exact match)" do
      create(:application, company: "Mercari", user: user)
      create(:application, company: "Cookpad", user: user)

      get "/api/v1/applications", params: { company: "Mercari" }, headers: headers

      companies = JSON.parse(response.body)["data"].map { |a| a["company"] }
      expect(companies).to eq([ "Mercari" ])
    end

    it "filters by job board (URL host substring)" do
      create(:application, company: "Via LinkedIn", url: "https://www.linkedin.com/jobs/1", user: user)
      create(:application, company: "Via TokyoDev", url: "https://tokyodev.com/jobs/9", user: user)

      get "/api/v1/applications", params: { source: "linkedin.com" }, headers: headers

      companies = JSON.parse(response.body)["data"].map { |a| a["company"] }
      expect(companies).to eq([ "Via LinkedIn" ])
    end

    it "filters to applications with no link via the NONE sentinel" do
      create(:application, company: "No Link", url: nil, user: user)
      create(:application, company: "Has Link", url: "https://tokyodev.com/x", user: user)

      get "/api/v1/applications", params: { source: JobBoard::NONE }, headers: headers

      companies = JSON.parse(response.body)["data"].map { |a| a["company"] }
      expect(companies).to eq([ "No Link" ])
    end

    it "combines company and source filters" do
      create(:application, company: "Mercari", url: "https://www.linkedin.com/jobs/1", user: user)
      create(:application, company: "Mercari", url: "https://tokyodev.com/jobs/2", user: user)

      get "/api/v1/applications", params: { company: "Mercari", source: "tokyodev.com" }, headers: headers

      data = JSON.parse(response.body)["data"]
      expect(data.length).to eq(1)
      expect(data.first["url"]).to include("tokyodev.com")
    end
  end

  path "/api/v1/applications/prefill" do
    post "Pre-fill application fields from a job posting (AI extraction)" do
      tags "Applications"
      security [ bearerAuth: [] ]
      consumes "application/json"
      produces "application/json"
      # `url` or `text` — not both required, which is why neither is in `required`.
      # `text` is the fallback for a posting the fetcher cannot read, and it wins if
      # both arrive: nobody pastes a posting whose URL already worked.
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          url: {
            type:        :string,
            example:     "https://example.com/jobs/42",
            description: "The posting URL to fetch, strip, and extract. Supply this or `text`."
          },
          text: {
            type:        :string,
            example:     "Backend Engineer at Mercari. Tokyo, full-time. Ruby, Go…",
            description: "The posting text, already fetched by the user — use when `url` " \
                         "came back `prefill_blocked` or `prefill_failed`. Skips the fetch " \
                         "and runs the same extraction. Must be under 12,000 characters " \
                         "(`MAX_TEXT_CHARS`) **once stripped to text**, which is far more " \
                         "than 12,000 characters of markup allows; an over-cap paste is " \
                         "refused as `prefill_paste_too_long` rather than truncated. Takes " \
                         "precedence over `url`, which is then echoed back unfetched. " \
                         "Ignored unless it is a JSON string."
          }
        }
      }

      # The service fans out to an outbound fetch + a paid Claude call, so it is
      # stubbed here — request specs must not hit the network or the AI API.
      response "200", "extracted fields returned for the user to review" do
        let(:Authorization) { jwt_for(user) }
        let(:body)          { { url: "https://example.com/jobs/42" } }
        before do
          allow(Applications::UrlPrefillService).to receive(:new).and_return(
            instance_double(
              Applications::UrlPrefillService,
              call: { company: "Mercari", role: "Backend Engineer",
                      notes: "Tokyo, full-time.", url: "https://example.com/jobs/42" }
            )
          )
        end

        run_test! do |response|
          payload = JSON.parse(response.body)
          expect(payload).to include("company" => "Mercari", "role" => "Backend Engineer")
        end
      end

      # The paste fallback's front door. `text` has to reach the service as `text`:
      # if it were dropped, the request would quietly re-fetch the URL that just
      # failed and the user would see the same refusal twice.
      response "200", "extracted fields returned for the user to review" do
        let(:Authorization) { jwt_for(user) }
        let(:body) do
          { text: "Mercari — Backend Engineer. Tokyo, full-time.",
            url:  "https://blocked.example/jobs/42" }
        end
        before do
          allow(Applications::UrlPrefillService).to receive(:new)
            .with("https://blocked.example/jobs/42",
                  text: "Mercari — Backend Engineer. Tokyo, full-time.")
            .and_return(
              instance_double(
                Applications::UrlPrefillService,
                call: { company: "Mercari", role: "Backend Engineer",
                        notes: "Tokyo, full-time.", url: "https://blocked.example/jobs/42" }
              )
            )
        end

        run_test! do |response|
          payload = JSON.parse(response.body)
          expect(payload).to include("company" => "Mercari",
                                     "url"     => "https://blocked.example/jobs/42")
        end
      end

      response "422", "the URL is unusable (invalid_url), or the site refused an automated reader (prefill_blocked)" do
        let(:Authorization) { jwt_for(user) }
        let(:body)          { { url: "http://10.0.0.1/admin" } }
        before do
          service = instance_double(Applications::UrlPrefillService)
          allow(service).to receive(:call)
            .and_raise(Applications::UrlPrefillService::InvalidUrlError, "That URL points to a private or internal address.")
          allow(Applications::UrlPrefillService).to receive(:new).and_return(service)
        end

        run_test! do |response|
          expect(JSON.parse(response.body)).to include("error", "code" => "invalid_url")
        end
      end

      # A JSON object in `text` is not a paste. ActionController::Parameters#to_s is
      # a hash inspection, which is `present?` — so without the controller's type
      # guard it would take the paste branch and be billed to us as a Claude call on
      # garbage. Deliberately *not* stubbed: the point is that the real thing
      # refuses, and it never reaches the network to do so.
      response "422", "the URL is unusable (invalid_url), or the site refused an automated reader (prefill_blocked)" do
        let(:Authorization) { jwt_for(user) }
        let(:body)          { { text: { a: 1 } } }

        run_test! do |response|
          expect(JSON.parse(response.body)).to include("error", "code" => "invalid_url")
        end
      end

      # BlockedError subclasses FetchError, which subclasses Error — so this also
      # pins the rescue order the controller depends on. Get it wrong and the code
      # silently regresses to `invalid_url`, which is the bug v1.4.3 fixes.
      response "422", "the URL is unusable (invalid_url), or the site refused an automated reader (prefill_blocked)" do
        let(:Authorization) { jwt_for(user) }
        let(:body)          { { url: "https://www.tokyodev.com/companies/x/jobs/y" } }
        before do
          service = instance_double(Applications::UrlPrefillService)
          allow(service).to receive(:call)
            .and_raise(Applications::UrlPrefillService::BlockedError, "That site blocks automated readers.")
          allow(Applications::UrlPrefillService).to receive(:new).and_return(service)
        end

        run_test! do |response|
          expect(JSON.parse(response.body)).to include("error", "code" => "prefill_blocked")
        end
      end

      # The paste's own refusal. It is a 422 beside invalid_url and prefill_blocked
      # rather than a 502: nothing upstream failed, the input is simply too big.
      response "422", "the paste exceeds the cap once stripped (prefill_paste_too_long)" do
        let(:Authorization) { jwt_for(user) }
        let(:body)          { { text: "あ" * 20_000 } }
        before do
          service = instance_double(Applications::UrlPrefillService)
          allow(service).to receive(:call)
            .and_raise(Applications::UrlPrefillService::PasteTooLongError,
                       "That paste is 20000 characters once formatting is stripped, " \
                       "and the limit is 12000. Trim it and try again.")
          allow(Applications::UrlPrefillService).to receive(:new).and_return(service)
        end

        run_test! do |response|
          expect(JSON.parse(response.body)).to include("error", "code" => "prefill_paste_too_long")
        end
      end

      response "502", "the page could not be fetched (prefill_unreachable), or it was fetched and yielded no posting (prefill_failed)" do
        let(:Authorization) { jwt_for(user) }
        let(:body)          { { url: "https://example.com/jobs/42" } }
        before do
          service = instance_double(Applications::UrlPrefillService)
          allow(service).to receive(:call)
            .and_raise(Applications::UrlPrefillService::FetchError, "Couldn't reach that URL.")
          allow(Applications::UrlPrefillService).to receive(:new).and_return(service)
        end

        run_test! do |response|
          expect(JSON.parse(response.body)).to include("error", "code" => "prefill_unreachable")
        end
      end

      # The fetch worked; the page had nothing in it. Reporting this as
      # unreachable would swap one lie for another, so it gets its own rescue —
      # and UnreadableError does not subclass FetchError, which is what keeps
      # the branch above from swallowing it.
      response "502", "the page could not be fetched (prefill_unreachable), or it was fetched and yielded no posting (prefill_failed)" do
        let(:Authorization) { jwt_for(user) }
        let(:body)          { { url: "https://example.com/spa-shell" } }
        before do
          service = instance_double(Applications::UrlPrefillService)
          allow(service).to receive(:call)
            .and_raise(Applications::UrlPrefillService::UnreadableError, "That page had no readable text to work with.")
          allow(Applications::UrlPrefillService).to receive(:new).and_return(service)
        end

        run_test! do |response|
          expect(JSON.parse(response.body)).to include("error", "code" => "prefill_failed")
        end
      end

      response "503", "ANTHROPIC_API_KEY is not configured" do
        let(:Authorization) { jwt_for(user) }
        let(:body)          { { url: "https://example.com/jobs/42" } }
        before do
          service = instance_double(Applications::UrlPrefillService)
          allow(service).to receive(:call)
            .and_raise(Applications::UrlPrefillService::ConfigError, "URL pre-fill is not configured.")
          allow(Applications::UrlPrefillService).to receive(:new).and_return(service)
        end

        run_test! do |response|
          expect(JSON.parse(response.body)).to include("error", "code" => "prefill_unavailable")
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:body)          { { url: "https://example.com/jobs/42" } }
        run_test! do |response|
          expect(JSON.parse(response.body)["code"]).to eq("unauthenticated")
        end
      end
    end
  end

  path "/api/v1/applications/{id}" do
    parameter name: :id, in: :path, type: :integer

    get "Get a single application" do
      tags "Applications"
      security [ bearerAuth: [] ]
      produces "application/json"

      response "200", "application found" do
        let(:Authorization) { jwt_for(user) }
        let(:record)           { create(:application, :applied, user: user) }
        let(:id)            { record.id }
        run_test!
      end

      response "404", "not found or belongs to another user" do
        let(:Authorization) { jwt_for(user) }
        let(:id)            { 0 }
        run_test! do |response|
          expect(JSON.parse(response.body)).to include("error", "code" => "not_found")
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:record)           { create(:application, user: user) }
        let(:id)            { record.id }
        run_test!
      end
    end

    patch "Update an application (text fields + file upload)" do
      tags "Applications"
      security [ bearerAuth: [] ]
      consumes "application/json"
      produces "application/json"
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          application: {
            type: :object,
            properties: {
              company:      { type: :string },
              role:         { type: :string },
              url:          { type: :string },
              notes:        { type: :string },
              follow_up_at: { type: :string, format: "date-time" },
              lock_version: { type: :integer,
                              description: "Must match current record version to prevent concurrent overwrites" }
            }
          }
        },
        required: %w[application]
      }

      response "200", "application updated" do
        let(:Authorization) { jwt_for(user) }
        let(:record)           { create(:application, :applied, user: user) }
        let(:id)            { record.id }
        let(:body)          { { application: { notes: "Strong Rails background", lock_version: record.lock_version } } }
        run_test!
      end

      response "409", "stale record — another request updated first; refresh and retry" do
        let(:Authorization) { jwt_for(user) }
        let(:record)           { create(:application, :applied, user: user) }
        let(:id)            { record.id }
        let(:body)          { { application: { notes: "Concurrent edit", lock_version: -1 } } }
        run_test! do |response|
          expect(JSON.parse(response.body)["code"]).to eq("stale_record")
        end
      end

      response "422", "validation failed" do
        let(:Authorization) { jwt_for(user) }
        let(:record)           { create(:application, :applied, user: user) }
        let(:id)            { record.id }
        let(:body)          { { application: { company: "", lock_version: record.lock_version } } }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:record)           { create(:application, user: user) }
        let(:id)            { record.id }
        let(:body)          { { application: { notes: "test" } } }
        run_test!
      end
    end

    delete "Delete an application" do
      tags "Applications"
      security [ bearerAuth: [] ]

      response "204", "application deleted" do
        let(:Authorization) { jwt_for(user) }
        let(:record)           { create(:application, user: user) }
        let(:id)            { record.id }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:record)           { create(:application, user: user) }
        let(:id)            { record.id }
        run_test!
      end
    end
  end

  path "/api/v1/applications/{id}/transition" do
    parameter name: :id, in: :path, type: :integer

    patch "Transition status via FSM" do
      tags "Applications"
      security [ bearerAuth: [] ]
      consumes "application/json"
      produces "application/json"
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          status: {
            type: :string,
            enum: ApplicationFSM::VALID_STATES,
            description: "Target state. Must be a valid FSM transition from the current status."
          }
        },
        required: %w[status]
      }

      response "200", "status transitioned and timeline entry written" do
        let(:Authorization) { jwt_for(user) }
        let(:record)           { create(:application, :draft, user: user) }
        let(:id)            { record.id }
        let(:body)          { { status: "applied" } }

        run_test! do |response|
          data = JSON.parse(response.body)
          expect(data["status"]).to eq("applied")
          expect(TimelineEntry.where(application_id: record.id).count).to eq(1)
        end
      end

      response "422", "invalid transition (e.g. draft → offer)" do
        let(:Authorization) { jwt_for(user) }
        let(:record)           { create(:application, :draft, user: user) }
        let(:id)            { record.id }
        let(:body)          { { status: "offer" } }
        run_test! do |response|
          expect(JSON.parse(response.body)).to include("error", "code" => "invalid_transition")
        end
      end

      response "409", "stale record" do
        let(:Authorization) { jwt_for(user) }
        let(:record)           { create(:application, :draft, user: user) }
        let(:id)            { record.id }
        let(:body)          { { status: "applied", lock_version: -1 } }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:record)           { create(:application, user: user) }
        let(:id)            { record.id }
        let(:body)          { { status: "applied" } }
        run_test!
      end
    end
  end

  path "/api/v1/applications/{id}/resume" do
    parameter name: :id, in: :path, type: :integer

    get "Download resume PDF" do
      tags "Applications"
      security [ bearerAuth: [] ]
      produces "application/pdf"

      response "200", "resume binary (Content-Disposition: inline, named after the application)" do
        let(:Authorization) { jwt_for(user) }
        let(:record)        { create(:application, :with_resume, user: user, company: "Mercari", role: "Backend Engineer") }
        let(:id)            { record.id }
        run_test! do |response|
          expect(response.content_type).to include("application/pdf")
          expect(response.headers["Content-Disposition"])
            .to match(/\Ainline; filename="Mercari-Backend-Engineer-\d{4}-#{record.id}-resume\.pdf"/)
        end
      end

      response "404", "no resume uploaded for this application" do
        let(:Authorization) { jwt_for(user) }
        let(:record)           { create(:application, user: user) }
        let(:id)            { record.id }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:record)           { create(:application, :with_resume, user: user) }
        let(:id)            { record.id }
        run_test!
      end
    end
  end

  path "/api/v1/applications/{id}/cover_letter" do
    parameter name: :id, in: :path, type: :integer

    get "Download cover letter PDF" do
      tags "Applications"
      security [ bearerAuth: [] ]
      produces "application/pdf"

      response "200", "cover letter binary (Content-Disposition: inline, named after the application)" do
        let(:Authorization) { jwt_for(user) }
        let(:record)        { create(:application, :with_cover_letter, user: user, company: "Mercari", role: "Backend Engineer") }
        let(:id)            { record.id }
        run_test! do |response|
          expect(response.content_type).to include("application/pdf")
          expect(response.headers["Content-Disposition"])
            .to match(/\Ainline; filename="Mercari-Backend-Engineer-\d{4}-#{record.id}-cover-letter\.pdf"/)
        end
      end

      response "404", "no cover letter uploaded" do
        let(:Authorization) { jwt_for(user) }
        let(:record)           { create(:application, user: user) }
        let(:id)            { record.id }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:record)           { create(:application, :with_cover_letter, user: user) }
        let(:id)            { record.id }
        run_test!
      end
    end
  end

  # Cursor-based pagination
  describe "GET /api/v1/applications — cursor pagination" do
    let(:headers) { { "Authorization" => jwt_for(user) } }

    before do
      without_n_plus_one_scanning do
        3.times { |i| create(:application, user: user, created_at: (3 - i).hours.ago) }
      end
    end

    it "returns data envelope and meta.has_more false when records fit in one page" do
      get "/api/v1/applications", headers: headers
      body = JSON.parse(response.body)
      expect(response).to have_http_status(:ok)
      expect(body["data"].length).to eq(3)
      expect(body["meta"]["has_more"]).to be false
      expect(body["meta"]["next_cursor"]).to be_nil
    end

    it "returns has_more true and a next_cursor when records exceed the limit" do
      get "/api/v1/applications?limit=2", headers: headers
      body = JSON.parse(response.body)
      expect(body["data"].length).to eq(2)
      expect(body["meta"]["has_more"]).to be true
      expect(body["meta"]["next_cursor"]).to be_a(String)
    end

    it "returns the correct next page when given an after cursor" do
      get "/api/v1/applications?limit=2", headers: headers
      cursor = JSON.parse(response.body)["meta"]["next_cursor"]

      get "/api/v1/applications?limit=2&after=#{cursor}", headers: headers
      body = JSON.parse(response.body)
      expect(body["data"].length).to eq(1)
      expect(body["meta"]["has_more"]).to be false
    end
  end

  describe "GET /api/v1/applications — status filter" do
    let(:headers) { { "Authorization" => jwt_for(user) } }

    before do
      create(:application, user: user, status: "applied",      company: "Mercari", created_at: 4.hours.ago)
      create(:application, user: user, status: "applied",      company: "DeNA",    created_at: 3.hours.ago)
      create(:application, user: user, status: "phone_screen", company: "DeNA",    created_at: 2.hours.ago)
      create(:application, user: user, status: "offer",        company: "DeNA",    created_at: 1.hour.ago)
      create(:application, user: user, status: "rejected",     company: "DeNA",    created_at: 30.minutes.ago)
    end

    # Also the backward-compatibility case: `status=applied` is a one-element list now,
    # and the wire is unchanged for a client that only ever sends one.
    it "returns only applications matching the requested status" do
      get "/api/v1/applications?status=applied", headers: headers
      body = JSON.parse(response.body)
      expect(response).to have_http_status(:ok)
      expect(body["data"].length).to eq(2)
      expect(body["data"].map { |a| a["status"] }.uniq).to eq([ "applied" ])
    end

    it "matches a row in any state in the list" do
      get "/api/v1/applications?status=applied,offer", headers: headers
      body = JSON.parse(response.body)
      expect(response).to have_http_status(:ok)
      expect(body["data"].length).to eq(3)
      expect(body["data"].map { |a| a["status"] }.uniq).to match_array(%w[applied offer])
    end

    it "drops unknown members and filters by the ones it recognises" do
      get "/api/v1/applications?status=applied,teleported", headers: headers
      body = JSON.parse(response.body)
      expect(response).to have_http_status(:ok)
      expect(body["data"].map { |a| a["status"] }.uniq).to eq([ "applied" ])
    end

    # The list ORs within itself; it still ANDs against everything else.
    it "combines the list with the company filter" do
      get "/api/v1/applications?status=applied,offer&company=DeNA", headers: headers
      body = JSON.parse(response.body)
      expect(body["data"].length).to eq(2)
      expect(body["data"].map { |a| a["company"] }.uniq).to eq([ "DeNA" ])
      expect(body["data"].map { |a| a["status"] }.uniq).to match_array(%w[applied offer])
    end

    it "ignores unrecognised status values and returns all applications" do
      get "/api/v1/applications?status=invalid", headers: headers
      body = JSON.parse(response.body)
      expect(response).to have_http_status(:ok)
      expect(body["data"].length).to eq(5)
    end

    # `where(status: [])` matches zero rows silently, so every way of arriving at an empty
    # list has to land on the unfiltered page instead of a blank one that looks like an answer.
    context "when the list intersects VALID_STATES to nothing" do
      {
        "an empty param"         => "status=",
        "a single junk member"   => "status=junk",
        "all-junk members"       => "status=junk1,junk2",
        "nothing but separators" => "status=,,"
      }.each do |description, query|
        it "returns every application unfiltered for #{description}" do
          get "/api/v1/applications?#{query}", headers: headers
          body = JSON.parse(response.body)
          expect(response).to have_http_status(:ok)
          expect(body["data"]).not_to be_empty
          expect(body["data"].length).to eq(5)
        end
      end
    end

    it "combines status filter with cursor pagination" do
      get "/api/v1/applications?status=applied&limit=1", headers: headers
      body = JSON.parse(response.body)
      expect(body["meta"]["has_more"]).to be true
      cursor = body["meta"]["next_cursor"]

      get "/api/v1/applications?status=applied&limit=1&after=#{cursor}", headers: headers
      body2 = JSON.parse(response.body)
      expect(body2["data"].length).to eq(1)
      expect(body2["meta"]["has_more"]).to be false
    end
  end

  # The ceiling reports through the existing envelope rather than a new top-level code — the same
  # shape the 1 MB upload cap uses for `too_long`, so web/ needs no new branch to render it.
  describe "POST /api/v1/applications (the per-account ceiling)" do
    before { stub_const("Application::MAX_PER_USER", 1) }

    it "returns 422 validation_failed with a too_many_applications detail" do
      create(:application, user: user)

      post "/api/v1/applications",
        params: { application: { company: "Mercari", role: "Backend Engineer" } }, as: :json,
        headers: { "Authorization" => jwt_for(user) }

      expect(response).to have_http_status(:unprocessable_entity)
      payload = JSON.parse(response.body)
      expect(payload["code"]).to eq("validation_failed")
      expect(payload["details"]).to eq([ { "field" => "base", "code" => "too_many_applications" } ])
      expect(payload["error"]).to match(/limit of 1 applications/)
    end
  end

  # Header encoding — tested directly rather than through rswag, which keys a response by its
  # status code and so has room for exactly one 200 per path.
  describe "GET /api/v1/applications/:id/resume (a Japanese name in the header)" do
    # Rails emits both filenames without a gem: the legacy ASCII one transliterates, turning
    # every kanji into "?", and the RFC 5987 filename* carries the real name. Browsers prefer
    # filename*, which is what makes the model's decision not to transliterate reach the user.
    it "carries the unromanized name in filename*" do
      record = create(:application, :with_resume, user: user, company: "株式会社メルカリ", role: "エンジニア")

      get "/api/v1/applications/#{record.id}/resume", headers: { "Authorization" => jwt_for(user) }

      disposition = response.headers["Content-Disposition"]
      expect(disposition).to include("filename*=UTF-8''#{ERB::Util.url_encode('株式会社メルカリ-エンジニア')}-")
      # The transliterated "?" arrives percent-encoded, so the legacy name is unreadable —
      # which is fine, and exactly why filename* above is the one that matters.
      expect(disposition).to match(/filename="(?:%3F)+-(?:%3F)+-\d{4}-#{record.id}-resume\.pdf"/)
    end
  end

  # File upload — tested directly (multipart/form-data, not in OpenAPI spec)
  describe "file upload" do
    let(:record) { create(:application, :draft, user: user) }

    describe "POST /api/v1/applications (with files at creation)" do
      it "stores a resume when provided at creation" do
        post "/api/v1/applications",
          params: { application: { company: "Mercari", role: "Backend Engineer", resume: fake_pdf } },
          headers: { "Authorization" => jwt_for(user) }

        expect(response).to have_http_status(:created)
        expect(Application.last.resume).to be_present
        expect(Application.last.resume_updated_at).to be_present
      end

      it "stores both resume and cover letter when provided at creation" do
        post "/api/v1/applications",
          params: { application: { company: "Mercari", role: "Backend Engineer", resume: fake_pdf, cover_letter: fake_pdf } },
          headers: { "Authorization" => jwt_for(user) }

        expect(response).to have_http_status(:created)
        app = Application.last
        expect(app.resume).to be_present
        expect(app.cover_letter).to be_present
      end

      it "rejects a non-PDF file on create" do
        fake_txt = Rack::Test::UploadedFile.new(StringIO.new("not a pdf"), "text/plain", original_filename: "fake.txt")
        post "/api/v1/applications",
          params: { application: { company: "Mercari", role: "Backend Engineer", resume: fake_txt } },
          headers: { "Authorization" => jwt_for(user) }

        expect(response).to have_http_status(:unprocessable_entity)
      end

      it "rejects an over-1 MB upload with 422 without reading it into memory" do
        oversized = Rack::Test::UploadedFile.new(
          StringIO.new("%PDF-1.4" + ("a" * (Application::MAX_FILE_SIZE + 100))),
          "application/pdf", original_filename: "big.pdf"
        )
        post "/api/v1/applications",
          params: { application: { company: "Mercari", role: "Backend Engineer", resume: oversized } },
          headers: { "Authorization" => jwt_for(user) }

        expect(response).to have_http_status(:unprocessable_entity)
        payload = JSON.parse(response.body)
        expect(payload["error"]).to match(/under 1 MB/)
        expect(payload["code"]).to eq("validation_failed")
        expect(payload["details"]).to eq([ { "field" => "resume", "code" => "too_long" } ])
      end
    end

    describe "PATCH /api/v1/applications/:id (resume)" do
      it "stores a valid PDF and sets resume_updated_at" do
        patch "/api/v1/applications/#{record.id}",
          params: { application: { resume: fake_pdf } },
          headers: { "Authorization" => jwt_for(user) }

        expect(response).to have_http_status(:ok)
        expect(record.reload.resume).to be_present
        expect(record.resume_updated_at).to be_present
      end

      it "rejects a non-PDF file" do
        fake_txt = Rack::Test::UploadedFile.new(StringIO.new("not a pdf"), "text/plain", original_filename: "fake.txt")
        patch "/api/v1/applications/#{record.id}",
          params: { application: { resume: fake_txt } },
          headers: { "Authorization" => jwt_for(user) }

        expect(response).to have_http_status(:unprocessable_entity)
      end
    end

    describe "PATCH /api/v1/applications/:id (cover_letter)" do
      it "stores a valid PDF and sets cover_letter_updated_at" do
        patch "/api/v1/applications/#{record.id}",
          params: { application: { cover_letter: fake_pdf } },
          headers: { "Authorization" => jwt_for(user) }

        expect(response).to have_http_status(:ok)
        expect(record.reload.cover_letter).to be_present
        expect(record.cover_letter_updated_at).to be_present
      end
    end
  end
end
