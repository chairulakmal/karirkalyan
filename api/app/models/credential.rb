# A WebAuthn passkey — one row per enrolled authenticator (SPEC.md § Passkeys,
# § Data model). Rows are created only by Api::V1::PasskeysController#create,
# after the webauthn gem has verified the attestation; nothing else writes here.
class Credential < ApplicationRecord
  # What bounds the row count — the passkeys/write throttle only bounds the
  # rate, and every throttle window resets (the Application::MAX_PER_USER
  # argument, in miniature). Far above real use: one person enrolls a handful
  # of authenticators, not twenty. A bound, not an invariant — the count and
  # the insert share no lock, same accepted caveat as Application's ceiling.
  MAX_PER_USER = 20

  belongs_to :user

  validates :external_id, presence: true, uniqueness: true
  validates :public_key,  presence: true
  validates :sign_count,  presence: true,
                          numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :nickname, length: { maximum: 100 }
  validate :user_within_passkey_limit, on: :create

  # The settings list needs nothing else; external_id and public_key have no
  # client-side use.
  def as_json(_options = {})
    super(only: %i[id nickname created_at last_used_at])
  end

  private

  def user_within_passkey_limit
    return if user.blank?
    return if user.credentials.count < MAX_PER_USER

    errors.add(:base, :too_many_passkeys,
      message: "You have reached the limit of #{MAX_PER_USER} passkeys. Remove one to add another.")
  end
end
