require "swagger_helper"

RSpec.describe "Dashboard", type: :request do
  let(:user) { create(:user) }

  path "/api/v1/dashboard" do
    get "Application stats for the current user" do
      tags "Dashboard"
      security [ bearerAuth: [] ]
      produces "application/json"

      response "200", "stats aggregation" do
        let(:Authorization) { jwt_for(user) }

        before do
          create(:application, :applied,      user: user)
          create(:application, :applied,      user: user)
          create(:application, :phone_screen, user: user)
          create(:application, user: user, status: "rejected")
          create(:application, :applied, user: create(:user)) # another user — must not appear
        end

        run_test! do |response|
          data = JSON.parse(response.body)
          expect(data).to include("by_status", "total")
          expect(data["by_status"]["applied"]).to eq(2)
          expect(data["by_status"]["phone_screen"]).to eq(1)
          expect(data["by_status"]["rejected"]).to eq(1)
          expect(data["total"]).to eq(4)
        end
      end

      response "200", "empty stats when user has no applications" do
        let(:Authorization) { jwt_for(user) }

        run_test! do |response|
          data = JSON.parse(response.body)
          expect(data["total"]).to eq(0)
          expect(data["by_status"]).to eq({})
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test!
      end
    end
  end

  describe "avg_days_to_offer uses the timeline entry timestamp" do
    let(:headers) { { "Authorization" => jwt_for(user) } }

    it "calculates days from applied_at to the offer timeline entry, not updated_at" do
      app = create(:application, user: user, status: "accepted",
                   applied_at: 30.days.ago, updated_at: 1.day.ago)
      create(:timeline_entry, application: app, actor: user,
             from_status: "final_round", to_status: "offer",
             created_at: 10.days.ago)

      get "/api/v1/dashboard", headers: headers
      data = JSON.parse(response.body)

      # 30 days ago → offer 10 days ago = ~20 days, not ~29 days (updated_at drift)
      expect(data["avg_days_to_offer"]).to be_within(0.5).of(20.0)
    end

    it "returns nil when no qualifying applications exist" do
      create(:application, user: user, status: "applied")

      get "/api/v1/dashboard", headers: headers
      data = JSON.parse(response.body)
      expect(data["avg_days_to_offer"]).to be_nil
    end
  end
end
