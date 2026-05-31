class WelcomeMailer < ApplicationMailer
  # Sent once, on successful sign-up, from RegistrationsController#create.
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
