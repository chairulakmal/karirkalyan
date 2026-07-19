require "swagger_helper"

RSpec.describe "Auth", type: :request do
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

      response "200", "signed in; JWT returned in Authorization header" do
        let(:user) { create(:user) }
        let(:body) { { user: { email: user.email, password: "password123" } } }

        run_test! do |response|
          expect(response.headers["Authorization"]).to be_present
        end
      end

      response "401", "invalid credentials" do
        let(:body) { { user: { email: "nobody@example.com", password: "wrong" } } }
        run_test! do |response|
          expect(JSON.parse(response.body)).to include("error", "code" => "invalid_credentials")
        end
      end
    end
  end

  path "/api/v1/auth/sign_out" do
    delete "Sign out (rotates JTI to invalidate the token)" do
      tags "Auth"
      security [ bearerAuth: [] ]

      response "204", "signed out" do
        let(:user)          { create(:user) }
        let(:Authorization) { jwt_for(user) }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test! do |response|
          expect(JSON.parse(response.body)).to include("error", "code" => "unauthenticated")
        end
      end
    end
  end

  path "/api/v1/auth/account" do
    delete "Erase the account and everything under it" do
      tags "Auth"
      security [ bearerAuth: [] ]
      description <<~DESC
        Destroys the caller's user record. Applications, timeline entries and the uploaded
        resumes and cover letters inside them cascade with it, and the JWT stops validating
        because there is no longer a user to look its `sub` up against.

        There is no self-service button for this in the UI, and no sign-up endpoint to undo it
        with; see SPEC.md § Registration is closed. The shared demo account is exempt: its
        credentials are public, so anyone could otherwise erase it.
      DESC

      response "204", "account erased" do
        let(:user)          { create(:user) }
        let(:Authorization) { jwt_for(user) }
        run_test!
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test! do |response|
          expect(JSON.parse(response.body)).to include("error", "code" => "unauthenticated")
        end
      end

      response "403", "the demo account cannot be erased" do
        let(:user)          { create(:user, email: Demo::ResetService::DEMO_EMAIL) }
        let(:Authorization) { jwt_for(user) }
        run_test! do |response|
          expect(JSON.parse(response.body)).to include("code" => "forbidden")
        end
      end
    end
  end

  # Cascade and revocation are the whole point of the endpoint, and neither is visible
  # in a status code — assert them separately from the rswag contract above.
  describe "DELETE /api/v1/auth/account — what it takes with it" do
    let(:user)  { create(:user) }
    let(:token) { jwt_for(user) }

    it "erases the user's applications and timeline entries" do
      application = create(:application, user: user)
      create(:timeline_entry, application: application, actor: user)

      expect do
        delete "/api/v1/auth/account", headers: { "Authorization" => token }
      end.to change(User, :count).by(-1)
        .and change(Application, :count).by(-1)
        .and change(TimelineEntry, :count).by(-1)

      expect(response).to have_http_status(:no_content)
    end

    it "leaves the JWT unusable" do
      delete "/api/v1/auth/account", headers: { "Authorization" => token }

      get "/api/v1/me", headers: { "Authorization" => token }
      expect(response).to have_http_status(:unauthorized)
    end

    it "does not touch anyone else's data" do
      other = create(:user)
      create(:application, user: other)

      expect do
        delete "/api/v1/auth/account", headers: { "Authorization" => token }
      end.not_to change(Application, :count)

      expect(User.exists?(other.id)).to be(true)
    end

    # The demo credentials are published — on the sign-in page, in llms.txt, in the
    # README — and this endpoint is documented in Swagger. Without the guard, the one
    # button a reviewer is invited to press is also the button that deletes the
    # portfolio's centrepiece for up to an hour, until DemoResetJob rebuilds it.
    it "refuses to erase the demo account" do
      demo = create(:user, email: Demo::ResetService::DEMO_EMAIL)

      expect do
        delete "/api/v1/auth/account", headers: { "Authorization" => jwt_for(demo) }
      end.not_to change(User, :count)

      expect(response).to have_http_status(:forbidden)
      expect(response.parsed_body["code"]).to eq("forbidden")
    end
  end

  # Registration is closed (SPEC.md § Registration is closed). The sign-up path is not
  # routed at all — this is the spec that fails if someone re-adds :registrations to
  # devise_for and quietly reopens the door.
  describe "registration is closed", type: :routing do
    it "does not route POST /api/v1/auth/sign_up" do
      expect(post: "/api/v1/auth/sign_up").not_to be_routable
    end

    it "does not route GET /api/v1/auth/sign_up" do
      expect(get: "/api/v1/auth/sign_up").not_to be_routable
    end
  end
end
