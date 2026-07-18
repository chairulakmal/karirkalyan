require "rails_helper"

RSpec.describe FollowUpReminderJob, type: :job do
  # Every example is anchored to midday JST on Friday 2026-07-10 — an ordinary business
  # day — so "today" is stable and the dead-zone examples below can move it deliberately.
  around { |example| travel_to(Time.zone.local(2026, 7, 10, 12, 0, 0)) { example.run } }

  let(:user) { create(:user) }
  let!(:application) do
    create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 7, 10, 9, 0, 0))
  end

  describe "#perform" do
    it "creates a timeline entry for a due application" do
      expect { described_class.new.perform }.to change(TimelineEntry, :count).by(1)
    end

    it "keys the idempotency key on the follow-up date, not on the day it fires" do
      described_class.new.perform
      expect(TimelineEntry.exists?(idempotency_key: "reminder-#{application.id}-2026-07-10")).to be true
    end

    it "is idempotent — no duplicate entry on retry" do
      described_class.new.perform
      expect { described_class.new.perform }.not_to change(TimelineEntry, :count)
    end

    it "skips applications not yet due" do
      create(:application, :applied, user: user, follow_up_at: 1.day.from_now)
      expect { described_class.new.perform }.to change(TimelineEntry, :count).by(1) # only the let!
    end

    it "skips terminal-state applications" do
      create(:application, user: user, status: "declined", follow_up_at: Time.current)
      expect { described_class.new.perform }.to change(TimelineEntry, :count).by(1)
    end
  end

  describe "dead zones" do
    # A reminder that fires on 1 January is noise. The job holds instead — and because
    # the scope reaches backwards, holding is a deferral, not a deletion.
    # Non-block `travel_to`: the `around` above is already inside one, and the block form
    # refuses to nest. The outer block's `travel_back` still restores real time afterwards.
    def perform_on(date)
      travel_to(Time.zone.local(date.year, date.month, date.day, 8, 15, 0))
      described_class.new.perform
    end

    it "sends nothing on a national holiday" do
      create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 7, 20, 9, 0, 0))
      expect { perform_on(Date.new(2026, 7, 20)) }.not_to change(TimelineEntry, :count)
    end

    it "sends nothing during Obon" do
      create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 8, 14, 9, 0, 0))
      expect { perform_on(Date.new(2026, 8, 14)) }.not_to change(TimelineEntry, :count)
    end

    # The property the whole design turns on: a reminder held through a dead zone is not
    # lost, it is delivered by the next business day's run.
    it "delivers a held reminder on the next business day" do
      held = create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 8, 14, 9, 0, 0))

      expect { perform_on(Date.new(2026, 8, 14)) }.not_to change(TimelineEntry, :count) # Obon
      # Only `held`: by August the anchor application above has aged past LOOKBACK.
      expect { perform_on(Date.new(2026, 8, 17)) }.to change(TimelineEntry, :count).by(1)

      expect(TimelineEntry.exists?(idempotency_key: "reminder-#{held.id}-2026-08-14")).to be true
    end
  end

  describe "overdue applications" do
    it "picks up a reminder whose date has passed" do
      overdue = create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 7, 6, 9, 0, 0))
      described_class.new.perform
      expect(TimelineEntry.exists?(idempotency_key: "reminder-#{overdue.id}-2026-07-06")).to be true
    end

    # An overdue application sits in the scope every morning until it is answered. The
    # follow_up_at-derived key is what stops that becoming a daily nudge.
    it "reminds about it once, not every morning until the user gives up on us" do
      create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 7, 6, 9, 0, 0))
      described_class.new.perform

      expect {
        travel_to(Time.zone.local(2026, 7, 13, 8, 15, 0))
        described_class.new.perform
      }.not_to change(TimelineEntry, :count)
    end

    it "ignores a follow-up date older than LOOKBACK — that is archaeology, not a reminder" do
      create(:application, :applied, user: user,
        follow_up_at: Time.zone.local(2026, 7, 10) - described_class::LOOKBACK - 1.day)
      expect { described_class.new.perform }.to change(TimelineEntry, :count).by(1) # only the let!
    end

    # A new date is a new key, so rescheduling produces a new nudge — which is what a
    # user who moved the date meant.
    it "re-arms when follow_up_at moves" do
      described_class.new.perform
      application.update!(follow_up_at: Time.zone.local(2026, 7, 10, 9, 0, 0) + 3.days)

      expect {
        travel_to(Time.zone.local(2026, 7, 13, 8, 15, 0))
        described_class.new.perform
      }.to change(TimelineEntry, :count).by(1)
    end
  end

  describe "the digest" do
    it "sends one email per user, not one per application" do
      create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 7, 10, 9, 0, 0))
      create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 7, 10, 9, 0, 0))

      expect { described_class.new.perform }
        .to have_enqueued_mail(FollowUpMailer, :digest).once
    end

    # Timeline entries are still written per application: the timeline is the
    # application's history, and "you were reminded" belongs on each one.
    it "still writes a timeline entry per application" do
      create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 7, 10, 9, 0, 0))
      expect { described_class.new.perform }.to change(TimelineEntry, :count).by(2)
    end

    it "gives each user their own digest" do
      other = create(:user)
      create(:application, :applied, user: other, follow_up_at: Time.zone.local(2026, 7, 10, 9, 0, 0))

      expect { described_class.new.perform }
        .to have_enqueued_mail(FollowUpMailer, :digest).twice
    end

    it "does not enqueue a duplicate email on retry" do
      described_class.new.perform
      expect { described_class.new.perform }.not_to have_enqueued_mail(FollowUpMailer, :digest)
    end

    it "enqueues nothing when nothing is due" do
      application.destroy!
      expect { described_class.new.perform }.not_to have_enqueued_mail(FollowUpMailer, :digest)
    end
  end

  # Two channels, one claim (SPEC.md § Push notifications): the timeline entry
  # is the exactly-once anchor for both, so the push job mirrors the mailer's
  # enqueue behaviour example for example.
  describe "the push channel" do
    it "enqueues one PushDigestJob per user, carrying the claimed ids" do
      second = create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 7, 10, 9, 0, 0))

      expect { described_class.new.perform }
        .to have_enqueued_job(PushDigestJob).with(user, match_array([ application.id, second.id ])).once
    end

    it "does not enqueue a duplicate push on retry" do
      described_class.new.perform
      expect { described_class.new.perform }.not_to have_enqueued_job(PushDigestJob)
    end
  end

  # The app runs in JST while timestamps are stored in UTC, so "due by end of today" must
  # mean the JST day — a late-evening JST reminder must not slip into the previous UTC day.
  describe "JST day boundary" do
    it "includes a reminder set for 23:30 JST today (14:30 UTC)" do
      create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 7, 10, 23, 30, 0))
      expect { described_class.new.perform }.to change(TimelineEntry, :count).by(2)
    end

    it "excludes a reminder set for 00:30 JST tomorrow (which a UTC DATE() would fire early)" do
      create(:application, :applied, user: user, follow_up_at: Time.zone.local(2026, 7, 11, 0, 30, 0))
      expect { described_class.new.perform }.to change(TimelineEntry, :count).by(1)
    end
  end
end
