# Single-use challenge storage for the two WebAuthn ceremonies — SPEC.md
# § Passkeys. Challenges live in Rails.cache (Solid Cache in production, so
# they survive across Puma workers) for five minutes, and the take_* readers
# delete before returning, so a replayed or concurrent second verification
# finds nothing.
#
# Registration is keyed by user id — one in-flight enrollment per user, and a
# fresh options request overwrites a stale one. Authentication has no user yet
# (the ceremony is usernameless), so its challenge is keyed by its own value:
# the client echoes it back, which is safe because a challenge is only
# accepted if it is sitting here (server-issued, unexpired, unused) *and* the
# assertion cryptographically verifies over it.
module PasskeyChallenges
  TTL = 5.minutes

  class << self
    def store_registration(user, challenge)
      Rails.cache.write(registration_key(user), challenge, expires_in: TTL)
    end

    # The stored challenge, at most once per store — nil after that.
    def take_registration!(user)
      key = registration_key(user)
      challenge = Rails.cache.read(key)
      Rails.cache.delete(key)
      challenge
    end

    def store_authentication(challenge)
      Rails.cache.write(authentication_key(challenge), true, expires_in: TTL)
    end

    # True exactly once per issued challenge.
    def take_authentication!(challenge)
      key = authentication_key(challenge)
      known = Rails.cache.read(key)
      Rails.cache.delete(key)
      known.present?
    end

    private

    def registration_key(user)
      "webauthn:registration:#{user.id}"
    end

    def authentication_key(challenge)
      "webauthn:authentication:#{challenge}"
    end
  end
end
