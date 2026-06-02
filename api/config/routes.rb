require "sidekiq/web"
require "rack/session" # Rack 3 split Rack::Session::Cookie into the rack-session gem

Rails.application.routes.draw do
  # Deep health check — overrides Rails 8 default (which only verifies boot).
  # Pings Postgres + Redis so Railway healthchecks fail fast on dependency loss.
  get "up" => "health#show", as: :rails_health_check

  mount Rswag::Ui::Engine => "/api-docs"
  mount Rswag::Api::Engine => "/api-docs"

  # Sidekiq dashboard — live view of the reminder/mailer jobs, retries, and the
  # cron schedule. Protected with HTTP basic auth in production (fails closed if
  # the credentials env vars are unset); open on localhost in dev/test.
  if Rails.env.production?
    Sidekiq::Web.use(Rack::Auth::Basic) do |username, password|
      expected_user = ENV["SIDEKIQ_USERNAME"].to_s
      expected_pass = ENV["SIDEKIQ_PASSWORD"].to_s
      expected_user.present? && expected_pass.present? &&
        ActiveSupport::SecurityUtils.secure_compare(username, expected_user) &
        ActiveSupport::SecurityUtils.secure_compare(password, expected_pass)
    end
  end
  # API-only apps don't load session middleware, which Sidekiq::Web's CSRF
  # protection needs — give it its own cookie session.
  Sidekiq::Web.use(Rack::Session::Cookie,
    secret:    Rails.application.secret_key_base,
    same_site: :lax,
    max_age:   86_400)
  mount Sidekiq::Web => "/sidekiq"

  devise_for :users,
    path: "/api/v1/auth",
    path_names: { sign_in: "sign_in", sign_out: "sign_out", registration: "sign_up" },
    controllers: {
      sessions:      "api/v1/auth/sessions",
      registrations: "api/v1/auth/registrations"
    }

  namespace :api do
    namespace :v1 do
      resources :applications do
        collection do
          post :prefill
        end
        member do
          patch :transition
          get   :resume
          get   :cover_letter
        end
      end

      get "dashboard", to: "dashboard#index"
      get "me",        to: "me#show"
    end
  end
end
