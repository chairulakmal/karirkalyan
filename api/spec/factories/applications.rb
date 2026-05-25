FactoryBot.define do
  factory :application do
    association :user
    company { Faker::Company.name }
    role    { Faker::Job.title }
    status  { "wishlist" }

    trait :draft do
      status { "draft" }
    end

    trait :applied do
      status     { "applied" }
      applied_at { Time.current }
    end

    trait :phone_screen do
      status     { "phone_screen" }
      applied_at { 3.days.ago }
    end

    trait :technical do
      status     { "technical" }
      applied_at { 5.days.ago }
    end

    trait :final_round do
      status     { "final_round" }
      applied_at { 7.days.ago }
    end

    trait :offer do
      status     { "offer" }
      applied_at { 10.days.ago }
    end

    trait :with_resume do
      resume { "%PDF-1.4 fake content".b }
    end

    trait :with_cover_letter do
      cover_letter { "%PDF-1.4 fake content".b }
    end
  end
end
