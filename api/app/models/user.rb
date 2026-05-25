class User < ApplicationRecord
  include Devise::JWT::RevocationStrategies::JTIMatcher

  devise :database_authenticatable, :registerable,
         :validatable,
         :jwt_authenticatable, jwt_revocation_strategy: self

  has_many :applications, dependent: :destroy
  has_many :timeline_entries, foreign_key: :actor_id, dependent: :destroy, inverse_of: :actor
end
