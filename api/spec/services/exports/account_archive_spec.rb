require "rails_helper"
require "zip"

RSpec.describe Exports::AccountArchive do
  let(:user) { create(:user, email: "candidate@example.com") }

  def archive
    Zip::File.open_buffer(StringIO.new(described_class.new(user).call))
  end

  def manifest
    JSON.parse(archive.read("account.json"))
  end

  it "always contains account.json" do
    expect(archive.entries.map(&:name)).to include("account.json")
  end

  # So a future importer can tell what it is reading rather than guessing from the keys
  # that happen to be present.
  it "stamps account.json with a schema version" do
    expect(manifest["schema_version"]).to eq(described_class::SCHEMA_VERSION)
  end

  it "carries the user" do
    expect(manifest.dig("user", "email")).to eq("candidate@example.com")
  end

  it "carries every application with every column" do
    create(:application, :applied, user: user, company: "Mercari", role: "Backend Engineer",
      notes: "Referred by a friend")

    application = manifest["applications"].first
    expect(application).to include(
      "company" => "Mercari",
      "role"    => "Backend Engineer",
      "status"  => "applied",
      "notes"   => "Referred by a friend"
    )
    expect(application["applied_at"]).to be_present
  end

  # The whole point of the archive over the CSV: it recovers an account, not a table.
  it "carries the timeline" do
    application = create(:application, :applied, user: user)
    Applications::TransitionService.new(
      application: application, to: "phone_screen", actor: user, note: "Recruiter call"
    ).call

    entries = manifest["applications"].first["timeline_entries"]
    expect(entries.map { |entry| entry["to_status"] }).to include("phone_screen")
    expect(entries.map { |entry| entry["note"] }).to include("Recruiter call")
  end

  it "does not leak the blob columns into account.json" do
    create(:application, :with_resume, user: user)
    expect(manifest["applications"].first.keys).not_to include("resume", "cover_letter")
  end

  describe "the files" do
    it "writes resumes and cover letters as PDFs under their own directories" do
      application = create(:application, :with_resume, :with_cover_letter, user: user, company: "Mercari")

      names = archive.entries.map(&:name)
      expect(names).to include(
        "resumes/#{application.id}-mercari.pdf",
        "cover-letters/#{application.id}-mercari.pdf"
      )
    end

    it "writes the blob bytes verbatim" do
      application = create(:application, :with_resume, user: user, company: "Mercari")
      expect(archive.read("resumes/#{application.id}-mercari.pdf")).to eq(application.resume)
    end

    # Each application row names its own files, so the mapping survives an unhelpful slug.
    it "names its files from the application row" do
      application = create(:application, :with_resume, user: user, company: "Mercari")

      row = manifest["applications"].first
      expect(row["resume_file"]).to eq("resumes/#{application.id}-mercari.pdf")
      expect(row["cover_letter_file"]).to be_nil
    end

    # A Japanese company name parameterizes to "" — the id is what makes the name unique,
    # the slug is only there to be readable.
    it "falls back to the bare id when the company name slugs to nothing" do
      application = create(:application, :with_resume, user: user, company: "株式会社メルカリ")
      expect(archive.entries.map(&:name)).to include("resumes/#{application.id}.pdf")
    end

    it "writes no file for an application that has none" do
      create(:application, user: user)
      expect(archive.entries.map(&:name)).to eq([ "account.json" ])
    end
  end

  it "is scoped to the user — another account's data never appears" do
    create(:application, :with_resume, user: create(:user), company: "Somebody Else Inc")
    create(:application, user: user, company: "Mine")

    expect(manifest["applications"].map { |row| row["company"] }).to eq([ "Mine" ])
    expect(archive.entries.map(&:name)).to eq([ "account.json" ])
  end

  it "names the file with the date it was taken" do
    travel_to(Time.zone.local(2026, 7, 12, 9, 0, 0)) do
      expect(described_class.new(user).filename).to eq("karirkalyan-account-2026-07-12.zip")
    end
  end
end
