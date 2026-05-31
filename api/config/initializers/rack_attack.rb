# Rate-limit auth endpoints to defend against brute-force and account spam.
#
# Storage: Rails.cache — :redis_cache_store in prod (see config/environments/production.rb),
# so throttle counters are shared across all Puma workers; :memory_store in dev,
# :null_store in test (the throttling spec swaps in its own MemoryStore).
#
# req.ip respects Rails' trusted-proxy handling, so behind Railway/Cloudflare the
# real client IP is used (not the proxy's).
#
# JSON-bodied requests don't expose `req.params` cleanly inside Rack middleware
# (the body is parsed downstream by Rails), so we throttle by IP only — not email.
class Rack::Attack
  Rack::Attack.cache.store = Rails.cache

  # Off by default in test; specific throttling specs flip this back on.
  Rack::Attack.enabled = !Rails.env.test?

  throttle("auth/sign_in", limit: 5, period: 1.minute) do |req|
    req.ip if req.path == "/api/v1/auth/sign_in" && req.post?
  end

  throttle("auth/sign_up", limit: 3, period: 1.hour) do |req|
    req.ip if req.path == "/api/v1/auth/sign_up" && req.post?
  end

  self.throttled_responder = lambda do |request|
    match_data  = request.env["rack.attack.match_data"] || {}
    retry_after = match_data[:period] || 60
    [
      429,
      { "Content-Type" => "application/json", "Retry-After" => retry_after.to_s },
      [ { error: "Too many requests. Retry after #{retry_after}s." }.to_json ]
    ]
  end
end
