class CreateApplications < ActiveRecord::Migration[8.1]
  def change
    create_table :applications do |t|
      t.references :user, null: false, foreign_key: true

      t.string   :company,      null: false
      t.string   :role,         null: false
      t.string   :url
      t.string   :status,       null: false, default: "draft"
      t.datetime :follow_up_at
      t.datetime :applied_at
      t.text     :notes
      t.binary   :resume
      t.binary   :cover_letter
      t.integer  :lock_version,  null: false, default: 0

      t.timestamps
    end

    add_index :applications, :status
    add_index :applications, :follow_up_at
  end
end
