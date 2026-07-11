Rails.application.routes.draw do
  # Deep health check — overrides Rails 8 default (which only verifies boot).
  # Pings Postgres so Railway healthchecks fail fast on dependency loss.
  get "up" => "health#show", as: :rails_health_check

  mount Rswag::Ui::Engine => "/api-docs"
  mount Rswag::Api::Engine => "/api-docs"

  # Sidekiq::Web dashboard is disabled (Sidekiq is disabled — see CLAUDE.md).
  # To re-enable, restore the mount block from git history.

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

      get "transitions", to: "transitions#index"
      get "dashboard",   to: "dashboard#index"
      get "me",          to: "me#show"
    end
  end
end
