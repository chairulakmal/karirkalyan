# Raise on detected N+1 queries during request specs.
# Only wraps `type: :request` examples — unit specs without DB don't need it.
Prosopite.rails_logger = false
Prosopite.raise        = true

# Building N fixtures legitimately issues N of whatever one create does — including the COUNT
# behind Application::MAX_PER_USER. The scanner wraps the whole example, so it reads that setup
# loop as an N+1 even though the request under test issues exactly one. Pause around the loop
# rather than tagging the example `skip_n_plus_one`, which would also stop the scanner watching
# the request the spec actually exists to protect.
#
# Pause takes the block itself rather than pause/yield/ensure-resume: `resume` hard-sets the
# scan flag true rather than restoring what it was, so the ensure form would switch scanning
# *on* in a `skip_n_plus_one` example that had deliberately never started one. The block form
# saves and restores the previous value.
module ProsopiteHelpers
  def without_n_plus_one_scanning(&block)
    Prosopite.pause(&block)
  end
end

RSpec.configure do |config|
  config.include ProsopiteHelpers, type: :request

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
