require "swagger_helper"

RSpec.describe "Auth", type: :request do
  path "/api/v1/auth/sign_up" do
    post "Register a new account" do
      tags "Auth"
      consumes "application/json"
      produces "application/json"
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          user: {
            type: :object,
            properties: {
              email:    { type: :string, example: "user@example.com" },
              password: { type: :string, example: "password123" }
            },
            required: %w[email password]
          }
        },
        required: %w[user]
      }

      response "201", "account created" do
        let(:body) { { user: { email: "new@example.com", password: "password123" } } }
        run_test!
      end

      response "422", "validation failed (duplicate email or blank password)" do
        let(:existing) { create(:user, email: "taken@example.com") }
        let(:body)     { { user: { email: "taken@example.com", password: "password123" } } }
        before { existing }
        run_test!
      end
    end
  end

  path "/api/v1/auth/sign_in" do
    post "Sign in" do
      tags "Auth"
      consumes "application/json"
      produces "application/json"
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          user: {
            type: :object,
            properties: {
              email:    { type: :string },
              password: { type: :string }
            },
            required: %w[email password]
          }
        },
        required: %w[user]
      }

      response "200", "signed in — JWT returned in Authorization header" do
        let(:user) { create(:user) }
        let(:body) { { user: { email: user.email, password: "password123" } } }

        run_test! do |response|
          expect(response.headers["Authorization"]).to be_present
        end
      end

      response "401", "invalid credentials" do
        let(:body) { { user: { email: "nobody@example.com", password: "wrong" } } }
        run_test!
      end
    end
  end

  path "/api/v1/auth/sign_out" do
    delete "Sign out — rotates JTI to invalidate the token" do
      tags "Auth"
      security [bearerAuth: []]

      response "204", "signed out" do
        let(:user)          { create(:user) }
        let(:Authorization) { jwt_for(user) }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test!
      end
    end
  end
end
