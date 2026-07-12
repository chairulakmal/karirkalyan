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

  # The other half of the operator's toolkit, and not optional: `User` has no
  # :recoverable module, so there is no password-reset flow — and with
  # registration closed, a user who forgets their password cannot start over by
  # signing up again either. Without this task a forgotten password is permanent
  # lockout with no supported remedy.
  desc "Reset a user's password (EMAIL=… [PASSWORD=…]) and revoke their tokens"
  task set_password: :environment do
    email    = ENV["EMAIL"].to_s.strip
    password = ENV["PASSWORD"].presence || Devise.friendly_token(24)

    abort "EMAIL is required — bin/rails users:set_password EMAIL=you@example.com" if email.empty?

    user = User.find_by(email: email)
    abort "No user with email #{email}" if user.nil?

    # Rotating the jti is what makes this a reset rather than a second key: JWTs
    # already issued validate against `users.jti`, so leaving it alone would let
    # every session that prompted the reset carry on unaffected.
    unless user.update(password: password, password_confirmation: password, jti: SecureRandom.uuid)
      abort "Could not update #{email}: #{user.errors.full_messages.to_sentence}"
    end

    puts "Reset password for user ##{user.id} — #{user.email}"
    puts "Password: #{password}" if ENV["PASSWORD"].blank?
    puts "Every existing token for this account is now revoked."
  end
end
