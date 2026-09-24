# Preview the digest email at:
#   http://localhost:3001/rails/mailers/follow_up_mailer/digest
#   http://localhost:3001/rails/mailers/follow_up_mailer/digest_single
#
# Both cases are previewable because the subject line and the heading differ between
# them (see FollowUpMailer#subject_for). The mailer loads applications by id, so the
# preview needs saved ones: run `bin/rails db:seed` first.
class FollowUpMailerPreview < ActionMailer::Preview
  def digest
    applications = sample_applications
    FollowUpMailer.digest(applications.first.user, applications.map(&:id))
  end

  def digest_single
    application = sample_applications.first
    FollowUpMailer.digest(application.user, [ application.id ])
  end

  private

  def sample_applications
    user = User.joins(:applications).first
    raise "No saved applications to preview. Run `bin/rails db:seed` first." if user.nil?

    user.applications.order(:created_at).limit(3).to_a
  end
end
