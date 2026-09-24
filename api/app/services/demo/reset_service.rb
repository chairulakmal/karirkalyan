module Demo
  # Resets the shared demo account to a fresh seeded state. The "Try demo
  # account" button signs every visitor into ONE shared user, so its data
  # drifts as people explore; this wipes that user's data and re-runs the seed.
  #
  # The users row itself is kept, so its id stays stable: every per-account
  # throttle keys on the JWT `sub`, and a new id each hour gave the public demo
  # a fresh daily AI budget every hour. The data goes by delete_all, never by
  # destroy!, which would load every uploaded PDF into memory first. Rotating
  # the jti still signs every demo session out, as destroying the user did.
  #
  # Deliberately scoped to the demo user: real sign-ups are never touched.
  class ResetService
    DEMO_EMAIL = "demo@karirkalyan.com".freeze

    def self.call
      new.call
    end

    def call
      ActiveRecord::Base.transaction do
        user = User.find_by(email: DEMO_EMAIL)
        wipe(user) if user
        Rails.application.load_seed
      end
    end

    private

    def wipe(user)
      TimelineEntry.where(application_id: user.applications.select(:id))
                   .or(TimelineEntry.where(actor_id: user.id))
                   .delete_all
      user.applications.delete_all
      user.agencies.delete_all
      user.credentials.delete_all
      user.push_subscriptions.delete_all
      user.update_columns(jti: SecureRandom.uuid, updated_at: Time.current)
    end
  end
end
