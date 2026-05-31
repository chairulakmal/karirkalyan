# Preview reminder email at:
#   http://localhost:3001/rails/mailers/follow_up_mailer/reminder
#
# Uses a real application if one exists (run `bin/rails db:seed` first),
# otherwise builds an unsaved in-memory record so the preview always renders.
class FollowUpMailerPreview < ActionMailer::Preview
  def reminder
    FollowUpMailer.reminder(sample_application)
  end

  private

  def sample_application
    Application.order(:created_at).first || Application.new(
      id:           0,
      company:      "Mercari",
      role:         "Backend Engineer",
      status:       "applied",
      follow_up_at: Time.current,
      user:         User.first || User.new(email: "demo@karirkalyan.com")
    )
  end
end
