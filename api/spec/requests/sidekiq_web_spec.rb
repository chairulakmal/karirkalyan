require "rails_helper"

# Smoke test: the Sidekiq dashboard is mounted and renders. Basic auth is only
# applied in production (see config/routes.rb), so in test it's reachable. This
# guards the mount + the cookie-session/CSRF wiring that API-only apps need.
RSpec.describe "Sidekiq Web UI", type: :request, skip_n_plus_one: true do
  it "mounts the dashboard at /sidekiq" do
    get "/sidekiq"
    expect(response).to have_http_status(:ok).or have_http_status(:redirect)
  end
end
