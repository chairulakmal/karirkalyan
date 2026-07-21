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
          required: %w[by_status facets total avg_days_to_offer response_rate ghost_rate avg_days_in_stage ghost_risk user],
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
              required: %w[thresholds basis sample_sizes at_risk],
              description: "Applications silent past the user's p90 response time for their stage",
              properties: {
                thresholds: {
                  type: :object, additionalProperties: { type: :number },
                  description: "Days of silence tolerated per stage, keyed on applied/phone_screen"
                },
                basis: {
                  type: :object,
                  additionalProperties: { type: :string, enum: %w[personal default] },
                  description: "Whether each threshold came from the user's own history or the global default"
                },
                sample_sizes: {
                  type: :object, additionalProperties: { type: :integer },
                  description: "Completed responses behind each threshold"
                },
                at_risk: {
                  type: :array, description: "Longest silence first",
                  items: {
                    type: :object,
                    required: %w[id company role status lock_version days_in_stage threshold],
                    properties: {
                      id:            { type: :integer },
                      company:       { type: :string },
                      role:          { type: :string },
                      status:        { type: :string, enum: %w[applied phone_screen] },
                      lock_version:  { type: :integer, description: "So the UI can transition inline" },
                      days_in_stage: { type: :number },
                      threshold:     { type: :number }
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
          expect(data["ghost_risk"]).to include("thresholds", "basis", "sample_sizes", "at_risk")
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

    it "flags a silent application and ships what the UI needs to close it" do
      stale = create(:application, user: user, company: "Mercari",
                     status: "applied", applied_at: 40.days.ago)

      get "/api/v1/dashboard", headers: headers
      risk = JSON.parse(response.body)["ghost_risk"]

      expect(risk["at_risk"].length).to eq(1)
      expect(risk["at_risk"].first).to include(
        "id"           => stale.id,
        "company"      => "Mercari",
        "status"       => "applied",
        "threshold"    => 21.0,
        "lock_version" => stale.lock_version
      )
      # No history yet, so the default threshold is what judged it — and the
      # payload says so rather than presenting the number as the user's own.
      expect(risk["basis"]["applied"]).to eq("default")
      expect(risk["sample_sizes"]["applied"]).to eq(0)
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
      evening = Time.zone.local(2026, 7, 11, 18, 0, 0)

      travel_to(evening) do
        # Exactly at the 21-day default threshold — not yet past it.
        create(:application, user: user, status: "applied", applied_at: 21.days.ago)

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
