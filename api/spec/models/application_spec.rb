require "rails_helper"

RSpec.describe Application do
  # The ceiling that bounds storage, since no throttle can. Stubbed low rather than creating 200
  # rows: the number is a judgement call, the behaviour at the boundary is what has to hold.
  describe "the per-account ceiling" do
    let(:user) { create(:user) }

    before { stub_const("Application::MAX_PER_USER", 2) }

    it "allows creates up to the ceiling" do
      2.times { expect(build(:application, user: user).save).to be(true) }
    end

    it "refuses the create that would cross it" do
      2.times { create(:application, user: user) }

      record = build(:application, user: user)
      expect(record.save).to be(false)
      expect(record.errors.details[:base]).to include(a_hash_including(error: :too_many_applications))
    end

    it "counts each account's own applications, not every application there is" do
      2.times { create(:application, user: create(:user)) }

      expect(build(:application, user: user)).to be_valid
    end

    # on: :create — an account at the ceiling must still be able to edit and re-upload, or the
    # cap would quietly freeze the data it exists to protect.
    it "does not block an update to an account already at the ceiling" do
      2.times { create(:application, user: user) }
      record = user.applications.first

      expect(record.update(notes: "still editable")).to be(true)
    end

    # Deleting is the way out, which is what lets the ceiling sit close to real use.
    it "lets a create through again after a delete frees a slot" do
      2.times { create(:application, user: user) }
      user.applications.first.destroy

      expect(build(:application, user: user)).to be_valid
    end
  end

  describe "#download_basename" do
    # build_stubbed gives the record an id without a round trip — the format is pure.
    def basename(kind: :resume, **attrs)
      build_stubbed(:application, **attrs).download_basename(kind: kind)
    end

    it "names a resume after the application" do
      expect(
        basename(company: "Mercari", role: "Backend Engineer", resume_updated_at: Time.zone.local(2026, 7, 12))
      ).to match(/\AMercari-Backend-Engineer-0712-\d+-resume\.pdf\z/)
    end

    it "dasherizes the kind, so a cover letter does not carry an underscore into a hyphenated name" do
      expect(
        basename(kind: :cover_letter, cover_letter_updated_at: Time.zone.local(2026, 7, 12))
      ).to end_with("-cover-letter.pdf")
    end

    it "rejects a kind that is not a download" do
      expect { basename(kind: :notes) }.to raise_error(ArgumentError, /unknown download kind/)
    end

    # The whole point of the Unicode slugger: parameterize sent this to "" and the file
    # arrived as a bare id.
    it "keeps a Japanese company and role rather than transliterating or dropping them" do
      expect(
        basename(company: "株式会社メルカリ", role: "バックエンドエンジニア",
          resume_updated_at: Time.zone.local(2026, 7, 12))
      ).to match(/\A株式会社メルカリ-バックエンドエンジニア-0712-\d+-resume\.pdf\z/)
    end

    it "preserves display case" do
      expect(basename(company: "Google")).to include("Google")
    end

    describe "the MMDD stamp" do
      # The reason the stamp exists at all: one bytea per application, an upload overwrites it,
      # so the stamp is what stops a re-uploaded resume from overwriting the saved copy of the
      # old one in the downloads folder.
      it "is the upload date, not the application's creation date" do
        record = build_stubbed(:application,
          created_at: Time.zone.local(2026, 1, 3), resume_updated_at: Time.zone.local(2026, 7, 12))

        expect(record.download_basename(kind: :resume)).to include("-0712-")
        expect(record.download_basename(kind: :resume)).not_to include("-0103-")
      end

      it "reads each kind's own stamp" do
        record = build_stubbed(:application,
          resume_updated_at: Time.zone.local(2026, 7, 12), cover_letter_updated_at: Time.zone.local(2026, 3, 4))

        expect(record.download_basename(kind: :resume)).to include("-0712-")
        expect(record.download_basename(kind: :cover_letter)).to include("-0304-")
      end

      # A legacy row can hold a blob without a stamp: the before_save that sets it is newer
      # than the column it writes to.
      it "falls back to created_at when the row has a blob but no stamp" do
        record = build_stubbed(:application, created_at: Time.zone.local(2026, 1, 3), resume_updated_at: nil)

        expect(record.download_basename(kind: :resume)).to include("-0103-")
      end
    end

    describe "a segment that sanitizes to nothing" do
      # Dropped, not placeheld — "unknown" would add fake meaning where the id already carries
      # the truth. company and role are both null: false, so only a name with no letters or
      # digits in it can get here.
      it "is dropped, leaving the id to guarantee uniqueness" do
        record = build_stubbed(:application,
          company: "🎉", role: "...", resume_updated_at: Time.zone.local(2026, 7, 12))

        expect(record.download_basename(kind: :resume)).to eq("0712-#{record.id}-resume.pdf")
      end
    end
  end

  describe ".download_slug" do
    it "collapses runs of separators into one" do
      expect(described_class.download_slug("Cybozu   (サイボウズ)  Inc.")).to eq("Cybozu-サイボウズ-Inc")
    end

    it "trims the edges" do
      expect(described_class.download_slug("  (Mercari)  ")).to eq("Mercari")
    end

    it "strips the characters that would break a header or a filesystem" do
      expect(described_class.download_slug(%q(a/b\\c"d'e:f*g?h))).to eq("a-b-c-d-e-f-g-h")
    end

    # Per segment — the stamp, id and suffix sit outside the count, because a single 20-char
    # budget for the whole name does not close ("-cover-letter.pdf" alone is 17).
    it "caps a segment at 20 codepoints" do
      expect(described_class.download_slug("A Very Long Company Name That Goes On Forever").length)
        .to be <= described_class::SLUG_MAX_LENGTH
    end

    it "counts codepoints, not bytes — a kanji is one character, not three" do
      expect(described_class.download_slug("東" * 25)).to eq("東" * 20)
    end

    it "never leaves a trailing separator when the cap lands mid-separator" do
      expect(described_class.download_slug("A Very Long Company Name")).not_to end_with("-")
    end

    it "is empty for a name with no letters or digits in it" do
      expect(described_class.download_slug("🎉🎉🎉")).to eq("")
      expect(described_class.download_slug("   ")).to eq("")
    end
  end
end
