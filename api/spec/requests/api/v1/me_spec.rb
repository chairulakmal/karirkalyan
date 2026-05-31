require "swagger_helper"

RSpec.describe "Me", type: :request do
  path "/api/v1/me" do
    get "Get the authenticated user's profile" do
      tags "Me"
      security [ bearerAuth: [] ]
      produces "application/json"

      response "200", "current user profile" do
        let(:user)          { create(:user, email: "me@example.com") }
        let(:Authorization) { jwt_for(user) }

        run_test! do |response|
          body = JSON.parse(response.body)
          expect(body["email"]).to eq("me@example.com")
          expect(body.keys).to include("id", "email", "created_at")
          expect(body.keys).not_to include("encrypted_password", "jti")
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test!
      end
    end
  end
end
