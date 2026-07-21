require "rails_helper"

RSpec.describe Exports::InterviewCalendar do
  let(:user) { create(:user) }

  describe "#call" do
    it "returns nil when no interview is scheduled" do
      application = build(:application, interview_at: nil)

      expect(described_class.new(application).call).to be_nil
    end

    it "emits a single VEVENT with the interview as a UTC DTSTART" do
      # 15:00 JST is 06:00 UTC; the Z instant is what lets the user's own calendar
      # render it in their zone with no timezone math on our side.
      application = create(:application, user: user,
        company: "Mercari", role: "Backend Engineer",
        interview_at: Time.zone.local(2026, 7, 25, 15, 0, 0))

      ics = described_class.new(application).call

      expect(ics).to include("BEGIN:VCALENDAR", "BEGIN:VEVENT", "END:VEVENT", "END:VCALENDAR")
      expect(ics).to include("DTSTART:20260725T060000Z")
      # One hour is the honest default duration when only the start is known.
      expect(ics).to include("DTEND:20260725T070000Z")
      expect(ics).to include("SUMMARY:Interview: Mercari (Backend Engineer)")
      # A stable UID means a reschedule updates the same event, not a duplicate.
      expect(ics).to include("UID:interview-#{application.id}@karirkalyan")
      # RFC 5545 lines are CRLF-delimited.
      expect(ics).to include("\r\n")
    end

    it "escapes RFC 5545 TEXT specials in the summary" do
      application = create(:application, user: user,
        company: "Mercari, Inc.", role: "SRE; Platform",
        interview_at: Time.zone.local(2026, 7, 25, 15, 0, 0))

      ics = described_class.new(application).call

      expect(ics).to include('SUMMARY:Interview: Mercari\, Inc. (SRE\; Platform)')
    end
  end

  describe "#filename" do
    it "names the file after the company, ending in -interview.ics" do
      application = build(:application, company: "Mercari")

      expect(described_class.new(application).filename).to eq("Mercari-interview.ics")
    end

    it "falls back to a bare interview.ics when the company slug is empty" do
      application = build(:application, company: "！！！")

      expect(described_class.new(application).filename).to eq("interview.ics")
    end
  end
end
