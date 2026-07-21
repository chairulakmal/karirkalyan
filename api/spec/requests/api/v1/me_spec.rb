require "swagger_helper"

RSpec.describe "Me", type: :request do
  path "/api/v1/me" do
    get "Get the authenticated user's profile" do
      tags "Me"
      security [ bearerAuth: [] ]
      produces "application/json"

      response "200", "current user profile (residence fields, days-remaining, and the visa reference)" do
        let(:user) do
          create(:user, email: "me@example.com",
                 residence_status: "engineer_specialist",
                 residence_expires_on: Date.current + 45)
        end
        let(:Authorization) { jwt_for(user) }

        run_test! do |response|
          body = JSON.parse(response.body)
          expect(body["email"]).to eq("me@example.com")
          expect(body.keys).to include("id", "email", "created_at")
          expect(body.keys).not_to include("encrypted_password", "jti")
          expect(body["residence_status"]).to eq("engineer_specialist")
          # Derived, never stored.
          expect(body["residence_days_remaining"]).to eq(45)
          # The perishable reference the settings guidance renders from.
          expect(body["reference"]["coe_lead_time_days"]).to eq(Visa::COE_LEAD_TIME_DAYS)
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test!
      end
    end

    patch "Update the authenticated user's residence status" do
      tags "Me"
      security [ bearerAuth: [] ]
      consumes "application/json"
      produces "application/json"

      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          user: {
            type: :object,
            properties: {
              residence_status: { type: :string, enum: User::RESIDENCE_STATUSES, nullable: true },
              residence_expires_on: { type: :string, format: "date", nullable: true }
            }
          }
        },
        required: %w[user]
      }

      response "200", "residence updated; days-remaining recomputed" do
        let(:user)          { create(:user) }
        let(:Authorization) { jwt_for(user) }
        let(:body) do
          { user: { residence_status: "highly_skilled", residence_expires_on: (Date.current + 100).iso8601 } }
        end
        run_test! do |response|
          payload = JSON.parse(response.body)
          expect(payload["residence_status"]).to eq("highly_skilled")
          expect(payload["residence_days_remaining"]).to eq(100)
        end
      end

      response "200", "a permanent resident has no clock, so days-remaining is null even with a date" do
        let(:user)          { create(:user) }
        let(:Authorization) { jwt_for(user) }
        let(:body) do
          { user: { residence_status: "permanent_resident", residence_expires_on: (Date.current + 100).iso8601 } }
        end
        run_test! do |response|
          expect(JSON.parse(response.body)["residence_days_remaining"]).to be_nil
        end
      end

      response "422", "an unknown residence status is rejected" do
        let(:user)          { create(:user) }
        let(:Authorization) { jwt_for(user) }
        let(:body)          { { user: { residence_status: "tourist" } } }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:body)          { { user: { residence_status: "other" } } }
        run_test!
      end
    end
  end
end
