# Preview welcome email at:
#   http://localhost:3001/rails/mailers/welcome_mailer/welcome
class WelcomeMailerPreview < ActionMailer::Preview
  def welcome
    user = User.first || User.new(email: "demo@karirkalyan.com")
    WelcomeMailer.welcome(user)
  end
end
