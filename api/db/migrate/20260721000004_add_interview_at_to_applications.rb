class AddInterviewAtToApplications < ActiveRecord::Migration[8.1]
  # The upcoming-interview instant (TODO.md v1.9.0): source for the .ics export
  # and the v1.10.0 push reminders. One nullable datetime, not a per-stage
  # schedule: at personal-tracker scale you schedule the next interview, and the
  # per-stage history is already the timeline. Additive under the standing rule.
  def change
    add_column :applications, :interview_at, :datetime
  end
end
