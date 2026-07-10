class AddUserCreatedAtIndexToApplications < ActiveRecord::Migration[8.1]
  def change
    # The list endpoint filters by user_id, orders by created_at DESC, and
    # cursor-paginates on created_at — this composite index serves all three
    # without a per-page sort. It also covers plain user_id lookups, so the
    # single-column index from `t.references` is redundant and dropped.
    add_index :applications, [ :user_id, :created_at ], order: { created_at: :desc }
    remove_index :applications, :user_id
  end
end
