# The only way an account gets made now that registration is closed
# (SPEC.md § Registration is closed). Run it on the server:
#
#   bin/rails users:create EMAIL=someone@example.com PASSWORD=…
#
# Omit PASSWORD and one is generated and printed once.
namespace :users do
  desc "Create a user account (EMAIL=… [PASSWORD=…]) and send the welcome mail"
  task create: :environment do
    email    = ENV["EMAIL"].to_s.strip
    password = ENV["PASSWORD"].presence || Devise.friendly_token(24)

    abort "EMAIL is required — bin/rails users:create EMAIL=you@example.com" if email.empty?

    user = User.new(email: email, password: password, password_confirmation: password)

    unless user.save
      abort "Could not create #{email}: #{user.errors.full_messages.to_sentence}"
    end

    # deliver_later, matching every other mail in the app: production sets
    # raise_delivery_errors, and a transient SMTP failure should not make a
    # created account look like a failed one.
    WelcomeMailer.welcome(user).deliver_later

    puts "Created user ##{user.id} — #{user.email}"
    puts "Password: #{password}" if ENV["PASSWORD"].blank?
    puts "Welcome mail enqueued."
  end
end
