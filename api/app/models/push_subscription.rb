# A Web Push subscription — one row per browser that enabled notifications
# (SPEC.md § Push notifications, § Data model). endpoint + p256dh + auth
# together are the capability to notify that browser, which is why as_json
# strips all three: they never leave the server.
class PushSubscription < ApplicationRecord
  # What bounds the row count — the push_subscriptions/write throttle only
  # bounds the rate. Ten is far above real use (a person has a few browsers,
  # not ten); a bound, not an invariant, same accepted caveat as the other
  # two ceilings.
  MAX_PER_USER = 10

  # The job POSTs to whatever endpoint is stored, from the home host, so an
  # unchecked endpoint is a server-side request to an address a user chose
  # (and the demo password is public). Only the browser vendors' push services
  # are accepted, over https on the default port.
  PUSH_SERVICE_HOSTS = [
    /\Afcm\.googleapis\.com\z/,                   # Chrome, Edge on Android, most Chromium
    /\Aupdates\.push\.services\.mozilla\.com\z/, # Firefox
    /\A(?:[a-z0-9-]+\.)*push\.apple\.com\z/,       # Safari
    /\A(?:[a-z0-9-]+\.)*notify\.windows\.com\z/    # Edge on Windows
  ].freeze

  # The browser's keys are fixed-size: an uncompressed P-256 point and a
  # 16-byte secret. A malformed key raises inside web-push at send time.
  P256DH_BYTES = 65
  AUTH_BYTES = 16

  belongs_to :user

  validates :endpoint, presence: true, uniqueness: true
  validates :p256dh,   presence: true
  validates :auth,     presence: true
  validate :endpoint_is_a_push_service
  validate :keys_are_well_formed
  validate :user_within_subscription_limit, on: :create

  def as_json(_options = {})
    super(only: %i[id created_at])
  end

  private

  def endpoint_is_a_push_service
    return if endpoint.blank?

    uri = URI.parse(endpoint)
    return if uri.is_a?(URI::HTTPS) && uri.port == 443 && uri.userinfo.nil? &&
              PUSH_SERVICE_HOSTS.any? { |pattern| pattern.match?(uri.host.to_s.downcase) }

    errors.add(:endpoint, :not_a_push_service, message: "is not a known push service")
  rescue URI::InvalidURIError
    errors.add(:endpoint, :not_a_push_service, message: "is not a known push service")
  end

  def keys_are_well_formed
    if p256dh.present?
      point = key_bytes(p256dh)
      unless point&.bytesize == P256DH_BYTES && point.getbyte(0) == 4
        errors.add(:p256dh, :invalid, message: "is not a valid key")
      end
    end
    if auth.present? && key_bytes(auth)&.bytesize != AUTH_BYTES
      errors.add(:auth, :invalid, message: "is not a valid key")
    end
  end

  def key_bytes(value)
    Base64.urlsafe_decode64(value.delete("="))
  rescue ArgumentError
    nil
  end

  def user_within_subscription_limit
    return if user.blank?
    return if user.push_subscriptions.count < MAX_PER_USER

    errors.add(:base, :too_many_push_subscriptions,
      message: "You have reached the limit of #{MAX_PER_USER} push subscriptions. Remove one to add another.")
  end
end
