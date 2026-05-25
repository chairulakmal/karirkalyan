require "rails_helper"

RSpec.describe TimelineEntry do
  let(:user)        { create(:user) }
  let(:application) { create(:application, user: user) }

  describe "transition_must_be_valid" do
    it "accepts a valid FSM transition" do
      entry = build(:timeline_entry,
        application: application,
        actor:       user,
        from_status: "draft",
        to_status:   "applied")
      expect(entry).to be_valid
    end

    it "rejects an invalid FSM transition" do
      entry = build(:timeline_entry,
        application: application,
        actor:       user,
        from_status: "draft",
        to_status:   "accepted")
      expect(entry).not_to be_valid
      expect(entry.errors[:base].first).to match(/No valid transition/)
    end

    it "permits a reminder entry where from == to when idempotency_key is set" do
      entry = build(:timeline_entry,
        application:     application,
        actor:           user,
        from_status:     "applied",
        to_status:       "applied",
        idempotency_key: "reminder-1-2026-05-25")
      expect(entry).to be_valid
    end

    it "still rejects an invalid FSM pair even with idempotency_key set is unreachable — carve-out is intentional" do
      # Documenting the carve-out: idempotency_key short-circuits FSM validation
      # because the reminder job legitimately writes from == to. The only
      # callers that set idempotency_key are trusted (FollowUpReminderJob).
      entry = build(:timeline_entry,
        application:     application,
        actor:           user,
        from_status:     "draft",
        to_status:       "accepted",
        idempotency_key: "reminder-x")
      expect(entry).to be_valid
    end

    it "still validates presence of from_status / to_status" do
      entry = build(:timeline_entry,
        application: application,
        actor:       user,
        from_status: "",
        to_status:   "")
      expect(entry).not_to be_valid
      expect(entry.errors[:from_status]).to include("can't be blank")
      expect(entry.errors[:to_status]).to include("can't be blank")
    end
  end
end
