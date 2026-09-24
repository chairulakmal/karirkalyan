namespace :demo do
  desc "Reset the shared demo account to a fresh seeded state (wipes the demo user's data, signs its sessions out, reseeds; real users untouched)"
  task reset: :environment do
    Demo::ResetService.call
    puts "Demo account reset complete — #{Application.joins(:user).where(users: { email: Demo::ResetService::DEMO_EMAIL }).count} applications seeded."
  end
end
