module Demo
  # Resets the shared demo account to a fresh seeded state. The "Try demo
  # account" button signs every visitor into ONE shared user, so its data
  # drifts as people explore — this wipes just that user (cascading to its
  # applications and timeline entries) and re-runs the seed.
  #
  # Deliberately scoped to the demo user: real sign-ups are never touched.
  class ResetService
    DEMO_EMAIL = "demo@karirkalyan.com".freeze

    def self.call
      new.call
    end

    def call
      User.find_by(email: DEMO_EMAIL)&.destroy!
      Rails.application.load_seed
    end
  end
end
