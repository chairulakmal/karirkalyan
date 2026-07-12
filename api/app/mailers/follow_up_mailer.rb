class FollowUpMailer < ApplicationMailer
  # One email per user per business day, sent by FollowUpReminderJob — not one per
  # application. Three follow-ups due on the same morning are one email with three
  # entries, so the inbox cost of this feature scales with days rather than with how
  # well the search is going. Mirrors the in-app TimelineEntry reminders so the nudge
  # reaches the user off-screen too.
  def digest(user, applications)
    @user         = user
    @applications = applications
    @origin       = frontend_origin

    mail(to: @user.email, subject: subject_for(applications))
  end

  private

  # The single case is the common case and deserves to read like a sentence, not like
  # a report with a count of one in it.
  def subject_for(applications)
    if applications.one?
      "Follow up on your #{applications.first.company} application"
    else
      "#{applications.size} follow-ups due today"
    end
  end
end
