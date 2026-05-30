module Api
  module V1
    class DashboardController < ApplicationController
      def index
        by_status = current_user.applications.group(:status).count

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

        render json: {
          by_status:          by_status,
          total:              by_status.values.sum,
          avg_days_to_offer:  avg_days_to_offer
        }
      end
    end
  end
end
