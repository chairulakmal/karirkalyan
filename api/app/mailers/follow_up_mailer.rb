class FollowUpMailer < ApplicationMailer
  # Sent by FollowUpReminderJob when an application's follow_up_at falls due.
  # Mirrors the in-app TimelineEntry reminder so the nudge reaches the user
  # off-screen too.
  def reminder(application)
    @application = application
    @user        = application.user
    @url         = "#{frontend_origin}/applications/#{application.id}"

    mail(
      to:      @user.email,
      subject: "Follow up on your #{@application.company} application"
    )
  end
end
