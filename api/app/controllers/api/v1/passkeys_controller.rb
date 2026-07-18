# Passkey enrollment and management — the authenticated half of SPEC.md
# § Passkeys. The unauthenticated sign-in ceremony lives in
# Api::V1::Auth::PasskeySessionsController.
module Api
  module V1
    class PasskeysController < ApplicationController
      include PasskeyCeremonies

      # GET /api/v1/passkeys
      def index
        render json: current_user.credentials.order(:created_at)
      end

      # POST /api/v1/passkeys/options
      #
      # The three settings that keep third-party providers (Proton Pass) in
      # the chain, per SPEC.md § Passkeys: resident_key "required" makes the
      # credential discoverable (usernameless sign-in), no
      # authenticator_attachment restriction keeps the browser from demanding
      # the machine's own authenticator, and attestation "none" is stated
      # explicitly because attestation policy is how sites accidentally block
      # third-party providers.
      def options
        if current_user.webauthn_id.blank?
          current_user.update!(webauthn_id: WebAuthn.generate_user_id)
        end

        creation_options = WebAuthn::Credential.options_for_create(
          user: { id: current_user.webauthn_id, name: current_user.email },
          exclude: current_user.credentials.pluck(:external_id),
          authenticator_selection: { resident_key: "required", user_verification: "required" },
          attestation: "none"
        )
        PasskeyChallenges.store_registration(current_user, creation_options.challenge)

        render json: creation_options
      end

      # POST /api/v1/passkeys
      def create
        challenge = PasskeyChallenges.take_registration!(current_user)
        return render_passkey_verification_failed if challenge.blank?

        webauthn_credential = WebAuthn::Credential.from_create(credential_params)
        webauthn_credential.verify(challenge, user_verification: true)

        credential = current_user.credentials.build(
          external_id: webauthn_credential.id,
          public_key:  webauthn_credential.public_key,
          sign_count:  webauthn_credential.sign_count,
          nickname:    params[:nickname].presence
        )

        if credential.save
          render json: credential, status: :created
        else
          render_validation_failed(credential)
        end
      rescue *CEREMONY_ERRORS
        render_passkey_verification_failed
      end

      # DELETE /api/v1/passkeys/:id — scoped to current_user, so another
      # user's credential is a 404, never a 403 (SPEC.md § API contract).
      def destroy
        current_user.credentials.find(params[:id]).destroy!
        head :no_content
      end

      private

      def render_passkey_verification_failed
        render_error("The passkey could not be verified. Try adding it again.",
                     code: "passkey_verification_failed", status: :unprocessable_entity)
      end
    end
  end
end
