# Passkey sign-in (SPEC.md § Passkeys): one row per enrolled WebAuthn
# authenticator, plus the opaque user handle WebAuthn identifies accounts by.
# Both changes are additive — the previous image never writes either — so the
# release stays a minor under the versioning test (SPEC.md § Versioning).
class CreateCredentials < ActiveRecord::Migration[8.1]
  def change
    # Nullable on purpose: generated lazily on first passkey enrollment, and a
    # password-only account never needs one.
    add_column :users, :webauthn_id, :string

    create_table :credentials do |t|
      t.references :user, null: false, foreign_key: true
      # Unique globally, not per user: authentication is usernameless, so the
      # credential row found by external_id is what names the user.
      t.string   :external_id, null: false, index: { unique: true }
      t.string   :public_key,  null: false
      t.bigint   :sign_count,  null: false, default: 0
      t.string   :nickname
      t.datetime :last_used_at

      t.timestamps
    end
  end
end
