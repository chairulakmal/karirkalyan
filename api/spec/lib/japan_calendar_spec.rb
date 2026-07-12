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
