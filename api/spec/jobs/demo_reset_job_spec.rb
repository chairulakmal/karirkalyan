require "rails_helper"

RSpec.describe DemoResetJob, type: :job do
  describe "#perform" do
    it "delegates to Demo::ResetService" do
      expect(Demo::ResetService).to receive(:call)
      described_class.new.perform
    end

    it "seeds the demo account when run against a clean database" do
      expect(User.find_by(email: Demo::ResetService::DEMO_EMAIL)).to be_nil

      described_class.new.perform

      demo = User.find_by(email: Demo::ResetService::DEMO_EMAIL)
      expect(demo).to be_present
      expect(demo.applications.count).to be > 0
    end
  end
end
