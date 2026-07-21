# Push reminders for the events the pages already show: an interview coming up
# in the next day (fed by the interview_at instant the .ics work structures), and
# the user's status of residence nearing expiry with the CoE lead time it
# implies. A daily job, like the follow-up digest; it runs on the same push
# channel through Push::Notifier. SPEC.md § Push notifications, § Background jobs.
class InterviewReminderJob < ApplicationJob
  queue_as :default

  retry_on(*Push::Notifier::TRANSIENT_ERRORS, wait: :polynomially_longer, attempts: 3)

  # A reminder superseded by tomorrow's run should not linger.
  TTL = 12.hours.to_i

  # Interviews starting within a day of the run. The daily cadence makes this a
  # once-per-interview reminder: each interview falls in exactly one run's window.
  WINDOW = 24.hours

  # Fire a residence-expiry push only as the countdown crosses these day marks,
  # so a warning that stays true for 90 days does not push every single morning.
  RESIDENCE_THRESHOLDS = [ 90, 60, 30, 14, 7 ].freeze

  def perform
    return unless PushVapid.configured?

    # Only users who could receive a push. distinct because a user with several
    # devices joins several subscription rows. The first transient error is
    # collected across ALL users and raised once AFTER the loop, never inside it:
    # a raise mid-find_each would abort the iteration and skip every later user,
    # and retry_on would then re-abort at the same flaky endpoint every attempt.
    # The per-notification tag makes the retry a visual no-op on already-notified
    # devices, so re-sending the earlier users costs nothing.
    first_transient = nil
    User.joins(:push_subscriptions).distinct.find_each do |user|
      notifications(user).each do |payload|
        error = Push::Notifier.new(user).deliver(payload, ttl: TTL)
        first_transient ||= error
      end
    end
    raise first_transient if first_transient
  end

  private

  def notifications(user)
    interview_notifications(user) + residence_notifications(user)
  end

  def interview_notifications(user)
    # In-play states only: an application rejected or withdrawn after an interview
    # was scheduled still carries interview_at, and pushing "upcoming interview"
    # for a dead process is noise, the same reasoning that suppresses overdue
    # markers on closed rows.
    user.applications
      .where(status: ApplicationFSM::ACTIVE_STATES)
      .where(interview_at: Time.current..(Time.current + WINDOW))
      .order(:interview_at)
      .map { |application| interview_payload(application) }
  end

  def interview_payload(application)
    at = application.interview_at.in_time_zone
    {
      title: "Upcoming interview: #{application.company}",
      body:  "#{application.role} at #{at.strftime('%B %-d, %H:%M')} JST",
      url:   "/applications/#{application.id}",
      # Per-interview tag, so a retry replaces rather than stacks and two
      # different interviews stay two notifications.
      tag:   "interview-#{application.id}"
    }
  end

  def residence_notifications(user)
    days = user.residence_days_remaining
    return [] unless days && RESIDENCE_THRESHOLDS.include?(days)

    [ {
      title: "Your status of residence expires in #{days} days",
      body:  "Changing employer needs a fresh Certificate of Eligibility: budget about #{Visa::COE_LEAD_TIME_DAYS} days before a start date.",
      url:   "/settings",
      tag:   "residence-expiry"
    } ]
  end
end
