module Api
  module V1
    class DashboardController < ApplicationController
      # Bump when the stats payload SHAPE changes — the data-derived key alone
      # won't invalidate on a deploy/reload if the underlying rows are unchanged,
      # so a shape change (e.g. adding `facets`) would otherwise serve a stale
      # cached payload from Solid Cache (prod) or the in-process memory store (dev).
      STATS_CACHE_VERSION = 3

      def index
        # `user` rides outside the cached block: it is a cheap read, and keying
        # application stats on a user record would be a category error. It is here
        # at all so the dashboard stops making a second /me request for it.
        render json: cached_stats.merge(user: current_user)
      end

      private

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

        # [company, job-board] for every application — one pair per row. The
        # frontend derives the (interdependent) company and board dropdowns from
        # this, so selecting a board narrows the company list and vice versa.
        # Cheap to ship at personal-tracker scale; two columns, no aggregation.
        facets = current_user.applications.pluck(:company, :url)
          .map { |company, url| [ company, JobBoard.from_url(url) || JobBoard::NONE ] }

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
          ghost_risk:         Applications::GhostRiskQuery.new(user: current_user).call
        }
      end
    end
  end
end
