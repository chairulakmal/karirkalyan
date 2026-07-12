require "rails_helper"
require "csv"

RSpec.describe Exports::ApplicationsCsv do
  let(:user) { create(:user) }

  def rows
    CSV.parse(described_class.new(user).call, headers: true)
  end

  it "writes a header row of the documented columns" do
    expect(rows.headers).to eq(described_class::COLUMNS)
  end

  it "writes one row per application" do
    create_list(:application, 3, user: user)
    expect(rows.size).to eq(3)
  end

  it "is scoped to the user — another account's applications never appear" do
    create(:application, user: create(:user), company: "Somebody Else Inc")
    create(:application, user: user, company: "Mine")

    expect(rows.map { |row| row["company"] }).to eq([ "Mine" ])
  end

  it "carries the fields a spreadsheet can hold" do
    create(:application, :applied, user: user, company: "Mercari", role: "Backend Engineer",
      url: "https://example.com/jobs/1")

    row = rows.first
    expect(row["company"]).to eq("Mercari")
    expect(row["role"]).to eq("Backend Engineer")
    expect(row["status"]).to eq("applied")
    expect(row["url"]).to eq("https://example.com/jobs/1")
    expect(row["applied_at"]).to be_present
  end

  # Blobs cannot go in a spreadsheet cell — a boolean saying whether one exists can, and
  # tells the user which rows the account archive is carrying files for.
  it "replaces the blobs with has_resume / has_cover_letter booleans" do
    create(:application, :with_resume, user: user)

    row = rows.first
    expect(row["has_resume"]).to eq("true")
    expect(row["has_cover_letter"]).to eq("false")
    expect(row.headers).not_to include("resume", "cover_letter")
  end

  describe "CSV injection" do
    # A company literally named `=cmd|...` is a payload the moment the file is opened in
    # Excel, and this is a file we hand a user and expect them to open in Excel.
    it "prefixes a formula-leading cell with a single quote" do
      create(:application, user: user, company: "=cmd|'/c calc'!A1", role: "@SUM(1+1)")

      row = rows.first
      expect(row["company"]).to eq("'=cmd|'/c calc'!A1")
      expect(row["role"]).to eq("'@SUM(1+1)")
    end

    it "escapes every formula-leading character, not just =" do
      create(:application, user: user, company: "+1", role: "-1", notes: "@x")

      row = rows.first
      expect(row["company"]).to eq("'+1")
      expect(row["role"]).to eq("'-1")
      expect(row["notes"]).to eq("'@x")
    end

    it "leaves an ordinary value alone" do
      create(:application, user: user, company: "Mercari")
      expect(rows.first["company"]).to eq("Mercari")
    end

    it "quotes every field" do
      create(:application, user: user, company: "Mercari")
      expect(described_class.new(user).call).to include('"Mercari"')
    end
  end

  it "names the file with the date it was taken" do
    travel_to(Time.zone.local(2026, 7, 12, 9, 0, 0)) do
      expect(described_class.new(user).filename).to eq("karirkalyan-applications-2026-07-12.csv")
    end
  end
end
