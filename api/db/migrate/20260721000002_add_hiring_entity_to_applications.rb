class AddHiringEntityToApplications < ActiveRecord::Migration[8.1]
  # The hiring-entity item (TODO.md v1.9.0): how a Japan-resident hire is
  # actually employed, the filter that silently kills most global-remote
  # applications from Japan. A four-value enum (own_entity / eor / contractor /
  # unsupported), null-means-unrecorded like japanese_level, and additive under
  # the standing rule: the previous image keeps INSERTing here, so no default and
  # no NOT NULL. SPEC.md § Data model.
  def change
    add_column :applications, :hiring_entity, :string
  end
end
