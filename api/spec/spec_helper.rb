# Coverage must start before any application code is loaded.
# Skip in CI when COVERAGE=false (saves a few seconds on simple runs); on by default locally.
if ENV.fetch("COVERAGE", "true") == "true"
  require "simplecov"
  SimpleCov.start "rails" do
    add_filter "/spec/"
    add_filter "/config/"
    add_filter "/db/"
    add_filter "/bin/"
    enable_coverage :branch
    minimum_coverage line: 80
  end
end

RSpec.configure do |config|
  config.expect_with :rspec do |expectations|
    expectations.include_chain_clauses_in_custom_matcher_descriptions = true
  end

  config.mock_with :rspec do |mocks|
    mocks.verify_partial_doubles = true
  end

  config.shared_context_metadata_behavior = :apply_to_host_groups
end
