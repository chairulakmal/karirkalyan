Rails.application.routes.draw do
  # Deep health check — overrides Rails 8 default (which only verifies boot).
  # Pings Postgres so Railway healthchecks fail fast on dependency loss.
  get "up" => "health#show", as: :rails_health_check

  mount Rswag::Ui::Engine => "/api-docs"
  mount Rswag::Api::Engine => "/api-docs"

  # Registration is closed — there is no sign-up route (SPEC.md § Registration is closed).
  # Devise's :registerable generates the sign-up POST *and* the account-destroy DELETE from
  # the same controller, so skipping :registrations would silently take the deletion endpoint
  # with it. It is skipped, and the destroy half re-declared below on a path that says what
  # it does — as a plain route, because the controller is no longer a Devise one.
  devise_for :users,
    path: "/api/v1/auth",
    path_names: { sign_in: "sign_in", sign_out: "sign_out" },
    skip: [ :registrations ],
    controllers: { sessions: "api/v1/auth/sessions" }

  namespace :api do
    namespace :v1 do
      namespace :auth do
        delete "account", to: "registrations#destroy"

        # Passkey sign-in — the unauthenticated WebAuthn ceremony (SPEC.md
        # § Passkeys). POST /auth/passkey is in devise-jwt's dispatch_requests,
        # so a verified assertion answers with the same Authorization header
        # as POST /auth/sign_in. Enrollment lives at /passkeys below.
        post "passkey/options", to: "passkey_sessions#options"
        post "passkey",         to: "passkey_sessions#create"
      end

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

      # Passkey enrollment and management — authenticated (SPEC.md § Passkeys).
      resources :passkeys, only: [ :index, :create, :destroy ] do
        collection do
          post :options
        end
      end

      # Web Push subscriptions (SPEC.md § Push notifications). DELETE takes the
      # endpoint in the body rather than an id — the browser knows its endpoint,
      # not our row id — so it is a collection route, not a member one.
      get    "push_subscriptions/public_key", to: "push_subscriptions#public_key"
      post   "push_subscriptions",            to: "push_subscriptions#create"
      delete "push_subscriptions",            to: "push_subscriptions#destroy"

      get "exports/applications", to: "exports#applications"
      get "exports/account",      to: "exports#account"

      get "transitions", to: "transitions#index"
      get "dashboard",   to: "dashboard#index"
      get "me",          to: "me#show"
    end
  end
end
