Rails.application.routes.draw do
  # Deep health check — overrides Rails 8 default (which only verifies boot).
  # Pings Postgres + Redis so Railway healthchecks fail fast on dependency loss.
  get "up" => "health#show", as: :rails_health_check

  mount Rswag::Ui::Engine => "/api-docs"
  mount Rswag::Api::Engine => "/api-docs"

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
        member do
          patch :transition
          get   :resume
          get   :cover_letter
        end
      end

      get "dashboard", to: "dashboard#index"
    end
  end
end
