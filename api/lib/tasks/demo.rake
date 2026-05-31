namespace :demo do
  desc "Reset the shared demo account to a fresh seeded state (destroys the demo user + reseeds; real users untouched)"
  task reset: :environment do
    Demo::ResetService.call
    puts "Demo account reset complete — #{Application.joins(:user).where(users: { email: Demo::ResetService::DEMO_EMAIL }).count} applications seeded."
  end
end
