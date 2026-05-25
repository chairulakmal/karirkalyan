class CreateTimelineEntries < ActiveRecord::Migration[8.1]
  def change
    create_table :timeline_entries do |t|
      t.references :application, null: false, foreign_key: true
      t.references :actor,       null: false, foreign_key: { to_table: :users }

      t.string :from_status,     null: false
      t.string :to_status,       null: false
      t.text   :note
      t.string :idempotency_key

      t.timestamps
    end

    add_index :timeline_entries, :idempotency_key, unique: true
  end
end
