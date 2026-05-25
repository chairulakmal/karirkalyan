require "swagger_helper"

RSpec.describe "Applications", type: :request do
  let(:user) { create(:user) }

  path "/api/v1/applications" do
    get "List applications (scoped to current user)" do
      tags "Applications"
      security [bearerAuth: []]
      produces "application/json"

      response "200", "array of applications" do
        let(:Authorization) { jwt_for(user) }
        before { create_list(:application, 2, :applied, user: user) }

        run_test! do |response|
          data = JSON.parse(response.body)
          expect(data.length).to eq(2)
          expect(data.first.keys).to include("id", "company", "role", "status")
          expect(data.first.keys).not_to include("resume", "cover_letter")
        end
      end

      response "200", "does not return another user's applications" do
        let(:Authorization) { jwt_for(user) }
        before do
          create(:application, :applied, user: user)
          create(:application, :applied, user: create(:user))
        end

        run_test! do |response|
          expect(JSON.parse(response.body).length).to eq(1)
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test!
      end
    end

    post "Create an application" do
      tags "Applications"
      security [bearerAuth: []]
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
              status:       { type: :string, example: "wishlist" },
              url:          { type: :string },
              notes:        { type: :string },
              follow_up_at: { type: :string, format: "date-time" }
            },
            required: %w[company role]
          }
        },
        required: %w[application]
      }

      response "201", "application created" do
        let(:Authorization) { jwt_for(user) }
        let(:body) { { application: { company: "Basecamp", role: "Rails Engineer", status: "wishlist" } } }
        run_test!
      end

      response "422", "validation failed (blank company or role)" do
        let(:Authorization) { jwt_for(user) }
        let(:body) { { application: { company: "", role: "" } } }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:body) { { application: { company: "Basecamp", role: "Rails Engineer" } } }
        run_test!
      end
    end
  end

  path "/api/v1/applications/{id}" do
    parameter name: :id, in: :path, type: :integer

    get "Get a single application" do
      tags "Applications"
      security [bearerAuth: []]
      produces "application/json"

      response "200", "application found" do
        let(:Authorization) { jwt_for(user) }
        let(:app)           { create(:application, :applied, user: user) }
        let(:id)            { app.id }
        run_test!
      end

      response "404", "not found or belongs to another user" do
        let(:Authorization) { jwt_for(user) }
        let(:id)            { 0 }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:app)           { create(:application, user: user) }
        let(:id)            { app.id }
        run_test!
      end
    end

    patch "Update an application (text fields + file upload)" do
      tags "Applications"
      security [bearerAuth: []]
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
        let(:app)           { create(:application, :applied, user: user) }
        let(:id)            { app.id }
        let(:body)          { { application: { notes: "Strong Rails background", lock_version: app.lock_version } } }
        run_test!
      end

      response "409", "stale record — another request updated first; refresh and retry" do
        let(:Authorization) { jwt_for(user) }
        let(:app)           { create(:application, :applied, user: user) }
        let(:id)            { app.id }
        let(:body)          { { application: { notes: "Concurrent edit", lock_version: -1 } } }
        run_test!
      end

      response "422", "validation failed" do
        let(:Authorization) { jwt_for(user) }
        let(:app)           { create(:application, :applied, user: user) }
        let(:id)            { app.id }
        let(:body)          { { application: { company: "", lock_version: app.lock_version } } }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:app)           { create(:application, user: user) }
        let(:id)            { app.id }
        let(:body)          { { application: { notes: "test" } } }
        run_test!
      end
    end

    delete "Delete an application" do
      tags "Applications"
      security [bearerAuth: []]

      response "204", "application deleted" do
        let(:Authorization) { jwt_for(user) }
        let(:app)           { create(:application, user: user) }
        let(:id)            { app.id }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:app)           { create(:application, user: user) }
        let(:id)            { app.id }
        run_test!
      end
    end
  end

  path "/api/v1/applications/{id}/transition" do
    parameter name: :id, in: :path, type: :integer

    patch "Transition status via FSM" do
      tags "Applications"
      security [bearerAuth: []]
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
        let(:app)           { create(:application, :draft, user: user) }
        let(:id)            { app.id }
        let(:body)          { { status: "applied" } }

        run_test! do |response|
          data = JSON.parse(response.body)
          expect(data["status"]).to eq("applied")
          expect(TimelineEntry.where(application_id: app.id).count).to eq(1)
        end
      end

      response "422", "invalid transition (e.g. draft → offer)" do
        let(:Authorization) { jwt_for(user) }
        let(:app)           { create(:application, :draft, user: user) }
        let(:id)            { app.id }
        let(:body)          { { status: "offer" } }
        run_test!
      end

      response "409", "stale record" do
        let(:Authorization) { jwt_for(user) }
        let(:app)           { create(:application, :draft, user: user) }
        let(:id)            { app.id }
        let(:body)          { { status: "applied", lock_version: -1 } }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:app)           { create(:application, user: user) }
        let(:id)            { app.id }
        let(:body)          { { status: "applied" } }
        run_test!
      end
    end
  end

  path "/api/v1/applications/{id}/resume" do
    parameter name: :id, in: :path, type: :integer

    get "Download resume PDF" do
      tags "Applications"
      security [bearerAuth: []]
      produces "application/pdf"

      response "200", "resume binary (Content-Disposition: attachment)" do
        let(:Authorization) { jwt_for(user) }
        let(:app)           { create(:application, :with_resume, user: user) }
        let(:id)            { app.id }
        run_test! do |response|
          expect(response.content_type).to include("application/pdf")
        end
      end

      response "404", "no resume uploaded for this application" do
        let(:Authorization) { jwt_for(user) }
        let(:app)           { create(:application, user: user) }
        let(:id)            { app.id }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:app)           { create(:application, :with_resume, user: user) }
        let(:id)            { app.id }
        run_test!
      end
    end
  end

  path "/api/v1/applications/{id}/cover_letter" do
    parameter name: :id, in: :path, type: :integer

    get "Download cover letter PDF" do
      tags "Applications"
      security [bearerAuth: []]
      produces "application/pdf"

      response "200", "cover letter binary (Content-Disposition: attachment)" do
        let(:Authorization) { jwt_for(user) }
        let(:app)           { create(:application, :with_cover_letter, user: user) }
        let(:id)            { app.id }
        run_test! do |response|
          expect(response.content_type).to include("application/pdf")
        end
      end

      response "404", "no cover letter uploaded" do
        let(:Authorization) { jwt_for(user) }
        let(:app)           { create(:application, user: user) }
        let(:id)            { app.id }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:app)           { create(:application, :with_cover_letter, user: user) }
        let(:id)            { app.id }
        run_test!
      end
    end
  end

  # File upload — tested directly (multipart/form-data, not in OpenAPI spec)
  describe "file upload" do
    let(:app) { create(:application, :draft, user: user) }

    describe "PATCH /api/v1/applications/:id (resume)" do
      it "stores a valid PDF and sets resume_updated_at" do
        patch "/api/v1/applications/#{app.id}",
          params: { application: { resume: fake_pdf } },
          headers: { "Authorization" => jwt_for(user) }

        expect(response).to have_http_status(:ok)
        expect(app.reload.resume).to be_present
        expect(app.resume_updated_at).to be_present
      end

      it "rejects a non-PDF file" do
        fake_txt = Rack::Test::UploadedFile.new(StringIO.new("not a pdf"), "text/plain")
        patch "/api/v1/applications/#{app.id}",
          params: { application: { resume: fake_txt } },
          headers: { "Authorization" => jwt_for(user) }

        expect(response).to have_http_status(:unprocessable_entity)
      end
    end

    describe "PATCH /api/v1/applications/:id (cover_letter)" do
      it "stores a valid PDF and sets cover_letter_updated_at" do
        patch "/api/v1/applications/#{app.id}",
          params: { application: { cover_letter: fake_pdf } },
          headers: { "Authorization" => jwt_for(user) }

        expect(response).to have_http_status(:ok)
        expect(app.reload.cover_letter).to be_present
        expect(app.cover_letter_updated_at).to be_present
      end
    end
  end
end
