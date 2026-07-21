class User < ApplicationRecord
  include Devise::JWT::RevocationStrategies::JTIMatcher

  devise :database_authenticatable, :registerable,
         :validatable,
         :jwt_authenticatable, jwt_revocation_strategy: self

  has_many :applications, dependent: :destroy
  has_many :timeline_entries, foreign_key: :actor_id, dependent: :destroy, inverse_of: :actor
  has_many :credentials, dependent: :destroy
  has_many :agencies, dependent: :destroy
  has_many :push_subscriptions, dependent: :destroy

  # The user's own status of residence (the global half of the visa item). A
  # broader set than a role's Application::STATUSES_OF_RESIDENCE, because it
  # includes footings a job posting never offers: permanent_resident (no expiry,
  # no CoE on a job change) and spouse_or_dependent. SPEC.md § Data model.
  RESIDENCE_STATUSES = %w[
    engineer_specialist highly_skilled permanent_resident spouse_or_dependent other
  ].freeze

  # A permanent resident's status does not expire and a job change needs no
  # Certificate of Eligibility, so the UI reads this as "no clock."
  NO_EXPIRY_STATUSES = %w[permanent_resident].freeze

  validates :residence_status, inclusion: { in: RESIDENCE_STATUSES }, allow_nil: true

  def as_json(options = {})
    super(options.merge(except: Array(options[:except]) + %i[encrypted_password jti webauthn_id]))
  end

  # Whole days until the current status expires, or nil when there is no expiry
  # to count down (no date recorded, or a status that does not expire). Negative
  # when already lapsed, which the UI surfaces rather than clamps.
  def residence_days_remaining
    return nil if residence_expires_on.blank?
    return nil if residence_status.in?(NO_EXPIRY_STATUSES)

    (residence_expires_on - Date.current).to_i
  end
end
