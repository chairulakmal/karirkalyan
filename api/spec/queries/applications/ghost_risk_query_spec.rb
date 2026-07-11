require "rails_helper"

RSpec.describe Applications::GhostRiskQuery do
  let(:user) { create(:user) }

  subject(:result) { described_class.new(user: user).call }

  # An application that sat in `applied` for `dwell` days and then got a reply.
  # It ends in `rejected` — a response, and not itself a risk stage, so these
  # only ever feed the sample and never show up in `at_risk`.
  def responded(dwell:, applied_days_ago: 90, to: "rejected", user: self.user)
    applied_at = applied_days_ago.days.ago
    application = create(:application, user: user, status: to, applied_at: applied_at)
    create(:timeline_entry,
      application: application, actor: user,
      from_status: "applied", to_status: to,
      created_at: applied_at + dwell.days)
    application
  end

  describe "cold start" do
    it "falls back to the global default below MIN_SAMPLE" do
      4.times { responded(dwell: 2) }

      expect(result[:basis]["applied"]).to eq("default")
      expect(result[:sample_sizes]["applied"]).to eq(4)
      expect(result[:thresholds]["applied"]).to eq(described_class::DEFAULT_P90["applied"])
    end

    it "reports a default for a stage with no history at all" do
      expect(result[:sample_sizes]["phone_screen"]).to eq(0)
      expect(result[:basis]["phone_screen"]).to eq("default")
      expect(result[:thresholds]["phone_screen"]).to eq(14.0)
    end
  end

  describe "the personal threshold" do
    it "uses the user's own p90 once the sample is large enough" do
      [ 10, 12, 14, 16, 40 ].each { |dwell| responded(dwell: dwell) }

      # percentile_cont(0.9) over [10,12,14,16,40] interpolates at index 3.6:
      # 16 + 0.6 * (40 - 16) = 30.4.
      expect(result[:basis]["applied"]).to eq("personal")
      expect(result[:sample_sizes]["applied"]).to eq(5)
      expect(result[:thresholds]["applied"]).to eq(30.4)
    end

    it "clamps a fast p90 up to the floor" do
      5.times { responded(dwell: 1) }

      expect(result[:basis]["applied"]).to eq("personal")
      expect(result[:thresholds]["applied"]).to eq(described_class::FLOOR_DAYS)
    end

    it "clamps a slow p90 down to the ceiling" do
      5.times { responded(dwell: 200, applied_days_ago: 400) }

      expect(result[:thresholds]["applied"]).to eq(described_class::CEILING_DAYS)
    end

    it "excludes ghosted, withdrawn and archived exits from the sample" do
      described_class::NO_RESPONSE_EXITS.each { |exit_to| responded(dwell: 60, to: exit_to) }
      2.times { responded(dwell: 3) }

      # Only the two real responses count; the three non-responses would have
      # dragged the p90 up to 60 days had they been included.
      expect(result[:sample_sizes]["applied"]).to eq(2)
    end

    it "ignores another user's history" do
      5.times { responded(dwell: 30, user: create(:user)) }

      expect(result[:sample_sizes]["applied"]).to eq(0)
    end
  end

  describe "at_risk" do
    it "flags an application sitting past the threshold and leaves the rest alone" do
      stale  = create(:application, user: user, status: "applied",
                      company: "Mercari", applied_at: 30.days.ago)
      _fresh = create(:application, user: user, status: "applied", applied_at: 5.days.ago)

      expect(result[:at_risk].map { |a| a[:id] }).to eq([ stale.id ])
      expect(result[:at_risk].first).to include(
        company:       "Mercari",
        status:        "applied",
        threshold:     21.0,
        lock_version:  stale.lock_version
      )
      expect(result[:at_risk].first[:days_in_stage]).to be_within(0.2).of(30.0)
    end

    # The whole reason the query reads rows as exits: a directly-created `applied`
    # application has no `to_status = 'applied'` row to date the stage from.
    it "dates a directly-created application from its backdated applied_at" do
      create(:application, user: user, status: "applied", applied_at: 40.days.ago)

      expect(result[:at_risk].first[:days_in_stage]).to be_within(0.2).of(40.0)
    end

    it "dates a later stage from the transition that entered it, not applied_at" do
      application = create(:application, user: user, status: "phone_screen",
                           applied_at: 60.days.ago)
      create(:timeline_entry,
        application: application, actor: user,
        from_status: "applied", to_status: "phone_screen",
        created_at: 20.days.ago)

      entry = result[:at_risk].first
      expect(entry[:status]).to eq("phone_screen")
      expect(entry[:days_in_stage]).to be_within(0.2).of(20.0)
    end

    it "sorts longest silence first" do
      quiet   = create(:application, user: user, status: "applied", applied_at: 50.days.ago)
      quieter = create(:application, user: user, status: "applied", applied_at: 80.days.ago)

      expect(result[:at_risk].map { |a| a[:id] }).to eq([ quieter.id, quiet.id ])
    end

    it "only considers the risk stages" do
      create(:application, user: user, status: "technical",  applied_at: 200.days.ago)
      create(:application, user: user, status: "wishlist")

      expect(result[:at_risk]).to be_empty
    end

    it "ignores another user's applications" do
      create(:application, user: create(:user), status: "applied", applied_at: 90.days.ago)

      expect(result[:at_risk]).to be_empty
    end
  end
end
