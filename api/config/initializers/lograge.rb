# Single-line JSON logs in production so Railway's log viewer can parse and filter.
# Keeps :request_id in the payload (set as a log tag in production.rb) for tracing.
Rails.application.configure do
  config.lograge.enabled              = Rails.env.production?
  config.lograge.formatter            = Lograge::Formatters::Json.new
  config.lograge.base_controller_class = "ActionController::API"

  config.lograge.custom_options = lambda do |event|
    {
      time:       Time.current.iso8601,
      request_id: event.payload[:request_id] || event.payload[:headers]&.[]("action_dispatch.request_id"),
      params:     event.payload[:params]&.except("controller", "action")
    }
  end
end
