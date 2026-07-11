# Devise renders authentication failures through a Warden failure app, outside
# any controller, so ErrorRendering can't reach them. This subclass adds the
# stable `code` to the JSON body Devise already produces (SPEC.md § API
# contract): a credential failure on sign-in is `invalid_credentials`; a
# missing, expired, or revoked JWT anywhere else is `unauthenticated`.
class JsonFailureApp < Devise::FailureApp
  # Warden messages for a bad email/password pair. :invalid covers the combined
  # paranoid-style message; :not_found_in_database is the unknown-email case.
  CREDENTIAL_FAILURES = %i[invalid not_found_in_database].freeze

  def http_auth_body
    { error: i18n_message, code: failure_code }.to_json
  end

  private

  def failure_code
    CREDENTIAL_FAILURES.include?(warden_message) ? "invalid_credentials" : "unauthenticated"
  end
end
