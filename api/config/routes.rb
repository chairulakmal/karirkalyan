Rails.application.routes.draw do
  # Deep health check — overrides Rails 8 default (which only verifies boot).
  # Pings Postgres so Railway healthchecks fail fast on dependency loss.
  get "up" => "health#show", as: :rails_health_check

  mount Rswag::Ui::Engine => "/api-docs"
  mount Rswag::Api::Engine => "/api-docs"

  # Registration is closed — there is no sign-up route (SPEC.md § Registration is closed).
  # Devise's :registerable generates the sign-up POST *and* the account-destroy DELETE from
  # one controller, so `skip: [:registrations]` would take both. It is skipped here and the
  # destroy half is re-declared by hand, on a path that says what it does.
  devise_for :users,
    path: "/api/v1/auth",
    path_names: { sign_in: "sign_in", sign_out: "sign_out" },
    skip: [ :registrations ],
    controllers: { sessions: "api/v1/auth/sessions" }

  devise_scope :user do
    delete "/api/v1/auth/account",
      to: "api/v1/auth/registrations#destroy",
      as: :destroy_user_registration
  end

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

      get "exports/applications", to: "exports#applications"
      get "exports/account",      to: "exports#account"

      get "transitions", to: "transitions#index"
      get "dashboard",   to: "dashboard#index"
      get "me",          to: "me#show"
    end
  end
end
