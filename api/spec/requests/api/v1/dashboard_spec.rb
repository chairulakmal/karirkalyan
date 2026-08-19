require "swagger_helper"

RSpec.describe "Dashboard", type: :request do
  let(:user) { create(:user) }

  path "/api/v1/dashboard" do
    get "Application stats for the current user" do
      tags "Dashboard"
      security [ bearerAuth: [] ]
      produces "application/json"

      response "200", "stats aggregation" do
        let(:Authorization) { jwt_for(user) }

        # The one endpoint whose response cannot be guessed from a model, so it is
        # the one that earns a response schema. `ghost_risk` in particular is a
        # derived read model with no table behind it — see SPEC.md § Query layer.
        schema type: :object,
          required: %w[by_status facets total avg_days_to_offer response_rate screening_success_rate ghost_rate avg_days_in_stage ghost_risk user upcoming],
          properties: {
            by_status: {
              type: :object, additionalProperties: { type: :integer },
              description: "Application count per status"
            },
            facets: {
              type: :array,
              description: "[company, job-board host, status, japanese_level] per application; the frontend cross-narrows every filter from it",
              items: { type: :array, minItems: 4, maxItems: 4 }
            },
            total: { type: :integer },
            avg_days_to_offer: {
              type: :number, nullable: true,
              description: "Applied date to offer timeline entry; null until one reaches offer"
            },
            response_rate: {
              type: :integer, nullable: true,
              description: "Percent of applied applications the company replied to (advanced or rejected); null when none applied"
            },
            screening_success_rate: {
              type: :integer, nullable: true,
              description: "Percent of applied applications taken past the resume screen (reached phone_screen, technical, final_round or offer); the response rate without the rejections. Null when none applied"
            },
            ghost_rate: {
              type: :integer, nullable: true,
              description: "Percent of applied applications that were ghosted; null when none applied"
            },
            avg_days_in_stage: {
              type: :number, nullable: true,
              description: "Average days in-stage across in-flight applications; null when none active"
            },
            ghost_risk: {
              type: :object,
              required: %w[thresholds at_risk],
              description: "Applications silent past the fixed threshold for their stage. Every day count here is a BUSINESS day: weekends, Japanese national holidays, Golden Week, Obon and the New Year shutdown are excluded, so these numbers are not comparable with the list payload's calendar-day days_in_stage",
              properties: {
                thresholds: {
                  type: :object, additionalProperties: { type: :integer },
                  description: "Business days of silence tolerated per stage, keyed on applied/phone_screen"
                },
                at_risk: {
                  type: :array, description: "Longest silence first",
                  items: {
                    type: :object,
                    required: %w[id company role status lock_version business_days_in_stage threshold],
                    properties: {
                      id:                     { type: :integer },
                      company:                { type: :string },
                      role:                   { type: :string },
                      status:                 { type: :string, enum: %w[applied phone_screen] },
                      lock_version:           { type: :integer, description: "So the UI can transition inline" },
                      business_days_in_stage: { type: :integer },
                      threshold:              { type: :integer }
                    }
                  }
                }
              }
            },
            user: {
              type: :object,
              description: "The GET /me payload, folded in; the dashboard was fetching both",
              required: %w[id email created_at updated_at],
              properties: {
                id:         { type: :integer },
                email:      { type: :string },
                created_at: { type: :string, format: :"date-time" },
                updated_at: { type: :string, format: :"date-time" }
              }
            },
            upcoming: {
              type: :array,
              description: "Dated commitments (follow-ups, upcoming interviews, residence expiry) merged and sorted chronologically; capped, computed fresh outside the stats cache",
              items: {
                type: :object,
                required: %w[type at application_id company role status],
                properties: {
                  type:           { type: :string, enum: %w[follow_up interview residence] },
                  at:             { type: :string, format: :"date-time" },
                  application_id: { type: :integer, nullable: true, description: "Null for a residence item, which links to /settings" },
                  company:        { type: :string, nullable: true },
                  role:           { type: :string, nullable: true },
                  status:         { type: :string, nullable: true }
                }
              }
            }
          }

        before do
          create(:application, :applied,      user: user)
          create(:application, :applied,      user: user)
          create(:application, :phone_screen, user: user)
          create(:application, user: user, status: "rejected")
          create(:application, :applied, user: create(:user)) # another user — must not appear
        end

        run_test! do |response|
          data = JSON.parse(response.body)
          expect(data).to include("by_status", "total", "facets", "ghost_risk", "user")
          expect(data["by_status"]["applied"]).to eq(2)
          expect(data["by_status"]["phone_screen"]).to eq(1)
          expect(data["by_status"]["rejected"]).to eq(1)
          expect(data["total"]).to eq(4)
          expect(data["ghost_risk"].keys).to contain_exactly("thresholds", "at_risk")
          expect(data["user"]["email"]).to eq(user.email)
        end
      end

      # rswag folds same-code responses into one OpenAPI entry, and the last
      # description wins — so this one has to read as the endpoint's 200, not just
      # as this example's scenario.
      response "200", "stats aggregation; by_status is empty and total is 0 for a user with no applications" do
        let(:Authorization) { jwt_for(user) }

        run_test! do |response|
          data = JSON.parse(response.body)
          expect(data["total"]).to eq(0)
          expect(data["by_status"]).to eq({})
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test!
      end
    end
  end

  describe "filter facets" do
    let(:headers) { { "Authorization" => jwt_for(user) } }

    it "returns a [company, board-host, status, japanese_level] tuple for every application" do
      create(:application, company: "Mercari", url: "https://www.linkedin.com/jobs/1",
             status: "applied", japanese_level: "business", user: user)
      create(:application, company: "Mercari", url: "https://tokyodev.com/jobs/2",
             status: "wishlist", japanese_level: nil, user: user)
      create(:application, company: "Cookpad", url: nil, status: "draft", japanese_level: "n1", user: user)

      get "/api/v1/dashboard", headers: headers
      facets = JSON.parse(response.body)["facets"]

      expect(facets).to contain_exactly(
        [ "Mercari", "linkedin.com", "applied", "business" ],
        [ "Mercari", "tokyodev.com", "wishlist", nil ],
        [ "Cookpad", "(none)", "draft", "n1" ]
      )
    end

    it "reports response and ghost rates over the applied denominator" do
      applied = create(:application, :applied, company: "A", user: user)
      Applications::TransitionService.new(application: applied, to: "phone_screen", actor: user).call
      ghosted = create(:application, :applied, company: "B", user: user)
      Applications::TransitionService.new(application: ghosted, to: "ghosted", actor: user).call
      create(:application, company: "C", status: "wishlist", user: user) # not applied: excluded

      get "/api/v1/dashboard", headers: headers
      body = JSON.parse(response.body)

      expect(body["response_rate"]).to eq(50)
      expect(body["ghost_rate"]).to eq(50)
    end

    # The gap between the two rates is the reason both exist, so the fixture is
    # built to open one: three applications, all three answered, only one taken
    # past the resume screen. A rate that counted rejections would report 100%
    # here and tell the user nothing they did not already know.
    it "counts only applications taken past the resume screen as screening success" do
      passed = create(:application, :applied, company: "Passed", user: user)
      Applications::TransitionService.new(application: passed, to: "phone_screen", actor: user).call
      first_no = create(:application, :applied, company: "No", user: user)
      Applications::TransitionService.new(application: first_no, to: "rejected", actor: user).call
      second_no = create(:application, :applied, company: "Also no", user: user)
      Applications::TransitionService.new(application: second_no, to: "rejected", actor: user).call

      get "/api/v1/dashboard", headers: headers
      body = JSON.parse(response.body)

      expect(body["response_rate"]).to eq(100)
      expect(body["screening_success_rate"]).to eq(33)
    end

    # Success here is a fact about the past, read from the timeline like every other
    # rate here: the company that interviews you and then says no has still read
    # your resume and said yes to it, and no later move retracts that.
    it "keeps a screening success that a later rejection followed" do
      application = create(:application, :applied, user: user)
      Applications::TransitionService.new(application: application, to: "phone_screen", actor: user).call
      Applications::TransitionService.new(application: application, to: "rejected", actor: user).call

      get "/api/v1/dashboard", headers: headers

      expect(JSON.parse(response.body)["screening_success_rate"]).to eq(100)
    end

    it "reports no rates at all when nothing has been applied to" do
      create(:application, company: "Lead", status: "wishlist", user: user)

      get "/api/v1/dashboard", headers: headers
      body = JSON.parse(response.body)

      expect(body["response_rate"]).to be_nil
      expect(body["screening_success_rate"]).to be_nil
      expect(body["ghost_rate"]).to be_nil
    end

    # The regression: the denominator used to be `status NOT IN (wishlist, draft)`,
    # which is a fact about the past read off a pointer that keeps moving. Archiving
    # is housekeeping the app encourages, and it moved a never-applied row out of
    # both excluded stages and into the denominator, where it could never earn a
    # numerator. Two archived leads against one real application drove a 100% rate
    # to 33% under the old query; both specs below fail against it.
    it "keeps archived wishlist and draft leads out of the denominator" do
      applied = create(:application, :applied, company: "Real", user: user)
      Applications::TransitionService.new(application: applied, to: "phone_screen", actor: user).call

      lead = create(:application, company: "Lead", status: "wishlist", user: user)
      Applications::TransitionService.new(application: lead, to: "archived", actor: user).call
      drafted = create(:application, :draft, company: "Drafted", user: user)
      Applications::TransitionService.new(application: drafted, to: "archived", actor: user).call

      get "/api/v1/dashboard", headers: headers
      body = JSON.parse(response.body)

      expect(body["response_rate"]).to eq(100)
      expect(body["screening_success_rate"]).to eq(100)
      expect(body["ghost_rate"]).to eq(0)
    end

    # applied_at survives every later move, which is the whole reason it is the
    # anchor: a withdrawn or archived application that really was applied to still
    # belongs in the denominator, and its timeline still holds whatever the company
    # did before it closed. Only the never-applied rows drop out.
    it "keeps a closed application that was really applied to in the denominator" do
      withdrawn = create(:application, :applied, company: "Withdrew", user: user)
      Applications::TransitionService.new(application: withdrawn, to: "withdrawn", actor: user).call
      archived = create(:application, :applied, company: "Archived", user: user)
      Applications::TransitionService.new(application: archived, to: "rejected", actor: user).call
      Applications::TransitionService.new(application: archived.reload, to: "archived", actor: user).call

      get "/api/v1/dashboard", headers: headers
      body = JSON.parse(response.body)

      # Two in the denominator; the archived one was rejected, which is a response.
      expect(body["response_rate"]).to eq(50)
    end
  end

  describe "the upcoming agenda" do
    let(:headers) { { "Authorization" => jwt_for(user) } }

    it "merges follow-ups, upcoming interviews, and residence expiry, chronologically" do
      user.update!(residence_expires_on: 20.days.from_now.to_date)
      create(:application, :applied, company: "Soonest", user: user, follow_up_at: 2.days.from_now)
      create(:application, :phone_screen, company: "Interviewing", user: user, interview_at: 10.days.from_now)

      get "/api/v1/dashboard", headers: headers
      upcoming = JSON.parse(response.body)["upcoming"]

      expect(upcoming.map { |item| item["type"] }).to eq(%w[follow_up interview residence])
      expect(upcoming.first).to include("company" => "Soonest")
      expect(upcoming.find { |item| item["type"] == "residence" })
        .to include("application_id" => nil, "company" => nil)
    end

    # The `at` value had no coverage at all, which is how the residence row came
    # to serialise the container's zone (UTC on Railway) while every other item
    # serialised Tokyo. Asserting the offset is what makes that a red test rather
    # than an invisible inconsistency: CI runs UTC, so `Date#to_time` fails here.
    it "serialises every agenda date in Tokyo, the residence row included" do
      expiry = 20.days.from_now.to_date
      user.update!(residence_expires_on: expiry)
      create(:application, :applied, company: "Soonest", user: user, follow_up_at: 2.days.from_now)

      get "/api/v1/dashboard", headers: headers
      upcoming = JSON.parse(response.body)["upcoming"]

      expect(upcoming.map { |item| item["at"] }).to all(end_with("+09:00"))
      residence = upcoming.find { |item| item["type"] == "residence" }
      expect(residence["at"]).to eq(expiry.in_time_zone.iso8601)
      expect(residence["at"]).to start_with(expiry.to_fs(:iso8601))
    end

    it "excludes past interviews and follow-ups on closed applications" do
      user.update!(residence_expires_on: nil)
      create(:application, :applied, company: "Past", user: user, interview_at: 2.days.ago)
      create(:application, company: "Closed", status: "rejected", user: user, follow_up_at: 1.day.from_now)

      get "/api/v1/dashboard", headers: headers

      expect(JSON.parse(response.body)["upcoming"]).to be_empty
    end

    it "omits a residence date beyond the agenda window" do
      user.update!(residence_expires_on: 200.days.from_now.to_date)

      get "/api/v1/dashboard", headers: headers

      expect(JSON.parse(response.body)["upcoming"]).to be_empty
    end
  end

  describe "avg_days_to_offer uses the timeline entry timestamp" do
    let(:headers) { { "Authorization" => jwt_for(user) } }

    it "calculates days from applied_at to the offer timeline entry, not updated_at" do
      app = create(:application, user: user, status: "accepted",
                   applied_at: 30.days.ago, updated_at: 1.day.ago)
      create(:timeline_entry, application: app, actor: user,
             from_status: "final_round", to_status: "offer",
             created_at: 10.days.ago)

      get "/api/v1/dashboard", headers: headers
      data = JSON.parse(response.body)

      # 30 days ago → offer 10 days ago = ~20 days, not ~29 days (updated_at drift)
      expect(data["avg_days_to_offer"]).to be_within(0.5).of(20.0)
    end

    it "returns nil when no qualifying applications exist" do
      create(:application, user: user, status: "applied")

      get "/api/v1/dashboard", headers: headers
      data = JSON.parse(response.body)
      expect(data["avg_days_to_offer"]).to be_nil
    end
  end

  describe "ghost_risk" do
    let(:headers) { { "Authorization" => jwt_for(user) } }

    # The clock is pinned because the counts are in business days, and June is
    # the one month with neither a national holiday nor a seasonal dead zone.
    # 2026-05-27 to 2026-06-24 is 20 business days, past the applied threshold.
    it "flags a silent application and ships what the UI needs to close it" do
      travel_to(Time.zone.parse("2026-06-24 10:00")) do
        stale = create(:application, user: user, company: "Mercari",
                       status: "applied", applied_at: Time.zone.parse("2026-05-27 10:00"))

        get "/api/v1/dashboard", headers: headers
        risk = JSON.parse(response.body)["ghost_risk"]

        expect(risk["thresholds"]).to eq("applied" => 15, "phone_screen" => 10)
        expect(risk["at_risk"].length).to eq(1)
        expect(risk["at_risk"].first).to include(
          "id"                     => stale.id,
          "company"                => "Mercari",
          "status"                 => "applied",
          "threshold"              => 15,
          "business_days_in_stage" => 20,
          "lock_version"           => stale.lock_version
        )
      end
    end

    it "is empty when nothing has been silent for long" do
      create(:application, user: user, status: "applied", applied_at: 3.days.ago)

      get "/api/v1/dashboard", headers: headers
      expect(JSON.parse(response.body)["ghost_risk"]["at_risk"]).to be_empty
    end
  end

  describe "caching" do
    let(:headers) { { "Authorization" => jwt_for(user) } }
    # Test env runs :null_store (no-op); swap in a real store to exercise caching.
    before { allow(Rails).to receive(:cache).and_return(ActiveSupport::Cache::MemoryStore.new) }

    it "serves a repeated request from cache without recomputing" do
      create(:application, :applied, user: user)
      get "/api/v1/dashboard", headers: headers
      expect(JSON.parse(response.body)["total"]).to eq(1)

      expect_any_instance_of(Api::V1::DashboardController).not_to receive(:compute_stats)
      get "/api/v1/dashboard", headers: headers
      expect(JSON.parse(response.body)["total"]).to eq(1)
    end

    it "recomputes when the user's applications change (cache key invalidates)" do
      create(:application, :applied, user: user)
      get "/api/v1/dashboard", headers: headers
      expect(JSON.parse(response.body)["total"]).to eq(1)

      create(:application, :applied, user: user)
      get "/api/v1/dashboard", headers: headers
      expect(JSON.parse(response.body)["total"]).to eq(2)
    end

    # Ghost risk is a function of elapsed time, and no row changes when an
    # application crosses its threshold — so the date has to be in the key or the
    # flag would not appear until something else invalidated the cache.
    it "recomputes the next day, so a silence that crosses the threshold is seen" do
      # A Wednesday evening in June, so "the next day" is a business day and the
      # count actually moves; the applied date is 15 business days back.
      evening = Time.zone.local(2026, 6, 24, 18, 0, 0)

      travel_to(evening) do
        # Exactly at the 15-business-day threshold, so not yet past it.
        create(:application, user: user, status: "applied",
               applied_at: Time.zone.parse("2026-06-03 10:00"))

        get "/api/v1/dashboard", headers: { "Authorization" => jwt_for(user) }
        expect(JSON.parse(response.body)["ghost_risk"]["at_risk"]).to be_empty
      end

      # Ten hours later: the next calendar day in JST, and nothing about any row
      # has changed. Only the date in the cache key lets the flag appear.
      travel_to(evening + 10.hours) do
        get "/api/v1/dashboard", headers: { "Authorization" => jwt_for(user) }
        expect(JSON.parse(response.body)["ghost_risk"]["at_risk"].length).to eq(1)
      end
    end
  end
end
