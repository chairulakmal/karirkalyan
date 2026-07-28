# Be sure to restart your server when you modify this file.

# Configure parameters to be partially matched (e.g. passw matches password) and filtered from the log file.
# Use this to limit dissemination of sensitive information.
# See the ActiveSupport::ParameterFilter documentation for supported notations and behaviors.
#
# This list is the whole defence, not a nicety: lograge (config/initializers/lograge.rb)
# emits request.filtered_parameters in full on every production request. The
# Authorization header and cookies are never logged, so anything sensitive that
# rides in the *body* has to be named here or it lands in the log verbatim.
#
# The second group below was missing, and covered three real leaks:
#
#   - WebAuthn assertions. Both passkey ceremonies read the credential through
#     to_unsafe_h, so id/rawId/clientDataJSON/authenticatorData/signature/userHandle
#     were all logged. userHandle is users.webauthn_id, which User#as_json
#     deliberately strips from every API response, so the logs held something the
#     API contract treats as internal.
#   - Push subscriptions. endpoint + p256dh + auth together ARE the addressing and
#     keying material for a browser's push channel. `:_key` matches `public_key`,
#     not `p256dh`, and nothing matched `auth` at all.
#   - Free text. A pasted posting is up to 2 MB and posting_snapshot up to 12k
#     chars; neither belongs in a log line, on volume grounds as much as privacy.
Rails.application.config.filter_parameters += [
  :passw, :email, :secret, :token, :_key, :crypt, :salt, :certificate, :otp, :ssn, :cvv, :cvc,
  # WebAuthn ceremony payloads
  :credential, :challenge, :rawId, :signature, :clientDataJSON, :authenticatorData, :userHandle,
  # Web Push subscription material
  :endpoint, :p256dh, :auth,
  # User free text (privacy, and log volume)
  :text, :notes, :note, :posting_snapshot
]
