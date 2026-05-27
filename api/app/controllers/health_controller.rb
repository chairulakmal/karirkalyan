class HealthController < ActionController::API
  def show
    checks = {
      database: postgres_ok?,
      redis:    redis_ok?
    }

    if checks.values.all?
      render json: { status: "ok", checks: checks }, status: :ok
    else
      render json: { status: "degraded", checks: checks }, status: :service_unavailable
    end
  end

  private

  def postgres_ok?
    ActiveRecord::Base.connection.execute("SELECT 1")
    true
  rescue StandardError => e
    Rails.logger.error("Health check: postgres failed — #{e.class}: #{e.message}")
    false
  end

  def redis_ok?
    Sidekiq.redis { |c| c.call("PING") } == "PONG"
  rescue StandardError => e
    Rails.logger.error("Health check: redis failed — #{e.class}: #{e.message}")
    false
  end
end
