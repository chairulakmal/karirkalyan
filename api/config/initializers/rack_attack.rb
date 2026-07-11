# Rate-limit auth endpoints to defend against brute-force and account spam.
#
# Storage: Rails.cache — :solid_cache_store in prod (Postgres-backed, see
# config/environments/production.rb), so throttle counters are shared across all
# Puma workers/processes; :memory_store in dev, :null_store in test (the
# throttling spec swaps in its own MemoryStore).
#
# req.ip respects Rails' trusted-proxy handling, so behind Railway/Cloudflare the
# real client IP is used (not the proxy's).
#
# JSON-bodied requests don't expose `req.params` inside Rack middleware (Rails
# parses the body downstream), so where we need a value from the body — the
# sign-in email, the prefill caller's account — we read and rewind rack.input
# ourselves (see .sign_in_email / .prefill_user_id below).
class Rack::Attack
  Rack::Attack.cache.store = Rails.cache

  # Off by default in test; specific throttling specs flip this back on.
  Rack::Attack.enabled = !Rails.env.test?

  # Normalised target email from a sign-in request's JSON body, or nil. Reads
  # rack.input directly (form parsing doesn't cover JSON) and rewinds it so
  # Rails can re-read the body downstream.
  def self.sign_in_email(req)
    return unless req.path == "/api/v1/auth/sign_in" && req.post?

    body = req.body.read
    req.body.rewind
    email = JSON.parse(body).dig("user", "email")
    email.is_a?(String) ? email.strip.downcase.presence : nil
  rescue StandardError
    nil
  end

  # Authenticated caller's id (JWT `sub`) for the paid AI endpoint, decoded
  # straight from the Authorization header so we can cap per-account, not just
  # per-IP. Memoised on the Rack env so the three prefill throttles decode once.
  def self.prefill_user_id(req)
    return unless req.path == "/api/v1/applications/prefill" && req.post?

    req.env.fetch("rack_attack.prefill_user_id") do
      req.env["rack_attack.prefill_user_id"] = begin
        token = Warden::JWTAuth::HeaderParser.from_env(req.env)
        token && Warden::JWTAuth::TokenDecoder.new.call(token)["sub"]
      rescue StandardError
        nil
      end
    end
  end

  throttle("auth/sign_in", limit: 5, period: 1.minute) do |req|
    req.ip if req.path == "/api/v1/auth/sign_in" && req.post?
  end

  # Account-level brute-force backstop: caps guesses against a *single* email
  # across all IPs, so a distributed (IP-rotating) attack can't bypass the
  # per-IP limit above. Every attempt counts, not just failures.
  throttle("auth/sign_in/email", limit: 10, period: 5.minutes) { |req| sign_in_email(req) }
  throttle("auth/sign_in/email/hourly", limit: 50, period: 1.hour) { |req| sign_in_email(req) }

  throttle("auth/sign_up", limit: 3, period: 1.hour) do |req|
    req.ip if req.path == "/api/v1/auth/sign_up" && req.post?
  end

  # AI URL pre-fill fans out to a paid Claude call + an outbound HTTP fetch.
  # Per-IP cap (coarse, also covers multi-account abuse from one IP)...
  throttle("ai/prefill", limit: 10, period: 1.minute) do |req|
    req.ip if req.path == "/api/v1/applications/prefill" && req.post?
  end

  # ...plus per-account caps so every user (demo included) has a bounded spend:
  # 10/min, 50/hour, 100/day. A request whose token can't be decoded returns nil
  # here (no per-account throttle) — Devise 401s it before it reaches the endpoint.
  throttle("ai/prefill/account/minute", limit: 10, period: 1.minute) { |req| prefill_user_id(req) }
  throttle("ai/prefill/account/hour", limit: 50, period: 1.hour) { |req| prefill_user_id(req) }
  throttle("ai/prefill/account/day", limit: 100, period: 1.day) { |req| prefill_user_id(req) }

  self.throttled_responder = lambda do |request|
    match_data  = request.env["rack.attack.match_data"] || {}
    retry_after = match_data[:period] || 60
    [
      429,
      { "Content-Type" => "application/json", "Retry-After" => retry_after.to_s },
      [ { error: "Too many requests. Retry after #{retry_after}s.", code: "rate_limited" }.to_json ]
    ]
  end
end
