module Api
  module V1
    module Auth
      # Half a registrations controller, on purpose. Registration is closed
      # (SPEC.md § Registration is closed), so `create` is gone and the only
      # action left is the account-destroy half that Devise's :registerable
      # module generates from the same controller. Accounts are created
      # server-side: `bin/rails users:create`.
      class RegistrationsController < Devise::RegistrationsController
        respond_to :json

        # DELETE /api/v1/auth/account
        #
        # `authenticate_scope!` (prepended by Devise for :destroy) resolves the
        # caller from the JWT and assigns `resource`. Destroying the user cascades
        # to their applications, timeline entries and the blobs inside them, and
        # revokes the token for free: JTIMatcher validates a JWT by looking its
        # `sub` up in `users`, and there is no longer a user to find.
        def destroy
          resource.destroy!
          head :no_content
        end
      end
    end
  end
end
