require "rails_helper"

# Sidekiq Web UI is disabled. This spec is kept as a placeholder so the file
# is easy to find and restore when re-enabling Sidekiq (see CLAUDE.md).
RSpec.describe "Sidekiq Web UI", type: :request, skip_n_plus_one: true do
  it "returns 404 — Sidekiq dashboard is not mounted while Sidekiq is disabled" do
    get "/sidekiq"
    expect(response).to have_http_status(:not_found)
  end
end
