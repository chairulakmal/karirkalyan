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

  # Failures that plausibly pass on a later attempt: network-level errors the
  # web-push gem does not wrap, plus the push service's own 429. Collected
  # per-subscription and re-raised AFTER the loop (see #perform), then retried
  # with backoff. Retry is declared, not assumed — Solid Queue has no implicit
  # retry; an uncaught raise parks in solid_queue_failed_executions.
  TRANSIENT_ERRORS = [
    WebPush::TooManyRequests,
    Net::OpenTimeout, Net::ReadTimeout, SocketError,
    OpenSSL::SSL::SSLError, Errno::ECONNRESET, Errno::ECONNREFUSED
  ].freeze

  retry_on(*TRANSIENT_ERRORS, wait: :polynomially_longer, attempts: 3)

  # A digest that could not be delivered today is superseded by tomorrow's,
  # not queued behind it.
  TTL = 24.hours.to_i

  def perform(user, application_ids)
    return unless PushVapid.configured?

    applications = user.applications.where(id: application_ids).order(:follow_up_at).to_a
    return if applications.empty?

    payload = payload_for(applications).to_json

    first_transient = nil
    user.push_subscriptions.find_each do |subscription|
      error = deliver(subscription, payload)
      first_transient ||= error
    end

    # Raised only after every subscription got its attempt, so one flaky
    # endpoint cannot cost the user's other devices their notification —
    # retry_on then re-runs the whole job, and the notification tag makes the
    # re-send a visual no-op on devices that already showed it.
    raise first_transient if first_transient
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

  # Returns nil on success and on terminally-failed endpoints; returns the
  # exception (without raising) for transient failures, so the loop can finish
  # the other subscriptions before #perform re-raises it.
  def deliver(subscription, payload)
    WebPush.payload_send(
      message:  payload,
      endpoint: subscription.endpoint,
      p256dh:   subscription.p256dh,
      auth:     subscription.auth,
      ttl:      TTL,
      vapid:    PushVapid.vapid_options
    )
    nil
  rescue WebPush::ExpiredSubscription, WebPush::InvalidSubscription
    # The push service's 404/410: the browser revoked this subscription, and
    # pushsubscriptionchange is not reliably fired — pruning here is the only
    # dependable cleanup.
    Rails.logger.info("[push_digest] pruning revoked subscription #{subscription.id}")
    subscription.destroy!
    nil
  rescue *TRANSIENT_ERRORS => e
    Rails.logger.warn("[push_digest] transient failure for subscription #{subscription.id}: #{e.class}: #{e.message}")
    e
  rescue WebPush::ResponseError => e
    # Any other push-service refusal is terminal for this attempt: log and
    # move on, keeping the row — a systemic version of this shows up in the
    # logs, not as the user's other devices going silent.
    Rails.logger.warn("[push_digest] delivery failed for subscription #{subscription.id}: #{e.class}: #{e.message}")
    nil
  end
end
