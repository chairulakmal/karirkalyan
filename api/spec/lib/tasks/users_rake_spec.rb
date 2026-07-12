require "rails_helper"
require "rake"

# Both tasks are loaded once, by the outer group. `rake_require` refuses to load a
# `.rake` file that is already in `$"`, so a second group standing up its own
# Rake::Application would get an empty one and fail with "Don't know how to build task".
RSpec.describe "users.rake", type: :task do
  before(:all) do
    Rake.application = Rake::Application.new
    Rake.application.rake_require("tasks/users", [ Rails.root.join("lib").to_s ])
    Rake::Task.define_task(:environment)
  end

  after do
    ENV.delete("EMAIL")
    ENV.delete("PASSWORD")
  end

  # `bin/rails users:create` is the only way an account gets made now that registration
  # is closed (SPEC.md § Registration is closed), and the only caller left of
  # WelcomeMailer. Both facts are load-bearing, so both are tested.
  describe "users:create" do
    before { Rake::Task["users:create"].reenable }

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

  # There is no :recoverable module and no sign-up to fall back on, so this task is
  # the *only* remedy for a forgotten password. A reset that left existing JWTs valid
  # would not be a reset, so the jti rotation is tested as carefully as the password.
  describe "users:set_password" do
    before { Rake::Task["users:set_password"].reenable }

    def invoke = Rake::Task["users:set_password"].invoke

    it "sets the new password and revokes every existing token" do
      user = create(:user, email: "locked@example.com", password: "oldpassword")
      old_jti = user.jti

      ENV["EMAIL"]    = "locked@example.com"
      ENV["PASSWORD"] = "newpassword123"

      expect { invoke }.to output(/Reset password/).to_stdout

      user.reload
      expect(user.valid_password?("newpassword123")).to be(true)
      expect(user.valid_password?("oldpassword")).to be(false)
      expect(user.jti).not_to eq(old_jti)
    end

    it "generates and prints a password when none is given" do
      create(:user, email: "generated-reset@example.com")
      ENV["EMAIL"] = "generated-reset@example.com"

      expect { invoke }.to output(/Password: \S+/).to_stdout
    end

    it "aborts on an unknown email" do
      ENV["EMAIL"] = "nobody@example.com"

      expect { invoke }.to raise_error(SystemExit).and output(/No user with email/).to_stderr
    end

    it "aborts without EMAIL" do
      expect { invoke }.to raise_error(SystemExit).and output(/EMAIL is required/).to_stderr
    end
  end
end
