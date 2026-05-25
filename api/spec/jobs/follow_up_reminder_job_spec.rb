require "rails_helper"

RSpec.describe FollowUpReminderJob, type: :job do
  describe "#perform" do
    let(:user)        { create(:user) }
    let(:application) { create(:application, :applied, user: user, follow_up_at: Time.current) }

    it "creates a timeline entry for due applications" do
      application
      expect { described_class.new.perform }
        .to change(TimelineEntry, :count).by(1)
    end

    it "sets the idempotency key" do
      application # force creation before job runs
      described_class.new.perform
      key = "reminder-#{application.id}-#{Date.today}"
      expect(TimelineEntry.exists?(idempotency_key: key)).to be true
    end

    it "is idempotent — does not create a duplicate on retry" do
      described_class.new.perform
      expect { described_class.new.perform }
        .not_to change(TimelineEntry, :count)
    end

    it "skips applications not due today" do
      create(:application, :applied, user: user, follow_up_at: 1.day.from_now)
      expect { described_class.new.perform }
        .not_to change(TimelineEntry, :count)
    end

    it "skips terminal-state applications" do
      create(:application, user: user, status: "rejected", follow_up_at: Time.current)
      expect { described_class.new.perform }
        .not_to change(TimelineEntry, :count)
    end
  end
end
