require "rails_helper"

RSpec.describe User do
  describe "residence status" do
    it "refuses a residence_status outside RESIDENCE_STATUSES" do
      expect(build(:user, residence_status: "tourist")).not_to be_valid
      expect(build(:user, residence_status: "engineer_specialist")).to be_valid
    end
  end

  describe "#residence_days_remaining" do
    it "counts whole days to the expiry" do
      user = build(:user, residence_status: "engineer_specialist", residence_expires_on: Date.current + 30)

      expect(user.residence_days_remaining).to eq(30)
    end

    it "goes negative once the status has lapsed, rather than clamping" do
      user = build(:user, residence_status: "engineer_specialist", residence_expires_on: Date.current - 5)

      expect(user.residence_days_remaining).to eq(-5)
    end

    it "is nil when no expiry is recorded" do
      user = build(:user, residence_status: "engineer_specialist", residence_expires_on: nil)

      expect(user.residence_days_remaining).to be_nil
    end

    it "is nil for a permanent resident even with a date, because that status has no clock" do
      user = build(:user, residence_status: "permanent_resident", residence_expires_on: Date.current + 100)

      expect(user.residence_days_remaining).to be_nil
    end
  end
end
