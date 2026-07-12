require "swagger_helper"
require "zip"

RSpec.describe "Exports", type: :request do
  let(:user) { create(:user) }

  path "/api/v1/exports/applications" do
    get "Download every application as CSV" do
      tags "Exports"
      security [ bearerAuth: [] ]
      produces "text/csv"
      description "A convenience view: one row per application, blobs excluded. " \
                  "The data-safety artefact is GET /api/v1/exports/account."

      response "200", "CSV of the user's applications" do
        let(:Authorization) { jwt_for(user) }
        before { create(:application, user: user, company: "Mercari") }

        run_test! do |response|
          expect(response.headers["Content-Type"]).to include("text/csv")
          expect(response.headers["Content-Disposition"]).to include("attachment", ".csv")
          # A CSV a browser sniffs as HTML is a stored-XSS delivery mechanism, and its
          # cells hold user-supplied company names.
          expect(response.headers["X-Content-Type-Options"]).to eq("nosniff")
          expect(response.body).to include("company", "Mercari")
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test!
      end
    end
  end

  path "/api/v1/exports/account" do
    get "Download the full account archive as a zip" do
      tags "Exports"
      security [ bearerAuth: [] ]
      produces "application/zip"
      description "account.json (user, applications, timeline) plus the stored resumes and " \
                  "cover letters. The leg of the backup story the user can pull themselves."

      response "200", "zip archive of the whole account" do
        let(:Authorization) { jwt_for(user) }
        before { create(:application, :with_resume, user: user, company: "Mercari") }

        run_test! do |response|
          expect(response.headers["Content-Type"]).to include("application/zip")
          expect(response.headers["Content-Disposition"]).to include("attachment", ".zip")
          expect(response.headers["X-Content-Type-Options"]).to eq("nosniff")

          zip = Zip::File.open_buffer(StringIO.new(response.body))
          expect(zip.entries.map(&:name)).to include("account.json")
          expect(JSON.parse(zip.read("account.json"))["schema_version"]).to be_present
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test!
      end
    end
  end

  # Both endpoints are current_user-scoped. Worth an explicit assertion rather than a
  # trust in the controller: an export that leaked another account would leak all of it.
  describe "scoping" do
    let(:other) { create(:user) }

    before do
      create(:application, user: other, company: "Somebody Else Inc")
      create(:application, user: user, company: "Mine")
    end

    it "never exports another account's applications in the CSV" do
      get "/api/v1/exports/applications", headers: { "Authorization" => jwt_for(user) }

      expect(response.body).to include("Mine")
      expect(response.body).not_to include("Somebody Else Inc")
    end

    it "never exports another account's applications in the archive" do
      get "/api/v1/exports/account", headers: { "Authorization" => jwt_for(user) }

      zip = Zip::File.open_buffer(StringIO.new(response.body))
      companies = JSON.parse(zip.read("account.json"))["applications"].map { |row| row["company"] }
      expect(companies).to eq([ "Mine" ])
    end
  end
end
