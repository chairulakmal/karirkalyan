# Preview the digest email at:
#   http://localhost:3001/rails/mailers/follow_up_mailer/digest
#   http://localhost:3001/rails/mailers/follow_up_mailer/digest_single
#
# Both cases are previewable because the subject line and the heading differ between
# them (see FollowUpMailer#subject_for). Uses real applications if any exist (run
# `bin/rails db:seed` first), otherwise builds unsaved in-memory records so the
# preview always renders.
class FollowUpMailerPreview < ActionMailer::Preview
  def digest
    applications = sample_applications
    FollowUpMailer.digest(applications.first.user, applications)
  end

  def digest_single
    application = sample_applications.first
    FollowUpMailer.digest(application.user, [ application ])
  end

  private

  def sample_applications
    persisted = Application.order(:created_at).limit(3).to_a
    return persisted if persisted.any?

    user = User.first || User.new(email: "demo@karirkalyan.com")
    [
      Application.new(id: 1, company: "Mercari", role: "Backend Engineer",
        status: "applied", follow_up_at: Time.current, user: user),
      Application.new(id: 2, company: "SmartNews", role: "Full-Stack Engineer",
        status: "interviewing", follow_up_at: 2.days.ago, user: user),
      Application.new(id: 3, company: "Cybozu", role: "Frontend Engineer",
        status: "screening", follow_up_at: Time.current, user: user)
    ]
  end
end
