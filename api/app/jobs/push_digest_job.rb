# The follow-up digest's push channel — SPEC.md § Push notifications.
#
# Enqueued by FollowUpReminderJob beside the mailer's deliver_later, one job
# per user per digest, carrying the ids that run's timeline claim already won.
# There is deliberately NO second idempotency claim here: the timeline entry
# is the one exactly-once anchor for both channels, and this job retrying
# re-sends at most a push — never a second email, never a second claim. The
# retry is safe on the device side too: the service worker tags the digest
# notification, so a re-delivered push replaces the one already showing
# instead of stacking a duplicate.
class PushDigestJob < ApplicationJob
  queue_as :default

  # The delivery loop, retry list, and pruning now live in Push::Notifier, shared
  # with the interview-reminder channel. Retry is declared, not assumed: Solid
  # Queue has no implicit retry; an uncaught raise parks in
  # solid_queue_failed_executions. The retry list keys on Notifier's own so the
  # two cannot drift.
  retry_on(*Push::Notifier::TRANSIENT_ERRORS, wait: :polynomially_longer, attempts: 3)

  # A digest that could not be delivered today is superseded by tomorrow's,
  # not queued behind it.
  TTL = 24.hours.to_i

  def perform(user, application_ids)
    return unless PushVapid.configured?

    applications = user.applications.where(id: application_ids).order(:follow_up_at).to_a
    return if applications.empty?

    # Notifier delivers to every subscription and returns the first transient
    # error; re-raised here so retry_on re-runs the whole job, and the notification
    # tag makes the re-send a visual no-op on devices that already showed it.
    transient = Push::Notifier.new(user).deliver(payload_for(applications), ttl: TTL)
    raise transient if transient
  end

  private

  # Mirrors the mailer's subject rule (SPEC.md § Mail): name the company when
  # there is exactly one, count when there are several. English-only and
  # locale-unprefixed deep links, both inherited from the mailer this channel
  # mirrors (SPEC.md § Push notifications records the inheritance).
  def payload_for(applications)
    if applications.size == 1
      application = applications.first
      {
        title: "Follow up on your #{application.company} application",
        body:  "#{application.role} — due #{application.follow_up_at.in_time_zone.strftime('%B %-d')}",
        url:   "/applications/#{application.id}"
      }
    else
      {
        title: "#{applications.size} follow-ups due today",
        body:  applications.map(&:company).uniq.join(", "),
        url:   "/dashboard"
      }
    end
  end
end
