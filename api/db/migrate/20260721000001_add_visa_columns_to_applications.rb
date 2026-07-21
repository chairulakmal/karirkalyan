class AddVisaColumnsToApplications < ActiveRecord::Migration[8.1]
  # The per-application half of the visa item (TODO.md v1.9.0). Both columns are
  # additive under the standing rule: the previous image keeps INSERTing into
  # this table, so neither may be NOT NULL without a default.
  #
  # sponsorship is the one column in this table that defaults to a value rather
  # than null: "unknown" is decision-relevant signal (a role whose sponsor
  # status is unknown is a visible risk flag), not missing data, so the default
  # both feeds the previous image's INSERTs and is the value the domain wants.
  # It stays nullable by design and is never tightened to NOT NULL. SPEC.md
  # § Data model and TODO.md's 2.0.0 schema pass both record the exception.
  #
  # status_of_residence is null-means-unrecorded like japanese_level: no default,
  # a value only when a sponsored role's 在留資格 is actually known.
  def change
    add_column :applications, :sponsorship, :string, default: "unknown"
    add_column :applications, :status_of_residence, :string
  end
end
