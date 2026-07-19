require "rails_helper"

RSpec.describe Agency do
  let(:user) { create(:user) }

  describe ".resolve" do
    it "creates a row for a new name, stripped" do
      agency = described_class.resolve(user: user, name: "  Robert Half  ")

      expect(agency.name).to eq("Robert Half")
      expect(agency.user).to eq(user)
    end

    it "returns the existing row for a name already known, instead of duplicating it" do
      existing = described_class.resolve(user: user, name: "Robert Half")

      expect(described_class.resolve(user: user, name: "Robert Half")).to eq(existing)
      expect(user.agencies.count).to eq(1)
    end

    it "returns nil for a blank name rather than creating an empty vocabulary entry" do
      expect(described_class.resolve(user: user, name: "   ")).to be_nil
      expect(described_class.resolve(user: user, name: nil)).to be_nil
    end

    it "scopes the vocabulary per user: the same name is a different row for a different user" do
      mine   = described_class.resolve(user: user, name: "Robert Half")
      theirs = described_class.resolve(user: create(:user), name: "Robert Half")

      expect(mine).not_to eq(theirs)
    end

    # The find-or-create race: the unique index wins, and the rescue turns the
    # collision back into the row the other request created.
    it "recovers the existing row when the create loses the unique-index race" do
      existing = create(:agency, user: user, name: "Robert Half")
      # The association proxy is memoized per user instance, so stubbing it here
      # is stubbing the same object #resolve will call.
      allow(user.agencies).to receive(:find_or_create_by).and_raise(ActiveRecord::RecordNotUnique)

      expect(described_class.resolve(user: user, name: "Robert Half")).to eq(existing)
    end
  end

  describe "OWNERSHIP_WINDOW_MONTHS" do
    # 18 is the conservative end of the researched 12-18: the warning must fire
    # while the window *may* still be open. A perishable market fact: if this
    # assertion surprises you, re-read SPEC.md § Data model → agencies before
    # changing either side.
    it "is 18 months" do
      expect(described_class::OWNERSHIP_WINDOW_MONTHS).to eq(18)
    end
  end
end
