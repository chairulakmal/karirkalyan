# Passkey sign-in — the unauthenticated ceremony of SPEC.md § Passkeys.
# Enrollment and management live in Api::V1::PasskeysController.
#
# Every failure on #create is one 401 invalid_passkey, deliberately not
# enumerated: unknown credential, expired or replayed challenge, and a failed
# verification are indistinguishable to the user (retry, or fall back to the
# password), and enumerating them would tell an attacker which part of a
# forged assertion failed.
module Api
  module V1
    module Auth
      class PasskeySessionsController < ApplicationController
        include PasskeyCeremonies

        skip_before_action :authenticate_user!

        # POST /api/v1/auth/passkey/options
        #
        # The allow-list stays empty: credentials are discoverable
        # (resident_key "required" at enrollment), so the browser's own
        # picker — not the server — chooses which passkey answers.
        def options
          request_options = WebAuthn::Credential.options_for_get(user_verification: "required")
          PasskeyChallenges.store_authentication(request_options.challenge)

          render json: request_options
        end

        # POST /api/v1/auth/passkey
        #
        # The client echoes the challenge alongside the assertion. The echo is
        # safe: a challenge is only accepted if take_authentication! finds it
        # in the cache (server-issued, unexpired, unused), and verify then
        # proves the assertion was signed over that exact challenge.
        def create
          challenge = params[:challenge].to_s
          return render_invalid_passkey if challenge.blank?
          return render_invalid_passkey unless PasskeyChallenges.take_authentication!(challenge)

          webauthn_credential = WebAuthn::Credential.from_get(credential_params)

          credential = Credential.find_by(external_id: webauthn_credential.id)
          return render_invalid_passkey if credential.nil?

          # Discoverable credentials carry the user handle; when present it
          # must name the same user the credential row does.
          user_handle = webauthn_credential.user_handle
          return render_invalid_passkey if user_handle.present? &&
                                           user_handle != credential.user.webauthn_id

          webauthn_credential.verify(
            challenge,
            public_key: credential.public_key,
            sign_count: credential.sign_count,
            user_verification: true
          )

          credential.update!(sign_count: webauthn_credential.sign_count,
                             last_used_at: Time.current)

          # From here a passkey sign-in is a password sign-in: this route is in
          # devise-jwt's dispatch_requests, so sign_in makes the middleware
          # inject the same 1-day, JTI-revocable JWT into the Authorization
          # response header (SPEC.md § Passkeys § JWT dispatch).
          user = credential.user
          sign_in(user, store: false)

          render json: { user: { id: user.id, email: user.email } }, status: :ok
        rescue *CEREMONY_ERRORS => e
          # Logged so a systemic failure (a regression 401ing every user) is
          # distinguishable from hostile junk; the response stays the one
          # unenumerated 401 either way.
          Rails.logger.info("passkey authentication rejected: #{e.class}: #{e.message}")
          render_invalid_passkey
        end

        private

        def render_invalid_passkey
          render_error("Passkey sign-in failed. Try again, or sign in with your password.",
                       code: "invalid_passkey", status: :unauthorized)
        end
      end
    end
  end
end
