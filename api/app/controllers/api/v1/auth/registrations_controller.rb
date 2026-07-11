module Api
  module V1
    module Auth
      class RegistrationsController < Devise::RegistrationsController
        include ErrorRendering

        respond_to :json

        def create
          build_resource(sign_up_params)

          if resource.save
            # deliver_later, not deliver_now: production sets raise_delivery_errors,
            # so a transient SMTP failure here would 500 the request even though the
            # account was already created. Enqueue it and let the mail job retry.
            WelcomeMailer.welcome(resource).deliver_later
            render json: { user: { id: resource.id, email: resource.email } }, status: :created
          else
            # The single-string { error:, code: } envelope, like every other
            # failure — this used to return { errors: [...] }, an array the
            # API contract never allowed.
            render_validation_failed(resource)
          end
        end
      end
    end
  end
end
