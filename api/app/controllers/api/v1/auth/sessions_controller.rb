module Api
  module V1
    module Auth
      class SessionsController < Devise::SessionsController
        include ErrorRendering

        respond_to :json

        skip_before_action :verify_signed_out_user, only: :destroy, raise: false

        def destroy
          if current_user
            sign_out(current_user)
            head :no_content
          else
            # Same envelope JsonFailureApp produces — this 401 is rendered here,
            # not by warden, because verify_signed_out_user is skipped above.
            render_error(I18n.t("devise.failure.unauthenticated"),
                         code: "unauthenticated", status: :unauthorized)
          end
        end

        private

        def respond_with(resource, _opts = {})
          render json: { user: { id: resource.id, email: resource.email } }, status: :ok
        end
      end
    end
  end
end
