class AddResidenceToUsers < ActiveRecord::Migration[8.1]
  # The global half of the visa item (TODO.md v1.9.0): the user's own 在留資格 and
  # its expiry, which drive the days-remaining warning. Both nullable, additive
  # under the standing rule: registration is closed, but the operator's own
  # account predates these columns, so a NOT NULL would break its next write.
  def change
    add_column :users, :residence_status, :string
    add_column :users, :residence_expires_on, :date
  end
end
