require "active_support/core_ext/integer/time"

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  config.eager_load = true

  # Full error reports are disabled.
  config.consider_all_requests_local = false

  # Cache assets for far-future expiry since they are all digest stamped.
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # Railway terminates TLS at the edge; trust its X-Forwarded-Proto header
  # so Rails treats incoming requests as HTTPS.
  config.assume_ssl = true

  # Force HTTPS, set HSTS, mark cookies as secure.
  config.force_ssl = true

  # Health check endpoint stays plain HTTP so Railway's prober isn't redirected.
  config.ssl_options = { redirect: { exclude: ->(request) { request.path == "/up" } } }

  # Log to STDOUT with the current request id as a default log tag.
  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)

  # Change to "debug" to log everything (including potentially personally-identifiable information!).
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Prevent health checks from clogging up the logs.
  config.silence_healthcheck_path = "/up"

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # Outbound email via SMTP (Resend in production; any SMTP host works — the
  # code is provider-agnostic, only the env vars change). Delivery failures
  # raise so they surface in Honeybadger rather than failing silently.
  config.action_mailer.delivery_method        = :smtp
  config.action_mailer.perform_deliveries     = true
  config.action_mailer.raise_delivery_errors  = true
  config.action_mailer.default_url_options     = { host: ENV.fetch("FRONTEND_URL", "https://kk.chairulakmal.com").sub(%r{\Ahttps?://}, ""), protocol: "https" }
  config.action_mailer.smtp_settings = {
    address:              ENV["SMTP_HOST"],
    port:                 ENV.fetch("SMTP_PORT", 587).to_i,
    user_name:            ENV["SMTP_USER"],
    password:             ENV["SMTP_PASS"],
    authentication:       :plain,
    enable_starttls_auto: true
  }

  # Solid Cache — Postgres-backed shared cache (no Redis service needed).
  # Rack::Attack throttle counters go through Rails.cache, so they are shared
  # across all Puma workers/processes. Store options in config/cache.yml.
  config.cache_store = :solid_cache_store

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]

  # DNS-rebinding protection. Production domain + Railway-issued preview/prod
  # subdomains + private-network hostnames for service-to-service calls.
  # An additional host can be supplied at runtime via APP_HOST.
  # Anchored (\A…\z) so the pattern must match the *entire* Host, not just a
  # substring — an unanchored /.*\.railway\.app/ would also accept an attacker
  # host like "foo.railway.app.evil.com".
  config.hosts << "kk.chairulakmal.com"
  config.hosts << /\A([a-z0-9-]+\.)+railway\.app\z/i
  config.hosts << /\A([a-z0-9-]+\.)+railway\.internal\z/i
  config.hosts << ENV["APP_HOST"] if ENV["APP_HOST"].present?

  # Health check endpoint skips host authorization so the platform's prober
  # (which may use an internal hostname) keeps working.
  config.host_authorization = { exclude: ->(request) { request.path == "/up" } }
end
