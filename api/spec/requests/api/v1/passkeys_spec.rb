require "swagger_helper"
require "webauthn/fake_client"

# The WebAuthn ceremonies run end to end against WebAuthn::FakeClient — real
# key generation and signing over the app's own challenge, no mocked
# verification (SPEC.md § Testing strategy). The fake client's origin must
# match WebAuthn.configuration.allowed_origins: http://localhost:3000, the
# test-env FRONTEND_URL default.
RSpec.describe "Passkeys", type: :request do
  # Challenges must survive between the options request and the verify
  # request; the test env's cache is :null_store, so swap in a real store —
  # the same seam the dashboard caching spec uses.
  before { allow(Rails).to receive(:cache).and_return(ActiveSupport::Cache::MemoryStore.new) }

  let(:fake_client) { WebAuthn::FakeClient.new("http://localhost:3000") }
  let(:user)        { create(:user) }
  let(:token)       { jwt_for(user) }

  # One full enrollment through the API, returning the created attestation
  # hash's external id so authentication specs can assert against the row.
  def enroll_passkey!(client:, headers:)
    post "/api/v1/passkeys/options", headers: headers
    challenge = response.parsed_body.fetch("challenge")
    attestation = client.create(challenge: challenge, user_verified: true)
    post "/api/v1/passkeys", params: { credential: attestation }, headers: headers, as: :json
    attestation
  end

  # rswag documents the contract; the ceremony bodies are opaque WebAuthn JSON,
  # so the schemas stay loose on purpose — the FakeClient specs below are what
  # pin the behaviour.
  path "/api/v1/passkeys/options" do
    post "WebAuthn registration options" do
      tags "Passkeys"
      produces "application/json"
      security [ bearerAuth: [] ]
      description <<~DESC
        Creation options for enrolling a passkey (SPEC.md § Passkeys): discoverable
        credentials (`residentKey: "required"`), no authenticator attachment restriction,
        `attestation: "none"`. The challenge is single-use and expires in five minutes.
      DESC

      response "200", "creation options" do
        let(:Authorization) { token }
        run_test! do |response|
          body = response.parsed_body
          expect(body["challenge"]).to be_present
          expect(body.dig("authenticatorSelection", "residentKey")).to eq("required")
          expect(body.dig("authenticatorSelection", "userVerification")).to eq("required")
          expect(body["authenticatorSelection"]).not_to have_key("authenticatorAttachment")
          expect(body["attestation"]).to eq("none")
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test!
      end
    end
  end

  path "/api/v1/passkeys" do
    get "List enrolled passkeys" do
      tags "Passkeys"
      produces "application/json"
      security [ bearerAuth: [] ]

      response "200", "the user's passkeys — id, nickname, created_at, last_used_at only" do
        let(:Authorization) { token }
        before { create(:credential, user: user, nickname: "ubuntu") }

        run_test! do |response|
          body = response.parsed_body
          expect(body.length).to eq(1)
          expect(body.first).to include("nickname" => "ubuntu")
          expect(body.first.keys).to match_array(%w[id nickname created_at last_used_at])
        end
      end
    end

    post "Enroll a passkey" do
      tags "Passkeys"
      consumes "application/json"
      produces "application/json"
      security [ bearerAuth: [] ]
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          credential: { type: :object, description: "The browser PublicKeyCredential, serialized with toJSON()" },
          nickname:   { type: :string }
        },
        required: %w[credential]
      }

      response "201", "passkey enrolled" do
        let(:Authorization) { token }
        let(:body) do
          post "/api/v1/passkeys/options", headers: { "Authorization" => token }
          challenge = response.parsed_body.fetch("challenge")
          { credential: fake_client.create(challenge: challenge, user_verified: true), nickname: "ubuntu" }
        end

        run_test! do |response|
          expect(response.parsed_body).to include("nickname" => "ubuntu")
          expect(user.credentials.count).to eq(1)
        end
      end

      response "422", "attestation does not verify, or the challenge expired" do
        let(:Authorization) { token }
        # No options request was made, so no challenge is stored.
        let(:body) { { credential: { "id" => "x", "type" => "public-key" } } }

        run_test! do |response|
          expect(response.parsed_body).to include("code" => "passkey_verification_failed")
        end
      end
    end
  end

  path "/api/v1/passkeys/{id}" do
    delete "Remove a passkey" do
      tags "Passkeys"
      security [ bearerAuth: [] ]
      parameter name: :id, in: :path, type: :integer

      response "204", "removed" do
        let(:Authorization) { token }
        let(:id) { create(:credential, user: user).id }
        run_test! { expect(user.credentials.count).to eq(0) }
      end

      response "404", "another user's passkey — scoped, never a 403" do
        let(:Authorization) { token }
        let(:id) { create(:credential).id }
        run_test!
      end
    end
  end

  path "/api/v1/auth/passkey/options" do
    post "WebAuthn assertion options" do
      tags "Auth"
      produces "application/json"
      description <<~DESC
        Assertion options for passkey sign-in — unauthenticated, usernameless. The
        allow-list is empty (credentials are discoverable; the browser's picker chooses).
        The challenge is single-use and expires in five minutes.
      DESC

      response "200", "assertion options" do
        run_test! do |response|
          body = response.parsed_body
          expect(body["challenge"]).to be_present
          expect(body["allowCredentials"]).to eq([])
          expect(body["userVerification"]).to eq("required")
        end
      end
    end
  end

  path "/api/v1/auth/passkey" do
    post "Sign in with a passkey" do
      tags "Auth"
      consumes "application/json"
      produces "application/json"
      parameter name: :body, in: :body, schema: {
        type: :object,
        properties: {
          challenge:  { type: :string, description: "The challenge echoed from the options response" },
          credential: { type: :object, description: "The browser PublicKeyCredential assertion, serialized with toJSON()" }
        },
        required: %w[challenge credential]
      }

      response "200", "signed in — JWT returned in Authorization header" do
        let(:body) do
          enroll_passkey!(client: fake_client, headers: { "Authorization" => token })
          post "/api/v1/auth/passkey/options"
          challenge = response.parsed_body.fetch("challenge")
          { challenge: challenge, credential: fake_client.get(challenge: challenge, user_verified: true) }
        end

        run_test! do |response|
          expect(response.headers["Authorization"]).to be_present
          expect(response.parsed_body.dig("user", "email")).to eq(user.email)
        end
      end

      response "401", "unknown credential, bad challenge, or failed verification" do
        let(:body) { { challenge: "never-issued", credential: { "id" => "x" } } }
        run_test! do |response|
          expect(response.parsed_body).to include("code" => "invalid_passkey")
        end
      end
    end
  end

  # The properties rswag's contract blocks can't see: single-use challenges,
  # the JWT actually authenticating, sign_count movement, revocation parity.
  describe "the authentication ceremony, end to end" do
    before { enroll_passkey!(client: fake_client, headers: { "Authorization" => token }) }

    def assertion_body
      post "/api/v1/auth/passkey/options"
      challenge = response.parsed_body.fetch("challenge")
      { challenge: challenge, credential: fake_client.get(challenge: challenge, user_verified: true) }
    end

    it "issues a JWT that authenticates like a password sign-in's" do
      post "/api/v1/auth/passkey", params: assertion_body, as: :json

      expect(response).to have_http_status(:ok)
      passkey_token = response.headers["Authorization"]

      get "/api/v1/me", headers: { "Authorization" => passkey_token }
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["email"]).to eq(user.email)
    end

    it "updates sign_count and last_used_at on the credential row" do
      credential = user.credentials.sole
      expect(credential.last_used_at).to be_nil

      post "/api/v1/auth/passkey", params: assertion_body, as: :json

      expect(credential.reload.sign_count).to be > 0
      expect(credential.last_used_at).to be_present
    end

    it "refuses a replayed challenge — single use" do
      body = assertion_body
      post "/api/v1/auth/passkey", params: body, as: :json
      expect(response).to have_http_status(:ok)

      post "/api/v1/auth/passkey", params: body, as: :json
      expect(response).to have_http_status(:unauthorized)
      expect(response.parsed_body["code"]).to eq("invalid_passkey")
    end

    it "refuses an assertion over a challenge the server never issued" do
      foreign = fake_client.get(challenge: WebAuthn::Credential.options_for_get.challenge,
                                user_verified: true)
      post "/api/v1/auth/passkey",
           params: { challenge: "forged", credential: foreign }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "refuses an assertion from a credential that was removed" do
      body = assertion_body
      user.credentials.sole.destroy!

      post "/api/v1/auth/passkey", params: body, as: :json
      expect(response).to have_http_status(:unauthorized)
    end

    it "revokes passkey-issued JWTs on sign-out, like every other device" do
      post "/api/v1/auth/passkey", params: assertion_body, as: :json
      passkey_token = response.headers["Authorization"]

      delete "/api/v1/auth/sign_out", headers: { "Authorization" => passkey_token }
      expect(response).to have_http_status(:no_content)

      get "/api/v1/me", headers: { "Authorization" => passkey_token }
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "enrollment edges" do
    it "generates webauthn_id once and keeps it stable across options requests" do
      expect(user.webauthn_id).to be_nil

      post "/api/v1/passkeys/options", headers: { "Authorization" => token }
      first_handle = user.reload.webauthn_id
      expect(first_handle).to be_present

      post "/api/v1/passkeys/options", headers: { "Authorization" => token }
      expect(user.reload.webauthn_id).to eq(first_handle)
    end

    it "lists already-enrolled credentials in excludeCredentials" do
      enroll_passkey!(client: fake_client, headers: { "Authorization" => token })

      post "/api/v1/passkeys/options", headers: { "Authorization" => token }
      exclude = response.parsed_body.fetch("excludeCredentials")
      expect(exclude.map { |c| c["id"] }).to eq([ user.credentials.sole.external_id ])
    end

    it "refuses a replayed registration challenge — single use" do
      post "/api/v1/passkeys/options", headers: { "Authorization" => token }
      challenge = response.parsed_body.fetch("challenge")
      attestation = fake_client.create(challenge: challenge, user_verified: true)

      post "/api/v1/passkeys", params: { credential: attestation },
                               headers: { "Authorization" => token }, as: :json
      expect(response).to have_http_status(:created)

      post "/api/v1/passkeys", params: { credential: attestation },
                               headers: { "Authorization" => token }, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body["code"]).to eq("passkey_verification_failed")
    end

    it "rejects a malformed credential body without a 500" do
      post "/api/v1/passkeys/options", headers: { "Authorization" => token }

      post "/api/v1/passkeys", params: { credential: "not-an-object" },
                               headers: { "Authorization" => token }, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end

    # The throttle bounds the rate; this is what bounds the total — the
    # Application::MAX_PER_USER argument in miniature (SPEC.md § Passkeys).
    # stub_const to 1 like the application-ceiling spec: building 20 fixtures
    # would read to the N+1 scanner as 20 identical COUNTs.
    it "refuses enrollment past Credential::MAX_PER_USER, through the standard envelope" do
      stub_const("Credential::MAX_PER_USER", 1)
      create(:credential, user: user)

      post "/api/v1/passkeys/options", headers: { "Authorization" => token }
      challenge = response.parsed_body.fetch("challenge")
      attestation = fake_client.create(challenge: challenge, user_verified: true)

      post "/api/v1/passkeys", params: { credential: attestation },
                               headers: { "Authorization" => token }, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body["code"]).to eq("validation_failed")
      expect(response.parsed_body["details"]).to include(
        { "field" => "base", "code" => "too_many_passkeys" }
      )
    end
  end

  describe "erasing the account takes its passkeys with it" do
    it "cascades credentials on DELETE /api/v1/auth/account" do
      create(:credential, user: user)

      expect do
        delete "/api/v1/auth/account", headers: { "Authorization" => token }
      end.to change(Credential, :count).by(-1)
    end
  end
end
