require "rails_helper"

RSpec.describe "GET /up", type: :request do
  it "returns 200 with all checks ok when dependencies are healthy" do
    get "/up"

    expect(response).to have_http_status(:ok)
    body = response.parsed_body
    expect(body["status"]).to eq("ok")
    expect(body["checks"]).to eq("database" => true, "redis" => true)
  end

  it "returns 503 with the failing check named when redis is down" do
    allow(Sidekiq).to receive(:redis).and_raise(StandardError, "down")

    get "/up"

    expect(response).to have_http_status(:service_unavailable)
    body = response.parsed_body
    expect(body["status"]).to eq("degraded")
    expect(body["checks"]).to eq("database" => true, "redis" => false)
  end

  it "returns 503 with the failing check named when postgres is down" do
    allow(ActiveRecord::Base.connection).to receive(:execute).and_raise(ActiveRecord::ConnectionNotEstablished, "down")

    get "/up"

    expect(response).to have_http_status(:service_unavailable)
    body = response.parsed_body
    expect(body["status"]).to eq("degraded")
    expect(body["checks"]).to eq("database" => false, "redis" => true)
  end
end
