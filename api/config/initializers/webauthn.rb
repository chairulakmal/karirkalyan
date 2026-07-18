# WebAuthn (passkey) relying-party configuration — SPEC.md § Passkeys.
#
# Both values derive from FRONTEND_URL, the env var CORS already requires, so
# passkeys add nothing to the required env set. The RP ID is the frontend's
# *full host* (kk.chairulakmal.com in prod, localhost in dev), never the
# registrable domain: chairulakmal.com would make these passkeys assertable by
# every sibling subdomain, current and future — awano.chairulakmal.com exists.
frontend_url = ENV.fetch("FRONTEND_URL", "http://localhost:3000")

WebAuthn.configure do |config|
  config.allowed_origins = [ frontend_url ]
  config.rp_id = URI.parse(frontend_url).host
  config.rp_name = "KarirKalyan"
end
