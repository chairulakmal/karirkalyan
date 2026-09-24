FactoryBot.define do
  factory :push_subscription do
    user
    endpoint { PushKeys.endpoint }
    p256dh   { PushKeys.p256dh }
    auth     { PushKeys.auth }
  end
end
