class ApplicationMailer < ActionMailer::Base
  # From address must be on a domain verified with the SMTP provider (Resend).
  # Overridable per-environment via MAILER_FROM; the default is a safe fallback
  # that only works once kk.chairulakmal.com is verified in Resend.
  default from: ENV.fetch("MAILER_FROM", "KarirKalyan <reminders@kk.chairulakmal.com>")

  private

  # Origin of the deployed web app — used to build absolute links in emails.
  def frontend_origin
    ENV.fetch("FRONTEND_URL", "http://localhost:3000")
  end
end
