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
          # The one endpoint that answered off-contract. It rendered
          # `{ errors: … }`: no `error` sentence, no `code`, no per-field
          # `details`, against SPEC.md § API contract's "every error response is
          # { error, code }", so web/'s apiFailure had nothing to key on and fell
          # through to status-keyed copy. The visible message on /settings does
          # not change today (the catalog has no field.residence_status_inclusion
          # entry, so it resolves to code.validation_failed, which reads the same
          # as the 422 fallback); what changes is that the response is now
          # something a client can branch on, so the next validation this endpoint
          # grows arrives localizable rather than needing this found again.
          render_validation_failed(current_user)
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
