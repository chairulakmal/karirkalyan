module Api
  module V1
    module Auth
      class SessionsController < Devise::SessionsController
        respond_to :json

        private

        def respond_with(resource, _opts = {})
          render json: { user: { id: resource.id, email: resource.email } }, status: :ok
        end

        def respond_to_on_destroy
          head :no_content
        end
      end
    end
  end
end
