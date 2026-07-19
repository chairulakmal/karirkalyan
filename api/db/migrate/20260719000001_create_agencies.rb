class CreateAgencies < ActiveRecord::Migration[8.1]
  def change
    create_table :agencies do |t|
      t.references :user, null: false, foreign_key: true, index: false
      t.string :name, null: false

      t.timestamps
    end

    # One row per name per user: Agency.resolve find-or-creates against this,
    # and it doubles as the lookup index (user_id prefix).
    add_index :agencies, [ :user_id, :name ], unique: true
  end
end
