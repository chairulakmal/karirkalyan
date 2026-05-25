# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_05_25_000005) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pgcrypto"

  create_table "applications", force: :cascade do |t|
    t.datetime "applied_at"
    t.string "company", null: false
    t.binary "cover_letter"
    t.datetime "cover_letter_updated_at"
    t.datetime "created_at", null: false
    t.datetime "follow_up_at"
    t.integer "lock_version", default: 0, null: false
    t.text "notes"
    t.binary "resume"
    t.datetime "resume_updated_at"
    t.string "role", null: false
    t.string "status", default: "draft", null: false
    t.datetime "updated_at", null: false
    t.string "url"
    t.bigint "user_id", null: false
    t.index ["follow_up_at"], name: "index_applications_on_follow_up_at"
    t.index ["status"], name: "index_applications_on_status"
    t.index ["user_id"], name: "index_applications_on_user_id"
  end

  create_table "timeline_entries", force: :cascade do |t|
    t.bigint "actor_id", null: false
    t.bigint "application_id", null: false
    t.datetime "created_at", null: false
    t.string "from_status", null: false
    t.string "idempotency_key"
    t.text "note"
    t.string "to_status", null: false
    t.datetime "updated_at", null: false
    t.index ["actor_id"], name: "index_timeline_entries_on_actor_id"
    t.index ["application_id"], name: "index_timeline_entries_on_application_id"
    t.index ["idempotency_key"], name: "index_timeline_entries_on_idempotency_key", unique: true
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "jti", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["jti"], name: "index_users_on_jti", unique: true
  end

  add_foreign_key "applications", "users"
  add_foreign_key "timeline_entries", "applications"
  add_foreign_key "timeline_entries", "users", column: "actor_id"
end
