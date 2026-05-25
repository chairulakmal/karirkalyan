class FollowUpReminderJob < ApplicationJob
  queue_as :default

  def perform
    due = Application
      .where("DATE(follow_up_at) = ?", Date.today)
      .where.not(status: ApplicationFSM::TERMINAL_STATES)

    due.find_each do |application|
      key = "reminder-#{application.id}-#{Date.today}"
      next if TimelineEntry.exists?(idempotency_key: key)

      TimelineEntry.create!(
        application:     application,
        actor:           application.user,
        from_status:     application.status,
        to_status:       application.status,
        note:            "Follow-up reminder",
        idempotency_key: key
      )
    end
  end
end
