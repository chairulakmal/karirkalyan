require "swagger_helper"

# PushVapid is stubbed both ways deliberately: dev has keys in .env and CI has
# none, and a spec must not change meaning between the two (SPEC.md § Testing
# strategy).
RSpec.describe "Push subscriptions", type: :request do
  let(:user)  { create(:user) }
  let(:token) { jwt_for(user) }

  before { allow(PushVapid).to receive_messages(configured?: true, public_key: "test-public-key") }

  path "/api/v1/push_subscriptions/public_key" do
    get "The VAPID public key the browser subscribes with" do
      tags "Push"
      produces "application/json"
      security [ bearerAuth: [] ]
      description <<~DESC
        Served rather than duplicated into a web-side env var, so the two services
        cannot drift (SPEC.md § Push notifications). 503 push_unavailable when the
        server has no VAPID keys — the rest of the app keeps working.
      DESC

      response "200", "the public key" do
        let(:Authorization) { token }
        run_test! do |response|
          expect(response.parsed_body).to eq("public_key" => "test-public-key")
        end
      end

      response "503", "push not configured on this server" do
        before { allow(PushVapid).to receive(:configured?).and_return(false) }
        let(:Authorization) { token }
        run_test! do |response|
          expect(response.parsed_body).to include("code" => "push_unavailable")
        end
      end
    end
  end

  path "/api/v1/push_subscriptions" do
    post "Register this browser's push subscription" do
      tags "Push"
      consumes "application/json"
      produces "application/json"
      security [ bearerAuth: [] ]
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          subscription: {
            type: :object,
            description: "The browser PushSubscription, serialized with toJSON()",
            properties: {
              endpoint: { type: :string },
              keys: {
                type: :object,
                properties: { p256dh: { type: :string }, auth: { type: :string } },
                required: %w[p256dh auth]
              }
            },
            required: %w[endpoint keys]
          }
        },
        required: %w[subscription]
      }

      response "201", "subscription registered" do
        let(:Authorization) { token }
        let(:body) do
          { subscription: { endpoint: "https://push.example/abc",
                            keys: { p256dh: "client-key", auth: "client-auth" } } }
        end

        run_test! do |response|
          expect(response.parsed_body.keys).to match_array(%w[id created_at])
          expect(user.push_subscriptions.sole.endpoint).to eq("https://push.example/abc")
        end
      end

      response "422", "validation failed — blank keys, or the per-user ceiling" do
        let(:Authorization) { token }
        let(:body) { { subscription: { endpoint: "https://push.example/abc", keys: {} } } }

        run_test! do |response|
          expect(response.parsed_body).to include("code" => "validation_failed")
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        let(:body) { {} }
        run_test!
      end
    end

    delete "Unsubscribe this browser — idempotent" do
      tags "Push"
      consumes "application/json"
      security [ bearerAuth: [] ]
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: { endpoint: { type: :string } },
        required: %w[endpoint]
      }

      response "204", "unsubscribed — a 204 even for an endpoint the server never knew, because the state the caller asked for is the state that obtains" do
        let(:Authorization) { token }
        let(:body) { { endpoint: create(:push_subscription, user: user).endpoint } }

        run_test! { expect(user.push_subscriptions.count).to eq(0) }
      end
    end
  end

  describe "upsert on endpoint" do
    it "updates keys in place instead of duplicating the row" do
      existing = create(:push_subscription, user: user)

      expect do
        post "/api/v1/push_subscriptions",
             params: { subscription: { endpoint: existing.endpoint,
                                       keys: { p256dh: "rotated", auth: "rotated-auth" } } },
             headers: { "Authorization" => token }, as: :json
      end.not_to change(PushSubscription, :count)

      expect(existing.reload.p256dh).to eq("rotated")
    end

    it "reassigns the row to whoever is signed in — the endpoint's owner is the browser" do
      previous_owner = create(:user)
      row = create(:push_subscription, user: previous_owner)

      post "/api/v1/push_subscriptions",
           params: { subscription: { endpoint: row.endpoint,
                                     keys: { p256dh: "new", auth: "new-auth" } } },
           headers: { "Authorization" => token }, as: :json

      expect(row.reload.user).to eq(user)
    end
  end

  describe "the per-user ceiling" do
    # stub_const to 1, the house pattern — bulk fixtures read as N+1 to prosopite.
    it "refuses a subscription past PushSubscription::MAX_PER_USER, through the standard envelope" do
      stub_const("PushSubscription::MAX_PER_USER", 1)
      create(:push_subscription, user: user)

      post "/api/v1/push_subscriptions",
           params: { subscription: { endpoint: "https://push.example/over",
                                     keys: { p256dh: "k", auth: "a" } } },
           headers: { "Authorization" => token }, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body["details"]).to include(
        { "field" => "base", "code" => "too_many_push_subscriptions" }
      )
    end
  end

  describe "unsubscribe scoping" do
    it "does not delete another user's row for the same endpoint" do
      other_row = create(:push_subscription)

      delete "/api/v1/push_subscriptions",
             params: { endpoint: other_row.endpoint },
             headers: { "Authorization" => token }, as: :json

      expect(response).to have_http_status(:no_content)
      expect(PushSubscription.exists?(other_row.id)).to be(true)
    end
  end

  describe "degradation without VAPID keys" do
    before { allow(PushVapid).to receive(:configured?).and_return(false) }

    it "refuses a subscribe with 503 push_unavailable, not a 500" do
      post "/api/v1/push_subscriptions",
           params: { subscription: { endpoint: "https://push.example/x",
                                     keys: { p256dh: "k", auth: "a" } } },
           headers: { "Authorization" => token }, as: :json

      expect(response).to have_http_status(:service_unavailable)
      expect(response.parsed_body["code"]).to eq("push_unavailable")
    end

    it "still allows unsubscribing — removing state needs no keys" do
      row = create(:push_subscription, user: user)

      delete "/api/v1/push_subscriptions", params: { endpoint: row.endpoint },
             headers: { "Authorization" => token }, as: :json

      expect(response).to have_http_status(:no_content)
    end
  end

  describe "erasing the account takes its subscriptions with it" do
    it "cascades push subscriptions on DELETE /api/v1/auth/account" do
      create(:push_subscription, user: user)

      expect do
        delete "/api/v1/auth/account", headers: { "Authorization" => token }
      end.to change(PushSubscription, :count).by(-1)
    end
  end
end
