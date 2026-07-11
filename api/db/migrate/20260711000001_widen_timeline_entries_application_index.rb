class WidenTimelineEntriesApplicationIndex < ActiveRecord::Migration[8.0]
  # Every read of this table is per-application in time order: the detail page's
  # timeline, and the LAG(...) OVER (PARTITION BY application_id ORDER BY
  # created_at) in Applications::GhostRiskQuery. The composite serves both and
  # covers the old bare index as a prefix, so this widens an index rather than
  # adding one.
  def change
    add_index :timeline_entries, [ :application_id, :created_at ]
    remove_index :timeline_entries, :application_id,
                 name: "index_timeline_entries_on_application_id"
  end
end
