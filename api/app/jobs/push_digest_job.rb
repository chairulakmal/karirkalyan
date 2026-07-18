# The follow-up digest's push channel — SPEC.md § Push notifications.
#
# Enqueued by FollowUpReminderJob beside the mailer's deliver_later, one job
# per user per digest, carrying the ids that run's timeline claim already won.
# There is deliberately NO second idempotency claim here: the timeline entry
# is the one exactly-once anchor for both channels, and this job retrying
# re-sends at most a push — never a second email, never a second claim.
class PushDigestJob < ApplicationJob
  queue_as :default

  # A digest that could not be delivered today is superseded by tomorrow's,
  # not queued behind it.
  TTL = 24.hours.to_i

  def perform(user, application_ids)
    return unless PushVapid.configured?

    applications = user.applications.where(id: application_ids).order(:follow_up_at).to_a
    return if applications.empty?

    payload = payload_for(applications).to_json

    user.push_subscriptions.find_each do |subscription|
      deliver(subscription, payload)
    end
  end

  private

  # Mirrors the mailer's subject rule (SPEC.md § Mail): name the company when
  # there is exactly one, count when there are several. English-only, matching
  # the mailer this channel is a second copy of.
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

  def deliver(subscription, payload)
    WebPush.payload_send(
      message:  payload,
      endpoint: subscription.endpoint,
      p256dh:   subscription.p256dh,
      auth:     subscription.auth,
      ttl:      TTL,
      vapid:    PushVapid.vapid_options
    )
  rescue WebPush::ExpiredSubscription, WebPush::InvalidSubscription
    # The push service's 404/410: the browser revoked this subscription, and
    # pushsubscriptionchange is not reliably fired — pruning here is the only
    # dependable cleanup.
    Rails.logger.info("[push_digest] pruning revoked subscription #{subscription.id}")
    subscription.destroy!
  rescue WebPush::ResponseError => e
    # One dead endpoint must not cost the user's other devices their
    # notification — log and move on. Anything below ResponseError (network
    # errors, our own bugs) propagates into Solid Queue's retry.
    Rails.logger.warn("[push_digest] delivery failed for subscription #{subscription.id}: #{e.class}: #{e.message}")
  end
end
