require "rails_helper"

RSpec.describe Applications::GhostRiskQuery do
  let(:user) { create(:user) }

  subject(:result) { described_class.new(user: user).call }

  # Every number here is a count of BUSINESS days, so these specs pin the clock
  # instead of working in `n.days.ago`: the same interval is a different number
  # of business days depending on which weekends and holidays it falls across,
  # and that difference is the feature.
  #
  # June is the anchor because it is the one month with no Japanese national
  # holiday and no seasonal dead zone, so inside it a business day is simply a
  # weekday and every count below is checkable by hand.
  let(:now) { Time.zone.parse("2026-06-24 10:00") } # a Wednesday

  around { |example| travel_to(now) { example.run } }

  def at(date) = Time.zone.parse("#{date} 10:00")

  def applied_on(date, company: "Mercari")
    create(:application, user: user, status: "applied", company: company, applied_at: at(date))
  end

  describe "the thresholds" do
    it "reports the fixed per-stage thresholds, in business days" do
      expect(result[:thresholds]).to eq("applied" => 15, "phone_screen" => 10)
    end

    # The derived p90 is gone, and with it `basis` and `sample_sizes`. A user's
    # own history no longer moves the threshold at all, so a long run of fast
    # replies must not shorten it.
    it "does not move with the user's own response history" do
      5.times do |i|
        application = create(:application, user: user, status: "rejected", applied_at: at("2026-06-01"))
        create(:timeline_entry, application: application, actor: user,
               from_status: "applied", to_status: "rejected", created_at: at("2026-06-0#{i + 2}"))
      end

      expect(result[:thresholds]["applied"]).to eq(15)
      expect(result).not_to include(:basis, :sample_sizes)
    end
  end

  describe "at_risk" do
    it "flags an application past its threshold and leaves the rest alone" do
      # 2026-05-27 to 2026-06-24 is 20 business days; 2026-06-17 is 5.
      stale  = applied_on("2026-05-27")
      _fresh = applied_on("2026-06-17", company: "Cookpad")

      expect(result[:at_risk].map { |a| a[:id] }).to eq([ stale.id ])
      expect(result[:at_risk].first).to include(
        company:                "Mercari",
        status:                 "applied",
        threshold:              15,
        business_days_in_stage: 20,
        lock_version:           stale.lock_version
      )
    end

    # Strictly past, not at: the threshold is the last day that still counts as
    # a normal wait, so an application sitting exactly on it is not yet a flag.
    it "does not flag an application sitting exactly on the threshold" do
      applied_on("2026-06-03") # exactly 15 business days

      expect(result[:at_risk]).to be_empty
    end

    # The reason the elapsed-time arithmetic left SQL. Twenty-four calendar days
    # would have cleared the old 21-day default outright; across Golden Week it
    # is ten business days, and the company has not gone quiet at all.
    context "when the silence is mostly Golden Week" do
      let(:now) { Time.zone.parse("2026-05-11 10:00") }

      it "does not flag it" do
        applied_on("2026-04-17")

        expect(result[:at_risk]).to be_empty
      end
    end

    # The whole reason the query COALESCEs: a directly-created `applied`
    # application has no `to_status = 'applied'` row to date the stage from.
    it "dates a directly-created application from its backdated applied_at" do
      applied_on("2026-05-27")

      expect(result[:at_risk].first[:business_days_in_stage]).to eq(20)
    end

    it "dates a later stage from the transition that entered it, not applied_at" do
      application = create(:application, user: user, status: "phone_screen", applied_at: at("2026-03-02"))
      create(:timeline_entry,
        application: application, actor: user,
        from_status: "applied", to_status: "phone_screen",
        created_at: at("2026-05-27"))

      entry = result[:at_risk].first
      expect(entry[:status]).to eq("phone_screen")
      expect(entry[:business_days_in_stage]).to eq(20)
      expect(entry[:threshold]).to eq(10)
    end

    it "sorts longest silence first" do
      quiet   = applied_on("2026-05-27")            # 20 business days
      quieter = applied_on("2026-04-01", company: "Freee") # further back still

      expect(result[:at_risk].map { |a| a[:id] }).to eq([ quieter.id, quiet.id ])
    end

    it "only considers the risk stages" do
      create(:application, user: user, status: "technical", applied_at: at("2026-01-05"))
      create(:application, user: user, status: "wishlist")

      expect(result[:at_risk]).to be_empty
    end

    it "ignores another user's applications" do
      create(:application, user: create(:user), status: "applied", applied_at: at("2026-03-02"))

      expect(result[:at_risk]).to be_empty
    end
  end
end
