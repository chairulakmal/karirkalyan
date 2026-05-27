# Raise on detected N+1 queries during request specs.
# Only wraps `type: :request` examples — unit specs without DB don't need it.
Prosopite.rails_logger = false
Prosopite.raise        = true

RSpec.configure do |config|
  config.around(:each, type: :request) do |example|
    if example.metadata[:skip_n_plus_one]
      example.run
    else
      Prosopite.scan
      example.run
      Prosopite.finish
    end
  end
end
