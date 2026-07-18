# Shared plumbing for the two WebAuthn controllers (SPEC.md § Passkeys):
# Api::V1::PasskeysController (enrollment) and
# Api::V1::Auth::PasskeySessionsController (sign-in).
module PasskeyCeremonies
  extend ActiveSupport::Concern

  # Everything a ceremony verification can legitimately raise. WebAuthn::Error
  # covers a failed verification; the rest are what a hand-crafted body can
  # surface below it — a missing nested key, a non-string where base64url is
  # expected. All of them are a bad request, never a server error.
  CEREMONY_ERRORS = [ WebAuthn::Error, TypeError, NoMethodError, ArgumentError, KeyError ].freeze

  private

  def credential_params
    raw = params[:credential]
    raise TypeError, "credential must be an object" unless raw.is_a?(ActionController::Parameters)

    raw.to_unsafe_h
  end
end
