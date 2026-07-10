# Host allowlist for ActionDispatch::HostAuthorization (DNS-rebinding
# protection). Lives here rather than inline in config/environments/production.rb
# so it can be exercised by a spec.
#
# IMPORTANT: do not anchor these patterns. HostAuthorization::Permissions wraps
# every regexp as /\A#{pattern}(:\d+)?\z/ — see actionpack's
# host_authorization.rb#sanitize_regexp — so anchoring is already applied and an
# optional :port is appended. Writing your own trailing \z asserts end-of-string
# before the port can match, which blocks "api.railway.internal:3001", the Host
# on every internal service-to-service call.
module AllowedHosts
  PRIMARY_DOMAIN = "kk.chairulakmal.com"

  # Railway-issued public subdomains + private-network hostnames.
  PATTERNS = [
    /([a-z0-9-]+\.)+railway\.app/i,
    /([a-z0-9-]+\.)+railway\.internal/i
  ].freeze

  # Everything the production app trusts, including the runtime APP_HOST override.
  def self.all(app_host: ENV["APP_HOST"])
    hosts = [ PRIMARY_DOMAIN, *PATTERNS ]
    hosts << app_host if app_host.present?
    hosts
  end
end
