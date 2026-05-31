class FollowUpReminderJob < ApplicationJob
  queue_as :default

  def perform
    due = Application
      .where("DATE(follow_up_at) = ?", Date.current)
      .where.not(status: ApplicationFSM::TERMINAL_STATES)

    due.find_each do |application|
      key = "reminder-#{application.id}-#{Date.current}"
      next if TimelineEntry.exists?(idempotency_key: key)

      TimelineEntry.create!(
        application:     application,
        actor:           application.user,
        from_status:     application.status,
        to_status:       application.status,
        note:            "Follow-up reminder",
        idempotency_key: key
      )

      # The TimelineEntry above is the exactly-once anchor (unique idempotency
      # key). Email delivery is decoupled via deliver_later — a separate,
      # independently-retriable mail job — so a transient SMTP failure retries
      # the email without ever duplicating the timeline entry.
      FollowUpMailer.reminder(application).deliver_later
    end
  end
end
