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
    # Asserted as a value, not as `length <= SLUG_MAX_LENGTH` — that form passes for "" too, so it
    # would still be green if the truncation ever ate the whole name.
    it "caps a segment at 20 codepoints" do
      expect(described_class.download_slug("A Very Long Company Name That Goes On Forever"))
        .to eq("A-Very-Long-Company")
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

  # The Japan-market columns (v1.8.0). All nullable — a blank record must stay
  # valid, or the standing additive-migration rule is broken at the model layer.
  describe "the market columns" do
    it "accepts a record with none of them set" do
      expect(build(:application)).to be_valid
    end

    it "refuses a channel outside CHANNELS" do
      expect(build(:application, channel: "headhunter")).not_to be_valid
      expect(build(:application, channel: "agent")).to be_valid
    end

    it "refuses a japanese_level outside JAPANESE_LEVELS" do
      expect(build(:application, japanese_level: "fluent")).not_to be_valid
      expect(build(:application, japanese_level: "n1")).to be_valid
    end

    it "refuses non-positive compensation figures" do
      expect(build(:application, comp_annual_min_yen: 0)).not_to be_valid
      expect(build(:application, comp_annual_min_yen: 6_000_000)).to be_valid
    end

    it "refuses negative month splits but allows zero" do
      expect(build(:application, comp_months_variable: -1)).not_to be_valid
      expect(build(:application, comp_months_variable: 0)).to be_valid
    end

    it "caps posting_snapshot at the prefill pipeline's MAX_TEXT_CHARS" do
      cap = Applications::UrlPrefillService::MAX_TEXT_CHARS

      expect(build(:application, posting_snapshot: "あ" * cap)).to be_valid
      expect(build(:application, posting_snapshot: "あ" * (cap + 1))).not_to be_valid
    end

    # Excluded the way the blobs are: index and board fetch every row, and 12k
    # of text per row is blob weight in a text costume. #show merges it back.
    it "excludes posting_snapshot from as_json" do
      record = create(:application, posting_snapshot: "stripped posting text")

      expect(record.as_json).not_to have_key("posting_snapshot")
    end
  end

  describe ".open_ownership_submissions" do
    let(:user)   { create(:user) }
    let(:agency) { create(:agency, user: user) }

    def submission(**attrs)
      create(:application, :applied, user: user, company: "Mercari", channel: "agent",
        agency: agency, **attrs)
    end

    it "returns an agent submission inside the window" do
      inside = submission(applied_at: 6.months.ago)

      expect(user.applications.open_ownership_submissions("Mercari")).to eq([ inside ])
    end

    it "excludes a submission whose window has expired" do
      submission(applied_at: (Agency::OWNERSHIP_WINDOW_MONTHS + 1).months.ago)

      expect(user.applications.open_ownership_submissions("Mercari")).to be_empty
    end

    it "excludes other companies, other channels, and never-submitted rows" do
      submission(company: "Cookpad")
      create(:application, :applied, user: user, company: "Mercari", channel: "direct")
      # wishlist: no applied_at, never submitted — no window starts.
      create(:application, user: user, company: "Mercari", channel: "agent", agency: agency)

      expect(user.applications.open_ownership_submissions("Mercari")).to be_empty
    end
  end
end
