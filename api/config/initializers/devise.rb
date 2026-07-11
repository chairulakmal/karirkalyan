Devise.setup do |config|
  config.mailer_sender = "noreply@karirkalyan.com"

  require "devise/orm/active_record"

  config.case_insensitive_keys = [ :email ]
  config.strip_whitespace_keys = [ :email ]
  config.skip_session_storage = [ :http_auth, :params_auth ]
  config.navigational_formats = []
  config.stretches = Rails.env.test? ? 1 : 12
  config.reconfirmable = false
  config.expire_all_remember_me_on_sign_out = true
  config.password_length = 8..128
  # email_regexp left at Devise's default — the previous override was weaker than the default.
  config.reset_password_within = 6.hours
  config.sign_out_via = :delete
  config.responder.error_status = :unprocessable_entity
  config.responder.redirect_status = :found

  # JsonFailureApp adds the machine-readable `code` (unauthenticated /
  # invalid_credentials) to Devise's 401 JSON body. The lambda defers the
  # constant lookup to request time, so the reloadable class in app/lib never
  # goes stale in development.
  config.warden do |manager|
    manager.failure_app = ->(env) { JsonFailureApp.call(env) }
  end

  config.jwt do |jwt|
    jwt.secret = ENV.fetch("DEVISE_JWT_SECRET_KEY")
    jwt.dispatch_requests = [ [ "POST", %r{^/api/v1/auth/sign_in$} ] ]
    jwt.revocation_requests = [ [ "DELETE", %r{^/api/v1/auth/sign_out$} ] ]
    jwt.expiration_time = 1.day.to_i
  end
end
