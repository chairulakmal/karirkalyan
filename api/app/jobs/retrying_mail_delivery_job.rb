require "net/smtp"

# Every mailer delivers through this job (ApplicationMailer.delivery_job).
# Rails' own MailDeliveryJob has no retry, and FollowUpReminderJob spends its
# exactly-once claim before it enqueues the mail, so one SMTP hiccup used to
# lose that day's reminder for good (SPEC.md § Mail).
#
# Only transient failures retry. A 5xx from the SMTP server or an auth error
# will not fix itself, so those fail at once and land in the failed-jobs table.
class RetryingMailDeliveryJob < ActionMailer::MailDeliveryJob
  TRANSIENT_SMTP_ERRORS = [
    Net::SMTPServerBusy,        # 4xx: the server asks us to try again later
    Net::OpenTimeout,
    Net::ReadTimeout,
    Errno::ECONNREFUSED,
    Errno::ECONNRESET,
    Errno::ETIMEDOUT,
    Errno::EHOSTUNREACH,
    IOError,                    # includes EOFError
    SocketError,                # DNS resolution failed
    OpenSSL::SSL::SSLError
  ].freeze

  # Ten polynomial backoffs span about two hours, long enough to outlast a
  # provider incident and short enough that the reminder still lands the same day.
  retry_on(*TRANSIENT_SMTP_ERRORS, wait: :polynomially_longer, attempts: 10)
end
