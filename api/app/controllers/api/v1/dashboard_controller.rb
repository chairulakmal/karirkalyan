module Api
  module V1
    class DashboardController < ApplicationController
      # Bump when the stats payload SHAPE changes — the data-derived key alone
      # won't invalidate on a deploy/reload if the underlying rows are unchanged,
      # so a shape change (e.g. adding `facets`) would otherwise serve a stale
      # cached payload from Solid Cache (prod) or the in-process memory store (dev).
      STATS_CACHE_VERSION = 4

      # The Upcoming agenda (v1.11.0): how many dated items to surface, and how far
      # out a residence-expiry clock has to be before it counts as "upcoming".
      AGENDA_LIMIT = 8
      AGENDA_RESIDENCE_WINDOW_DAYS = 90

      def index
        # `user` and `upcoming` ride outside the cached block: both are cheap reads,
        # and keying application stats on a user record would be a category error.
        # `user` is here so the dashboard stops making a second /me request; the
        # agenda is here because it also reads the user's residence field, which is
        # not in the stats cache key, so caching it could serve a stale clock.
        render json: cached_stats.merge(user: current_user, upcoming: upcoming_agenda)
      end

      private

      # The dated commitments that answer "what do I need to do?", merged from
      # where they already live and sorted chronologically: follow-ups and
      # upcoming interviews across the active applications, plus the user's own
      # residence-expiry clock when it is close enough to matter. Overdue-but-
      # active follow-ups sort to the front (earliest date first) and the client
      # colours them; interviews are future-only, so a finished one drops off.
      # Gated on ACTIVE_STATES for the same reason `isOverdue` is on the list: a
      # dated fact on a closed application is not actionable. A light indexed read,
      # capped at AGENDA_LIMIT, rendered as a dashboard section, never a route.
      def upcoming_agenda
        items = []

        current_user.applications
          .where(status: ApplicationFSM::ACTIVE_STATES)
          .where.not(follow_up_at: nil)
          .select(:id, :company, :role, :status, :follow_up_at)
          .each { |app| items << agenda_item("follow_up", app.follow_up_at, app) }

        current_user.applications
          .where(status: ApplicationFSM::ACTIVE_STATES)
          .where("interview_at >= ?", Time.current)
          .select(:id, :company, :role, :status, :interview_at)
          .each { |app| items << agenda_item("interview", app.interview_at, app) }

        if (expiry = current_user.residence_expires_on) &&
           expiry <= AGENDA_RESIDENCE_WINDOW_DAYS.days.from_now.to_date
          items << { type: "residence", at: expiry.to_time, application_id: nil,
                     company: nil, role: nil, status: nil }
        end

        items.sort_by { |item| item[:at] }
             .first(AGENDA_LIMIT)
             .map { |item| item.merge(at: item[:at].iso8601) }
      end

      def agenda_item(type, at, app)
        { type: type, at: at, application_id: app.id,
          company: app.company, role: app.role, status: app.status }
      end

      # The aggregation below is the heaviest work in the app and runs on every
      # dashboard load. Cache it, keyed on the user's application count + latest
      # updated_at: every status change goes through TransitionService, which bumps
      # the application's updated_at, so the key changes exactly when the stats
      # could change — a self-expiring key, no manual invalidation. The expires_in
      # is just a safety net.
      #
      # Date.current is in the key because ghost risk is a function of ELAPSED TIME,
      # which a key built from rows cannot see: an application crossing its
      # threshold changes nothing about any row, so without the date it would sit
      # unflagged until the cache expired. Daily granularity is exactly right for a
      # threshold measured in days.
      def cached_stats
        count, last_updated = current_user.applications
          .pick(Arel.sql("COUNT(*)"), Arel.sql("MAX(updated_at)"))
        cache_key = "dashboard:v#{STATS_CACHE_VERSION}:#{current_user.id}:" \
                    "#{count}:#{last_updated&.to_f}:#{Date.current}"

        Rails.cache.fetch(cache_key, expires_in: 12.hours) { compute_stats }
      end

      def compute_stats
        by_status = current_user.applications.group(:status).count

        # One tuple per application: [company, job-board, status, japanese_level].
        # The frontend cross-narrows every facet from this, so picking a company
        # narrows the board list AND the stage-chip counts AND the Japanese-level
        # counts, all disjunctively (v1.10.0: status and japanese_level joined the
        # pairs the dropdowns already read). Cheap at personal-tracker scale; a
        # few columns plucked, no aggregation.
        facets = current_user.applications.pluck(:company, :url, :status, :japanese_level)
          .map { |company, url, status, level| [ company, JobBoard.from_url(url) || JobBoard::NONE, status, level ] }

        # Use the TimelineEntry timestamp for when the offer was recorded, not
        # updated_at, which drifts on any subsequent edit to the application.
        avg_days_to_offer = current_user.applications
          .where(status: %w[offer accepted declined])
          .where.not(applied_at: nil)
          .joins(
            "INNER JOIN (
               SELECT DISTINCT ON (application_id) application_id, created_at AS offer_at
               FROM timeline_entries
               WHERE to_status = 'offer'
               ORDER BY application_id, created_at
             ) first_offer ON first_offer.application_id = applications.id"
          )
          .average("EXTRACT(epoch FROM (first_offer.offer_at - applied_at)) / 86400.0")
          &.to_f&.round(1)

        {
          by_status:          by_status,
          facets:             facets,
          total:              by_status.values.sum,
          avg_days_to_offer:  avg_days_to_offer,
          **outcome_rates,
          avg_days_in_stage:  avg_days_in_stage,
          ghost_risk:         Applications::GhostRiskQuery.new(user: current_user).call
        }
      end

      # Two stat cards over the FSM + timeline, zero schema. The denominator for
      # both is applications that actually left the pre-application stages
      # (wishlist/draft); wishlist items nobody has applied to would only dilute a
      # rate about how companies respond. A "response" is the company replying at
      # all (advancing you or rejecting you), so ghosting is precisely its
      # absence; both are read from the timeline, so a later revival does not
      # erase that a reply (or a ghosting) once happened. Nil when there is
      # nothing applied to, which the card renders as "not enough data" rather
      # than a misleading 0%.
      def outcome_rates
        applied = current_user.applications.where.not(status: %w[wishlist draft]).count
        return { response_rate: nil, ghost_rate: nil } if applied.zero?

        responded = current_user.timeline_entries
          .where(to_status: %w[phone_screen technical final_round offer rejected])
          .distinct.count(:application_id)
        ghosted = current_user.timeline_entries
          .where(to_status: "ghosted").distinct.count(:application_id)

        {
          response_rate: (responded.to_f / applied * 100).round,
          ghost_rate:    (ghosted.to_f / applied * 100).round
        }
      end

      # Average days in the current stage across in-flight applications, the same
      # COALESCE anchor the board's triage cards use (last stage change, else
      # applied_at, else creation, never updated_at). A correlated subquery
      # inside the AVG, one statement.
      def avg_days_in_stage
        current_user.applications
          .where(status: ApplicationFSM::ACTIVE_STATES)
          .pick(Arel.sql(<<~SQL.squish))
            AVG(EXTRACT(epoch FROM (now() - COALESCE(
              (SELECT MAX(created_at) FROM timeline_entries
                 WHERE timeline_entries.application_id = applications.id),
              applied_at, created_at))) / 86400.0)
          SQL
          &.to_f&.round(1)
      end
    end
  end
end
