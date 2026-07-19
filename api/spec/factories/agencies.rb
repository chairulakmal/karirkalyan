FactoryBot.define do
  factory :agency do
    association :user
    sequence(:name) { |n| "Agency #{n}" }
  end
end
