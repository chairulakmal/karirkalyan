# The VAPID keypair Web Push signs with — SPEC.md § Push notifications.
#
# Read from env at call time, per environment, never from the repo. The vars
# are deliberately OPTIONAL (the ANTHROPIC_API_KEY pattern, not the
# DEVISE_JWT_SECRET_KEY one): with no keys the app boots and serves, the
# subscribe endpoints answer 503 push_unavailable, and the digest stays
# email-only. That is what keeps the required env set unchanged under the
# versioning rules. Generate a pair with `bin/rails push:vapid`.
module PushVapid
  class << self
    def configured?
      public_key.present? && private_key.present?
    end

    def public_key
      ENV["VAPID_PUBLIC_KEY"].to_s
    end

    def private_key
      ENV["VAPID_PRIVATE_KEY"].to_s
    end

    # A contact for push services to reach the operator about misbehaving
    # senders. The erasure-request mailbox is the operator contact this app
    # already publishes (/privacy), so it is the honest default.
    def subject
      ENV.fetch("VAPID_SUBJECT", "mailto:karirkalyan@cypherpunkzero.com")
    end

    def vapid_options
      { subject: subject, public_key: public_key, private_key: private_key }
    end
  end
end
