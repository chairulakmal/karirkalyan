# Sidekiq is currently disabled. The queue adapter is set to :async (in-process
# thread pool) and Redis is not required at runtime.
#
# To re-enable: see "Re-enabling Sidekiq" in CLAUDE.md.
#
# require "sidekiq-cron"
#
# Sidekiq.configure_server do |_config|
#   schedule_path = Rails.root.join("config/sidekiq_cron.yml")
#   next unless File.exist?(schedule_path)
#
#   schedule = YAML.safe_load_file(schedule_path) || {}
#   Sidekiq::Cron::Job.load_from_hash(schedule) if schedule.any?
# end
