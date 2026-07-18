FactoryBot.define do
  factory :credential do
    user
    external_id { SecureRandom.urlsafe_base64(32, padding: false) }
    public_key  { SecureRandom.urlsafe_base64(48, padding: false) }
    sign_count  { 0 }
  end
end
