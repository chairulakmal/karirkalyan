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

  # Cache store — in-process memory is enough at personal-use scale.
  # Switch to :redis_cache_store later if cross-process cache invalidation becomes useful
  # (Redis is already a dependency for Sidekiq).
  config.cache_store = :memory_store

  # ActiveJob queue adapter is set to :sidekiq in config/application.rb — no override needed here.
  # Solid Queue/Cache were removed in favour of Sidekiq + Redis (see notes/PLAN.md).

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]

  # DNS-rebinding protection. Production domain + Railway-issued preview/prod
  # subdomains. An additional host can be supplied at runtime via APP_HOST.
  config.hosts << "kk.chairulakmal.com"
  config.hosts << /.*\.railway\.app/
  config.hosts << ENV["APP_HOST"] if ENV["APP_HOST"].present?

  # Health check endpoint skips host authorization so the platform's prober
  # (which may use an internal hostname) keeps working.
  config.host_authorization = { exclude: ->(request) { request.path == "/up" } }
end
