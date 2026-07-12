class WelcomeMailer < ApplicationMailer
  # Sent once when an account is created. Its only caller is the `users:create`
  # Rake task — registration is closed, so there is no sign-up endpoint to call
  # it any more (SPEC.md § Registration is closed).
  def welcome(user)
    @user                = user
    @new_application_url = "#{frontend_origin}/applications/new"
    @dashboard_url       = "#{frontend_origin}/dashboard"

    mail(
      to:      @user.email,
      subject: "Welcome to KarirKalyan"
    )
  end
end
