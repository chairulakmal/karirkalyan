module Api
  module V1
    module Auth
      # Deliberately *not* a Devise::RegistrationsController subclass. Registration
      # is closed (SPEC.md § Registration is closed), and inheriting the Devise
      # controller would drag `new`, `create`, `edit`, `update` and `cancel` in as
      # live methods — unroutable today, but a loaded gun in a drawer, in the one
      # release whose entire point is that the gun is gone. Accounts are created
      # server-side: `bin/rails users:create`.
      #
      # Nothing was lost by dropping the inheritance: `authenticate_user!` and
      # `render_error` both come from ApplicationController, and the caller is
      # resolved from the JWT via `current_user` rather than Devise's
      # `authenticate_scope!`.
      class RegistrationsController < ApplicationController
        # DELETE /api/v1/auth/account
        #
        # The caller is `current_user` — resolved from the JWT's `sub`, never from
        # a path parameter, so there is no id to tamper with and one user cannot
        # reach another's account. Destroying the user cascades to their
        # applications, timeline entries and the blobs inside them, and revokes the
        # token for free: JTIMatcher validates a JWT by looking its `sub` up in
        # `users`, and there is no longer a user to find.
        def destroy
          # The demo account's credentials are published — on the sign-in page, in
          # llms.txt, in the README. Without this guard, the one button a reviewer
          # is invited to press is also a button any of them can use to delete the
          # portfolio's centrepiece. DemoResetJob would rebuild it, but only on the
          # hour, so "Try demo account" could 401 for up to 59 minutes.
          if current_user.email == Demo::ResetService::DEMO_EMAIL
            return render_error("The demo account cannot be erased.",
                                code: "forbidden", status: :forbidden)
          end

          current_user.destroy!
          head :no_content
        end
      end
    end
  end
end
