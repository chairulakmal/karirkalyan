# A WebAuthn passkey — one row per enrolled authenticator (SPEC.md § Passkeys,
# § Data model). Rows are created only by Api::V1::PasskeysController#create,
# after the webauthn gem has verified the attestation; nothing else writes here.
class Credential < ApplicationRecord
  belongs_to :user

  validates :external_id, presence: true, uniqueness: true
  validates :public_key,  presence: true
  validates :sign_count,  presence: true,
                          numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validates :nickname, length: { maximum: 100 }

  # The settings list needs nothing else; external_id and public_key have no
  # client-side use.
  def as_json(_options = {})
    super(only: %i[id nickname created_at last_used_at])
  end
end
