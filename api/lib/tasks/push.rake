# Generates a fresh VAPID keypair for Web Push (SPEC.md § Push notifications).
#
# Run once per environment and paste the output into that environment's env
# (Railway variables in production, .env in development) — the pairs are
# deliberately per-environment, so a dev key can never sign a push to the
# production user. Never commit a keypair.
namespace :push do
  desc "Generate a VAPID keypair for Web Push (per environment, never committed)"
  task vapid: :environment do
    key = WebPush.generate_key
    puts "VAPID_PUBLIC_KEY=#{key.public_key}"
    puts "VAPID_PRIVATE_KEY=#{key.private_key}"
  end
end
