require "rails_helper"

RSpec.describe JapanCalendar do
  describe ".business_day?" do
    it "is true on an ordinary weekday" do
      expect(described_class.business_day?(Date.new(2026, 7, 10))).to be true # Friday
    end

    it "is false at the weekend" do
      expect(described_class.business_day?(Date.new(2026, 7, 11))).to be false # Saturday
      expect(described_class.business_day?(Date.new(2026, 7, 12))).to be false # Sunday
    end

    it "is false on a national holiday" do
      expect(described_class.business_day?(Date.new(2026, 7, 20))).to be false # 海の日
    end

    # The reason the `holidays` gem is a dependency rather than a hardcoded array:
    # 秋分の日 is fixed by cabinet proclamation against the equinox, so its date moves.
    it "is false on an equinox holiday, whose date is astronomical" do
      expect(described_class.business_day?(Date.new(2026, 9, 23))).to be false # 秋分の日
      expect(described_class.business_day?(Date.new(2027, 9, 23))).to be false
    end

    # 振替休日: 憲法記念日 (3 May) fell on a Sunday in 2026, displacing the substitute
    # holiday onto the following Wednesday — a rule, not a date. (It sits inside Golden
    # Week anyway; 2020's 憲法記念日 substitute is the same rule outside the run.)
    it "is false on a substitute holiday (振替休日)" do
      expect(described_class.business_day?(Date.new(2026, 5, 6))).to be false
    end

    describe "seasonal dead zones — not public holidays, but nobody is answering" do
      it "covers 年末年始, across the year boundary" do
        expect(described_class.business_day?(Date.new(2026, 12, 29))).to be false
        expect(described_class.business_day?(Date.new(2026, 12, 31))).to be false
        expect(described_class.business_day?(Date.new(2027, 1, 2))).to be false
        expect(described_class.business_day?(Date.new(2027, 1, 5))).to be true
      end

      # The working days wedged between Golden Week's real holidays are the point:
      # 30 April 2026 is a Thursday and not a holiday, but no one is at their desk.
      it "covers Golden Week, including the working days inside it" do
        expect(described_class.business_day?(Date.new(2026, 4, 30))).to be false
        expect(described_class.business_day?(Date.new(2026, 5, 1))).to be false
      end

      # Obon has no legal status at all — the gem does not know it.
      it "covers Obon" do
        expect(described_class.business_day?(Date.new(2026, 8, 13))).to be false
        expect(described_class.business_day?(Date.new(2026, 8, 14))).to be false
        expect(described_class.business_day?(Date.new(2026, 8, 17))).to be true # Monday after
      end
    end
  end

  describe ".business_days_between" do
    # June is the only month with no national holiday and no seasonal dead zone,
    # so inside it business days are just weekdays and the count is checkable
    # by hand: Jun 3 and Jun 24 are both Wednesdays, three clean weeks apart.
    it "counts weekdays across a clean span" do
      expect(described_class.business_days_between(Date.new(2026, 6, 3), Date.new(2026, 6, 24))).to eq(15)
    end

    it "is exclusive of the start and inclusive of the end" do
      friday = Date.new(2026, 6, 19)

      expect(described_class.business_days_between(friday, friday)).to eq(0)
      expect(described_class.business_days_between(friday, Date.new(2026, 6, 20))).to eq(0) # Saturday
      expect(described_class.business_days_between(friday, Date.new(2026, 6, 22))).to eq(1) # Monday
    end

    it "skips national holidays, Golden Week, Obon and the New Year" do
      # 24 calendar days across Golden Week, but only 10 a company could answer on.
      expect(described_class.business_days_between(Date.new(2026, 4, 17), Date.new(2026, 5, 11))).to eq(10)
      # Obon plus Mountain Day.
      expect(described_class.business_days_between(Date.new(2026, 8, 7), Date.new(2026, 8, 21))).to eq(7)
      # The New Year shutdown, which wraps the year boundary: of fourteen days
      # only Dec 28 and Jan 4-8 survive, Jan 1 being a holiday in its own right.
      expect(described_class.business_days_between(Date.new(2026, 12, 25), Date.new(2027, 1, 8))).to eq(6)
    end

    it "reads timestamps in the app's zone, not UTC" do
      # 15:00 UTC on the 21st is already the 22nd in Tokyo, so the span to the
      # 24th is two business days, not three.
      entered = Time.utc(2026, 6, 21, 15, 0)

      expect(described_class.business_days_between(entered, Time.zone.parse("2026-06-24 10:00"))).to eq(2)
    end

    # business_days_between does not call business_day? per date: it pulls the
    # national holidays for the span in one gem call, because doing it per date
    # cost 13.7s for the dashboard's worst case. That makes the two definitions
    # of "business day" separate code paths, so this pins them together over a
    # span carrying every kind of dead zone: two New Years, Golden Week, Obon,
    # the equinoxes, and a 振替休日.
    it "agrees with counting business_day? one date at a time" do
      from = Date.new(2025, 11, 30)
      to   = Date.new(2027, 3, 31)
      naive = ((from + 1)..to).count { |date| described_class.business_day?(date) }

      expect(described_class.business_days_between(from, to)).to eq(naive)
      expect(naive).to be > 300 # a span worth checking, not an empty range
    end

    it "is zero rather than negative when the end precedes the start" do
      expect(described_class.business_days_between(Date.new(2026, 6, 24), Date.new(2026, 6, 3))).to eq(0)
    end

    it "is zero when either end is missing" do
      expect(described_class.business_days_between(nil, Date.new(2026, 6, 24))).to eq(0)
      expect(described_class.business_days_between(Date.new(2026, 6, 3), nil)).to eq(0)
    end
  end

  describe ".dead_zone_reason" do
    it "is nil on a business day" do
      expect(described_class.dead_zone_reason(Date.new(2026, 7, 10))).to be_nil
    end

    it "names why the day is dead" do
      expect(described_class.dead_zone_reason(Date.new(2026, 7, 11))).to eq(:weekend)
      expect(described_class.dead_zone_reason(Date.new(2026, 7, 20))).to eq(:national_holiday)
      expect(described_class.dead_zone_reason(Date.new(2026, 8, 14))).to eq(:obon)
      expect(described_class.dead_zone_reason(Date.new(2026, 12, 30))).to eq(:new_year)
    end
  end
end
