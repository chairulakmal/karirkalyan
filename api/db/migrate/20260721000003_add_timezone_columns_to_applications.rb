class AddTimezoneColumnsToApplications < ActiveRecord::Migration[8.1]
  # The timezone-overlap item (TODO.md v1.9.0): is a remote role survivable from
  # JST? company_timezone is an IANA zone identifier (a curated enum in the
  # model), overlap_hours_required is the daily overlap the role demands. Both
  # null-means-unrecorded, additive under the standing rule: the previous image
  # keeps INSERTing here, so no default and no NOT NULL. SPEC.md § Data model.
  def change
    add_column :applications, :company_timezone, :string
    add_column :applications, :overlap_hours_required, :float
  end
end
