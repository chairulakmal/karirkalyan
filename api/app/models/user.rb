class User < ApplicationRecord
  include Devise::JWT::RevocationStrategies::JTIMatcher

  devise :database_authenticatable, :registerable,
         :validatable,
         :jwt_authenticatable, jwt_revocation_strategy: self

  has_many :applications, dependent: :destroy
  has_many :timeline_entries, foreign_key: :actor_id, dependent: :destroy, inverse_of: :actor
  has_many :credentials, dependent: :destroy

  def as_json(options = {})
    super(options.merge(except: Array(options[:except]) + %i[encrypted_password jti webauthn_id]))
  end
end
