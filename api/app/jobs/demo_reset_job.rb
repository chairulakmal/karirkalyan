# Resets the shared demo account back to its seeded state. Scheduled hourly in
# production (config/recurring.yml) so the account every visitor signs into via
# the "Try demo" button doesn't accumulate strangers' edits indefinitely.
#
# The real work — and the "only ever touches the demo user" guarantee — lives in
# Demo::ResetService; this is just the Solid Queue entry point.
class DemoResetJob < ApplicationJob
  queue_as :default

  def perform
    Demo::ResetService.call
  end
end
