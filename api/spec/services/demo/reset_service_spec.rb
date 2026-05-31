require "rails_helper"

RSpec.describe Demo::ResetService do
  describe ".call" do
    it "seeds the demo account when none exists yet" do
      expect(User.find_by(email: described_class::DEMO_EMAIL)).to be_nil

      described_class.call

      demo = User.find_by(email: described_class::DEMO_EMAIL)
      expect(demo).to be_present
      expect(demo.applications.count).to be > 0
    end

    it "replaces drifted demo data with a fresh set" do
      described_class.call
      demo = User.find_by(email: described_class::DEMO_EMAIL)
      original_id = demo.id
      demo.applications.first.update!(company: "Edited by a visitor")

      described_class.call

      reseeded = User.find_by(email: described_class::DEMO_EMAIL)
      expect(reseeded.id).not_to eq(original_id) # destroyed and recreated
      expect(reseeded.applications.pluck(:company)).not_to include("Edited by a visitor")
    end

    it "does not touch real (non-demo) users" do
      real = create(:user, email: "real@example.com")

      described_class.call

      expect(User.exists?(real.id)).to be true
    end
  end
end
