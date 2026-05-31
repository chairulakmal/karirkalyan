require "sidekiq-cron"

# Recurring schedules are registered only inside the Sidekiq *server* process
# (configure_server). They are never loaded in the Puma/web process or under
# RSpec, so booting the app or running the test suite touches neither Redis-cron
# state nor the schedule file.
Sidekiq.configure_server do |_config|
  schedule_path = Rails.root.join("config/sidekiq_cron.yml")
  next unless File.exist?(schedule_path)

  schedule = YAML.safe_load_file(schedule_path) || {}
  Sidekiq::Cron::Job.load_from_hash(schedule) if schedule.any?
end
