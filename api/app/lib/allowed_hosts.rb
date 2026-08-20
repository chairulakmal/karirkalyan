# Host allowlist for ActionDispatch::HostAuthorization (DNS-rebinding
# protection). Lives here rather than inline in config/environments/production.rb
# so it can be exercised by a spec.
#
# IMPORTANT: do not anchor these patterns. HostAuthorization::Permissions wraps
# every regexp as /\A#{pattern}(:\d+)?\z/ — see actionpack's
# host_authorization.rb#sanitize_regexp — so anchoring is already applied and an
# optional :port is appended. Writing your own trailing \z asserts end-of-string
# before the port can match, which blocks "api:8080", the Host on every internal
# service-to-service call.
module AllowedHosts
  PRIMARY_DOMAIN = "kk.chairulakmal.com"

  # The Cloudflare Tunnel's public API subdomain, plus the bare Docker Compose
  # service name "api" used for internal web -> api calls over the internal
  # network (docker-compose.prod.yml; SPEC.md § Deployment). Single-level
  # subdomain on purpose: Cloudflare's default edge certificate covers the
  # apex plus one wildcard level only, so a two-level form like
  # api.kk.chairulakmal.com fails the TLS handshake (SPEC.md § Deployment).
  PATTERNS = [
    /kk-api\.chairulakmal\.com/i,
    /api/i
  ].freeze

  # Everything the production app trusts, including the runtime APP_HOST override.
  def self.all(app_host: ENV["APP_HOST"])
    hosts = [ PRIMARY_DOMAIN, *PATTERNS ]
    hosts << app_host if app_host.present?
    hosts
  end
end
