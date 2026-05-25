class AddFileTimestampsToApplications < ActiveRecord::Migration[8.1]
  def change
    add_column :applications, :resume_updated_at,       :datetime
    add_column :applications, :cover_letter_updated_at, :datetime
  end
end
