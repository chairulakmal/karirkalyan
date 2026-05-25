require "rails_helper"

# devise-jwt's RevocationManager middleware rotates the user's `jti` column
# when a DELETE hits a path matching `revocation_requests` (configured in
# config/initializers/devise.rb). That middleware runs *before* the Sessions
# controller, so even though `destroy` returns 204, the real revocation work
# happens upstream. This spec proves the rotation actually invalidates the
# token — the controller-level 204 alone would pass even if revocation were
# silently broken.
RSpec.describe "JWT rotation on sign_out", type: :request do
  let(:user)  { create(:user) }
  let(:token) { jwt_for(user) }

  it "invalidates the old token after sign_out" do
    get "/api/v1/applications", headers: { "Authorization" => token }
    expect(response).to have_http_status(:ok)

    delete "/api/v1/auth/sign_out", headers: { "Authorization" => token }
    expect(response).to have_http_status(:no_content)

    get "/api/v1/applications", headers: { "Authorization" => token }
    expect(response).to have_http_status(:unauthorized)
  end
end
