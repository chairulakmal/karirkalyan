require "swagger_helper"

RSpec.describe "Applications", type: :request do
  let(:user) { create(:user) }

  path "/api/v1/applications" do
    get "List applications (scoped to current user)" do
      tags "Applications"
      security [ bearerAuth: [] ]
      produces "application/json"

      response "200", "paginated envelope with data + meta" do
        let(:Authorization) { jwt_for(user) }
        before { create_list(:application, 2, :applied, user: user) }

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
    post "Pre-fill application fields from a job URL (AI extraction)" do
      tags "Applications"
      security [ bearerAuth: [] ]
      consumes "application/json"
      produces "application/json"
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: { url: { type: :string, example: "https://example.com/jobs/42" } },
        required: %w[url]
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

      response "422", "bad or private/internal URL" do
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

      response "200", "resume binary (Content-Disposition: attachment)" do
        let(:Authorization) { jwt_for(user) }
        let(:record)           { create(:application, :with_resume, user: user) }
        let(:id)            { record.id }
        run_test! do |response|
          expect(response.content_type).to include("application/pdf")
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

      response "200", "cover letter binary (Content-Disposition: attachment)" do
        let(:Authorization) { jwt_for(user) }
        let(:record)           { create(:application, :with_cover_letter, user: user) }
        let(:id)            { record.id }
        run_test! do |response|
          expect(response.content_type).to include("application/pdf")
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
      3.times { |i| create(:application, user: user, created_at: (3 - i).hours.ago) }
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
      create(:application, user: user, status: "applied",      created_at: 3.hours.ago)
      create(:application, user: user, status: "applied",      created_at: 2.hours.ago)
      create(:application, user: user, status: "phone_screen", created_at: 1.hour.ago)
    end

    it "returns only applications matching the requested status" do
      get "/api/v1/applications?status=applied", headers: headers
      body = JSON.parse(response.body)
      expect(response).to have_http_status(:ok)
      expect(body["data"].length).to eq(2)
      expect(body["data"].map { |a| a["status"] }.uniq).to eq([ "applied" ])
    end

    it "ignores unrecognised status values and returns all applications" do
      get "/api/v1/applications?status=invalid", headers: headers
      body = JSON.parse(response.body)
      expect(response).to have_http_status(:ok)
      expect(body["data"].length).to eq(3)
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
