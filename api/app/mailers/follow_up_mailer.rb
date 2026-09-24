class FollowUpMailer < ApplicationMailer
  # One email per user per business day, sent by FollowUpReminderJob — not one per
  # application. Three follow-ups due on the same morning are one email with three
  # entries, so the inbox cost of this feature scales with days rather than with how
  # well the search is going. Mirrors the in-app TimelineEntry reminders so the nudge
  # reaches the user off-screen too.
  #
  # Takes ids, not records, and loads them at delivery time. The job enqueues
  # the mail, which may then wait through SMTP retries; an application deleted
  # in between drops out of the digest instead of failing it. If none are left,
  # no mail is built and nothing is sent.
  def digest(user, application_ids)
    @user         = user
    @applications = user.applications.without_blobs.where(id: application_ids).order(:follow_up_at).to_a
    @origin       = frontend_origin
    return if @applications.empty?

    mail(to: @user.email, subject: subject_for(@applications))
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
