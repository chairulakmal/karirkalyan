require "rails_helper"

RSpec.describe "Rack::Attack throttling", type: :request do
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
      expect(JSON.parse(response.body)["error"]).to match(/Too many requests/)
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
end
