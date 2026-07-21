module Push
  # Delivers one notification payload to all of a user's push subscriptions,
  # pruning the ones the push service reports revoked and returning the first
  # transient error (without raising) so the caller can retry the whole job
  # after every device got its attempt. Extracted from PushDigestJob so the
  # interview-reminder channel (v1.10.0) reuses the same retry/pruning contract
  # rather than a drifting copy of it. SPEC.md § Push notifications.
  class Notifier
    # Failures that plausibly pass on a later attempt: network-level errors the
    # web-push gem does not wrap, plus the push service's own 429. The caller's
    # retry_on keys on this same list, so the two cannot drift.
    TRANSIENT_ERRORS = [
      WebPush::TooManyRequests,
      Net::OpenTimeout, Net::ReadTimeout, SocketError,
      OpenSSL::SSL::SSLError, Errno::ECONNRESET, Errno::ECONNREFUSED
    ].freeze

    def initialize(user)
      @user = user
    end

    # payload: a Hash ({ title:, body:, url:, tag? }); ttl in seconds. Returns
    # the first transient error encountered (without raising) or nil, so one
    # flaky endpoint cannot cost the user's other devices their notification.
    def deliver(payload, ttl:)
      return nil unless PushVapid.configured?

      json = payload.to_json
      first_transient = nil
      @user.push_subscriptions.find_each do |subscription|
        error = deliver_one(subscription, json, ttl)
        first_transient ||= error
      end
      first_transient
    end

    private

    # nil on success and on terminally-failed endpoints; the exception (without
    # raising) for transient failures, so the loop can finish the others.
    def deliver_one(subscription, json, ttl)
      WebPush.payload_send(
        message:  json,
        endpoint: subscription.endpoint,
        p256dh:   subscription.p256dh,
        auth:     subscription.auth,
        ttl:      ttl,
        vapid:    PushVapid.vapid_options
      )
      nil
    rescue WebPush::ExpiredSubscription, WebPush::InvalidSubscription
      # The push service's 404/410: the browser revoked this subscription, and
      # pushsubscriptionchange is not reliably fired, so pruning here is the only
      # dependable cleanup.
      Rails.logger.info("[push] pruning revoked subscription #{subscription.id}")
      subscription.destroy!
      nil
    rescue *TRANSIENT_ERRORS => e
      Rails.logger.warn("[push] transient failure for subscription #{subscription.id}: #{e.class}: #{e.message}")
      e
    rescue WebPush::ResponseError => e
      # Any other push-service refusal is terminal for this attempt: log, keep
      # the row, and move on so a systemic problem shows in logs rather than as
      # the user's other devices going silent.
      Rails.logger.warn("[push] delivery failed for subscription #{subscription.id}: #{e.class}: #{e.message}")
      nil
    end
  end
end
