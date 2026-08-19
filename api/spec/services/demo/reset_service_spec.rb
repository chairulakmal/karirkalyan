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

    # The demo account is the portfolio walkthrough, and the two dashboard
    # sections that answer "what do I do today?" are both date-driven: the
    # Upcoming agenda shows the week ahead (SPEC.md § Dashboard layout) and the
    # ghost-risk card counts business days of silence. A seed carrying fixed
    # dates would satisfy every other example here and still hand a visitor two
    # empty panels a month after it was written, so what is asserted is the
    # property the dates exist for, not the dates themselves.
    #
    # The overdue item is the load-bearing one: the agenda's window has no lower
    # bound, so an item already past keeps the section populated however wide the
    # window is or how long ago the seed ran. `web/app/lib/agenda.ts` owns the
    # window itself; the week below is only a check that the near items land well
    # inside it, not a second definition of it.
    it "leaves both dated dashboard sections populated" do
      described_class.call
      demo = User.find_by(email: described_class::DEMO_EMAIL)

      agenda = demo.applications.where(status: ApplicationFSM::ACTIVE_STATES)
      overdue = agenda.where(follow_up_at: ...Time.current)
      this_week = agenda.where(follow_up_at: Time.current..7.days.from_now)
        .or(agenda.where(interview_at: Time.current..7.days.from_now))

      expect(overdue).to be_present
      expect(this_week).to be_present
      expect(demo.residence_expires_on).to be_present
      expect(Applications::GhostRiskQuery.new(user: demo).call[:at_risk]).to be_present
    end

    it "does not touch real (non-demo) users" do
      real = create(:user, email: "real@example.com")

      described_class.call

      expect(User.exists?(real.id)).to be true
    end
  end
end
