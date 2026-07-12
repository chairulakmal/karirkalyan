require "rails_helper"
require "rake"

# `bin/rails users:create` is the only way an account gets made now that registration
# is closed (SPEC.md § Registration is closed), and the only caller left of
# WelcomeMailer. Both facts are load-bearing, so both are tested.
RSpec.describe "users:create", type: :task do
  before(:all) do
    Rake.application = Rake::Application.new
    Rake.application.rake_require("tasks/users", [ Rails.root.join("lib").to_s ])
    Rake::Task.define_task(:environment)
  end

  before { Rake::Task["users:create"].reenable }

  after do
    ENV.delete("EMAIL")
    ENV.delete("PASSWORD")
  end

  def invoke = Rake::Task["users:create"].invoke

  it "creates the user and enqueues the welcome mail" do
    ENV["EMAIL"]    = "hire@example.com"
    ENV["PASSWORD"] = "password123"

    expect { expect { invoke }.to output(/Created user/).to_stdout }
      .to change(User, :count).by(1)
      .and have_enqueued_mail(WelcomeMailer, :welcome)

    expect(User.last.valid_password?("password123")).to be(true)
  end

  it "generates and prints a password when none is given" do
    ENV["EMAIL"] = "generated@example.com"

    expect { invoke }.to output(/Password: \S+/).to_stdout
    expect(User.find_by(email: "generated@example.com")).to be_present
  end

  it "aborts without EMAIL" do
    expect { invoke }.to raise_error(SystemExit).and output(/EMAIL is required/).to_stderr
  end

  it "aborts on a duplicate email rather than sending a second welcome" do
    create(:user, email: "taken@example.com")
    ENV["EMAIL"] = "taken@example.com"

    expect do
      expect { invoke }.to raise_error(SystemExit).and output(/Could not create/).to_stderr
    end.not_to have_enqueued_mail(WelcomeMailer, :welcome)
  end
end
