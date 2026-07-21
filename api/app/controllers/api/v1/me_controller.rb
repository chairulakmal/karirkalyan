module Api
  module V1
    # The authenticated user's own profile. Beyond email + timestamps it now
    # carries the visa global half (§ Data model): the user's status of residence
    # and expiry, the days-remaining read derived from them, and the perishable
    # CoE lead-time reference the settings page shows as job-change guidance.
    # User#as_json already strips encrypted_password, jti, and webauthn_id.
    class MeController < ApplicationController
      def show
        render json: profile_json
      end

      # Settings edits the residence fields; nothing else here is user-editable.
      def update
        if current_user.update(me_params)
          render json: profile_json
        else
          render json: { errors: current_user.errors }, status: :unprocessable_entity
        end
      end

      private

      def profile_json
        current_user.as_json.merge(
          # Derived, never stored: nil when there is no clock (no date, or a
          # non-expiring status like permanent_resident).
          "residence_days_remaining" => current_user.residence_days_remaining,
          # The perishable immigration reference, in one place (Visa), so the
          # frontend renders guidance without duplicating the numbers.
          "reference" => {
            coe_lead_time_days: Visa::COE_LEAD_TIME_DAYS,
            renewal_warning_days: Visa::RENEWAL_WARNING_DAYS
          }
        )
      end

      def me_params
        params.require(:user).permit(:residence_status, :residence_expires_on)
      end
    end
  end
end
