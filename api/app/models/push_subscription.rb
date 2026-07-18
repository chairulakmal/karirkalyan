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

  belongs_to :user

  validates :endpoint, presence: true, uniqueness: true
  validates :p256dh,   presence: true
  validates :auth,     presence: true
  validate :user_within_subscription_limit, on: :create

  def as_json(_options = {})
    super(only: %i[id created_at])
  end

  private

  def user_within_subscription_limit
    return if user.blank?
    return if user.push_subscriptions.count < MAX_PER_USER

    errors.add(:base, :too_many_push_subscriptions,
      message: "You have reached the limit of #{MAX_PER_USER} push subscriptions. Remove one to add another.")
  end
end
