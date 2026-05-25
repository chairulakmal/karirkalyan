module Api
  module V1
    class DashboardController < ApplicationController
      def index
        by_status = current_user.applications.group(:status).count

        avg_days_to_offer = current_user.applications
          .where(status: %w[offer accepted declined])
          .where.not(applied_at: nil)
          .average("EXTRACT(epoch FROM (updated_at - applied_at)) / 86400.0")
          &.round(1)

        render json: {
          by_status:          by_status,
          total:              by_status.values.sum,
          avg_days_to_offer:  avg_days_to_offer
        }
      end
    end
  end
end
