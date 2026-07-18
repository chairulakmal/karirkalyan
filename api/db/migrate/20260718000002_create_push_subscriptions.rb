# Web Push subscriptions — the follow-up digest's second channel (SPEC.md
# § Push notifications). Purely additive, like credentials before it: the
# previous image never writes here, so v1.6.0 stays a minor under the
# versioning test.
class CreatePushSubscriptions < ActiveRecord::Migration[8.1]
  def change
    create_table :push_subscriptions do |t|
      t.references :user, null: false, foreign_key: true
      # Unique globally, not per user: a push endpoint identifies one browser
      # profile, so a re-subscription updates the row in place and ownership
      # follows the session that registered it last.
      t.string :endpoint, null: false, index: { unique: true }
      t.string :p256dh,   null: false
      t.string :auth,     null: false

      t.timestamps
    end
  end
end
