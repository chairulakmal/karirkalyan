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

    # The stored challenge, at most once per store — nil after that. This one
    # is read-then-delete, which leaves a concurrency window the authenticated
    # take below refuses to leave — accepted here because the key is scoped to
    # an already-authenticated user racing only themselves, and the prize for
    # winning the race is enrolling their own passkey twice, which the
    # external_id uniqueness constraint refuses anyway.
    def take_registration!(user)
      key = registration_key(user)
      challenge = Rails.cache.read(key)
      Rails.cache.delete(key)
      challenge
    end

    def store_authentication(challenge)
      Rails.cache.write(authentication_key(challenge), true, expires_in: TTL)
    end

    # True exactly once per issued challenge. read enforces the TTL (an
    # expired entry reads as nil even before the store sweeps it, while delete
    # would still count the row); delete is the atomic single-use check — it
    # returns whether a live entry was actually removed (one SQL DELETE in
    # Solid Cache, monitor-held in MemoryStore), so of two concurrent callers
    # exactly one gets true. read-then-delete alone would be a TOCTOU race:
    # both readers see true, both proceed.
    def take_authentication!(challenge)
      key = authentication_key(challenge)
      Rails.cache.read(key).present? && Rails.cache.delete(key)
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
