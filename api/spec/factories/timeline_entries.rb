FactoryBot.define do
  factory :timeline_entry do
    association :application
    actor       { association :user }
    from_status { "draft" }
    to_status   { "applied" }
  end
end
