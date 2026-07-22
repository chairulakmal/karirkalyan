require "rails_helper"

# The filter/pagination behaviour this query backs is covered end-to-end in
# spec/requests/api/v1/applications_spec.rb — that suite is what proves the
# extraction out of ApplicationsController#index preserved the contract. This
# spec covers the edges below the HTTP layer: the clamp, the ignore-bad-input
# rule, and user scoping.
RSpec.describe Applications::ListQuery do
  let(:user) { create(:user) }

  def call(**params)
    described_class.new(user: user, **params).call
  end

  # Applications are ordered by created_at desc, so build them with distinct,
  # known timestamps rather than relying on insertion order.
  def application_at(days_ago, *traits, **attrs)
    create(:application, *traits, user: user, created_at: days_ago.days.ago, **attrs)
  end

  describe "the limit" do
    before { 3.times { |i| application_at(i) } }

    it "defaults to DEFAULT_LIMIT when no limit is given" do
      expect(described_class::DEFAULT_LIMIT).to eq(10)
      expect(call[:records].size).to eq(3)
    end

    it "clamps a limit above MAX_LIMIT down to MAX_LIMIT" do
      expect(call(limit: 500)).to include(has_more: false)
      expect(call(limit: 500)[:records].size).to eq(3)
    end

    it "clamps a limit below MIN_LIMIT up to MIN_LIMIT" do
      expect(call(limit: 0)[:records].size).to eq(1)
      expect(call(limit: -20)[:records].size).to eq(1)
    end

    it "falls back to the default rather than erroring on a non-numeric limit" do
      expect(call(limit: "abc")[:records].size).to eq(1)
    end

    it "accepts the string limits that arrive from a query string" do
      expect(call(limit: "2")[:records].size).to eq(2)
    end
  end

  describe "the cursor" do
    let!(:newest) { application_at(0) }
    let!(:middle) { application_at(1) }
    let!(:oldest) { application_at(2) }

    it "hands back a cursor that resumes exactly where the page ended" do
      first = call(limit: 2)

      expect(first[:records]).to eq([ newest, middle ])
      expect(first[:has_more]).to be(true)

      second = call(limit: 2, after: first[:next_cursor])

      expect(second[:records]).to eq([ oldest ])
      expect(second[:has_more]).to be(false)
      expect(second[:next_cursor]).to be_nil
    end

    it "omits the cursor on the last page" do
      expect(call(limit: 10)).to include(has_more: false, next_cursor: nil)
    end

    it "ignores a malformed cursor and returns the first page" do
      expect(call(after: "not-base64!!")[:records]).to eq([ newest, middle, oldest ])
    end

    it "ignores a well-formed cursor that does not decode to a time" do
      expect(call(after: Base64.urlsafe_encode64("hello"))[:records]).to eq([ newest, middle, oldest ])
    end

    # The cursor carries microseconds on purpose: created_at is the sort key, so
    # a second-precision cursor would skip or repeat rows sharing a second.
    it "does not lose rows created within the same second" do
      instant = 5.days.ago
      a = create(:application, user: user, created_at: instant)
      b = create(:application, user: user, created_at: instant + 0.000_100)

      page = call(limit: 4, after: call(limit: 3)[:next_cursor])

      expect(page[:records]).to eq([ b, a ])
    end
  end

  describe "ignoring unusable filters" do
    let!(:wishlist) { application_at(0, status: "wishlist") }
    let!(:applied)  { application_at(1, :applied) }

    it "applies a status in VALID_STATES" do
      expect(call(status: "applied")[:records]).to eq([ applied ])
    end

    it "ignores a status outside VALID_STATES rather than returning none" do
      expect(call(status: "not_a_state")[:records]).to contain_exactly(wishlist, applied)
    end

    it "ignores blank filters" do
      expect(call(status: "", company: "", source: "")[:records])
        .to contain_exactly(wishlist, applied)
    end
  end

  # status's exact contract on Application::JAPANESE_LEVELS: OR within the
  # list, unknown members dropped, nothing left means unfiltered.
  describe "the japanese_level filter" do
    let!(:none)       { application_at(0, japanese_level: "none") }
    let!(:business)   { application_at(1, japanese_level: "business") }
    let!(:unrecorded) { application_at(2) }

    it "applies a single level" do
      expect(call(japanese_level: "business")[:records]).to eq([ business ])
    end

    it "ORs a comma-separated list" do
      expect(call(japanese_level: "none,business")[:records])
        .to contain_exactly(none, business)
    end

    it "ignores a list it understands none of rather than returning none" do
      expect(call(japanese_level: "fluent")[:records])
        .to contain_exactly(none, business, unrecorded)
    end

    # `none` is a recorded "no Japanese required"; null is unrecorded, and
    # there is deliberately no query for it.
    it "does not match an unrecorded (null) level with none" do
      expect(call(japanese_level: "none")[:records]).to eq([ none ])
    end
  end

  describe "the source filter" do
    it "treats a wildcard in the param as a literal, not a pattern" do
      literal = application_at(0, url: "https://example.com/%/jobs/1")
      application_at(1, url: "https://linkedin.com/jobs/2")

      expect(call(source: "%")[:records]).to eq([ literal ])
    end
  end

  # Free-text search over company/role/notes: partial and case-insensitive,
  # blank ignored, wildcards literal, ANDed against the other filters (v1.11.0).
  describe "the q (free-text) filter" do
    let!(:acme)   { application_at(0, company: "Acme Fintech", role: "Backend Engineer", notes: "Osaka office") }
    let!(:globex) { application_at(1, company: "Globex", role: "Frontend Developer", notes: nil) }

    it "matches the company, case-insensitively" do
      expect(call(q: "acme")[:records]).to eq([ acme ])
    end

    it "matches the role" do
      expect(call(q: "frontend")[:records]).to eq([ globex ])
    end

    it "matches the notes" do
      expect(call(q: "osaka")[:records]).to eq([ acme ])
    end

    it "ignores a blank or whitespace-only term rather than returning none" do
      expect(call(q: "   ")[:records]).to contain_exactly(acme, globex)
    end

    it "ANDs against the other filters" do
      expect(call(q: "engineer", company: "Globex")[:records]).to be_empty
      expect(call(q: "backend", company: "Acme Fintech")[:records]).to eq([ acme ])
    end

    it "treats a wildcard in the term as a literal, not a pattern" do
      pct = application_at(2, company: "100% Remote Co")
      expect(call(q: "100%")[:records]).to eq([ pct ])
    end
  end

  describe "scoping" do
    it "never returns another user's applications" do
      mine = application_at(0)
      create(:application, user: create(:user), company: mine.company)

      expect(call(company: mine.company)[:records]).to eq([ mine ])
    end
  end
end
