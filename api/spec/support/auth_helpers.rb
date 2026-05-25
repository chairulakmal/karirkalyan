module AuthHelpers
  # Hits the sign_in endpoint — requires the Sessions controller to exist (Phase 3+).
  def auth_headers_for(user)
    post "/api/v1/auth/sign_in",
      params: { user: { email: user.email, password: "password123" } },
      as: :json
    { "Authorization" => response.headers["Authorization"] }
  end

  # Generates a valid JWT directly — usable before Phase 3 controllers exist.
  def jwt_for(user)
    token, _payload = Warden::JWTAuth::UserEncoder.new.call(user, :user, nil)
    "Bearer #{token}"
  end

  def fake_pdf
    file = Tempfile.new(["test", ".pdf"])
    file.binmode
    file.write("%PDF-1.4 fake content for testing")
    file.rewind
    Rack::Test::UploadedFile.new(file, "application/pdf")
  end
end

RSpec.configure do |config|
  config.include AuthHelpers, type: :request
end
