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

  # rubyzip 3.4.1 writes entry names as UTF-8 and flags them as such (see the EFS test below),
  # but hands them back as ASCII-8BIT on read — so a name has to be decoded here before it can
  # be compared to a Japanese literal. That is a quirk of the read path, not of the archive:
  # the bytes on disk are correct and real extractors read them correctly.
  def entry_names
    archive.entries.map { |entry| entry.name.dup.force_encoding("UTF-8") }
  end

  it "always contains account.json" do
    expect(entry_names).to include("account.json")
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
    # The archive adds the directory; Application#download_basename owns the rest, so an
    # archived file and the same file downloaded singly agree.
    it "writes resumes and cover letters as PDFs under their own directories" do
      application = create(:application, :with_resume, :with_cover_letter, user: user)

      names = entry_names
      expect(names).to include(
        "resumes/#{application.download_basename(kind: :resume)}",
        "cover-letters/#{application.download_basename(kind: :cover_letter)}"
      )
    end

    it "names its files the way the download endpoints do" do
      application = create(:application, :with_resume, user: user, company: "Mercari", role: "Backend Engineer")

      expect(entry_names)
        .to include(a_string_matching(%r{\Aresumes/Mercari-Backend-Engineer-\d{4}-#{application.id}-resume\.pdf\z}))
    end

    it "writes the blob bytes verbatim" do
      application = create(:application, :with_resume, user: user, company: "Mercari")
      expect(archive.read("resumes/#{application.download_basename(kind: :resume)}")).to eq(application.resume)
    end

    # Each application row names its own files, so the mapping survives an unhelpful segment.
    it "names its files from the application row" do
      application = create(:application, :with_resume, user: user, company: "Mercari")

      row = manifest["applications"].first
      expect(row["resume_file"]).to eq("resumes/#{application.download_basename(kind: :resume)}")
      expect(row["cover_letter_file"]).to be_nil
    end

    # The bug this release fixes: parameterize sent a Japanese company name to "" and the
    # entry arrived as a bare "resumes/12.pdf".
    it "keeps a Japanese company name instead of emptying it out" do
      create(:application, :with_resume, user: user, company: "株式会社メルカリ", role: "エンジニア")

      expect(entry_names)
        .to include(a_string_starting_with("resumes/株式会社メルカリ-エンジニア-"))
    end

    # rubyzip writes the UTF-8 bytes either way; without the EFS flag a strict extractor
    # decodes them as CP437. config/initializers/zip.rb sets it globally.
    it "flags UTF-8 entry names, so a Japanese name is not mojibake in a strict extractor" do
      create(:application, :with_resume, user: user, company: "株式会社メルカリ")

      entry = archive.entries.find { |candidate| candidate.name.start_with?("resumes/") }
      expect(entry.gp_flags & 0x0800).to eq(0x0800)
    end

    it "writes no file for an application that has none" do
      create(:application, user: user)
      expect(entry_names).to eq([ "account.json" ])
    end
  end

  it "is scoped to the user — another account's data never appears" do
    create(:application, :with_resume, user: create(:user), company: "Somebody Else Inc")
    create(:application, user: user, company: "Mine")

    expect(manifest["applications"].map { |row| row["company"] }).to eq([ "Mine" ])
    expect(entry_names).to eq([ "account.json" ])
  end

  it "names the file with the date it was taken" do
    travel_to(Time.zone.local(2026, 7, 12, 9, 0, 0)) do
      expect(described_class.new(user).filename).to eq("karirkalyan-account-2026-07-12.zip")
    end
  end
end
