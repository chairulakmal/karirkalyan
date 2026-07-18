FactoryBot.define do
  factory :push_subscription do
    user
    endpoint { "https://push.example/#{SecureRandom.urlsafe_base64(16, padding: false)}" }
    p256dh   { SecureRandom.urlsafe_base64(32, padding: false) }
    auth     { SecureRandom.urlsafe_base64(16, padding: false) }
  end
end
