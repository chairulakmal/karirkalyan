class AddJapanMarketColumnsToApplications < ActiveRecord::Migration[8.1]
  # Every column here is nullable with no default, per TODO.md's standing rule:
  # the previous image keeps INSERTing into this table, and a NOT NULL column
  # would fail those writes and quietly turn this minor into a major.
  def change
    add_column :applications, :channel, :string
    add_column :applications, :japanese_level, :string
    add_column :applications, :comp_annual_min_yen, :bigint
    add_column :applications, :comp_annual_max_yen, :bigint
    add_column :applications, :comp_months_guaranteed, :float
    add_column :applications, :comp_months_variable, :float
    add_column :applications, :posting_snapshot, :text

    add_reference :applications, :agency, null: true, foreign_key: true
  end
end
