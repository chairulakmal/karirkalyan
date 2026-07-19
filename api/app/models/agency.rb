class Agency < ApplicationRecord
  belongs_to :user
  has_many :applications, dependent: :nullify

  # The first agency to submit a candidate to a company owns that candidacy for
  # roughly 12-18 months, and the fee follows the owner even when the candidate
  # later reaches the company another way. 18 is the conservative end: the
  # ownership warning's one job is to fire while the window *may* still be open.
  # Perishable market fact (researched 2026-07-11); re-confirm yearly, and this
  # constant is the only place the number lives. SPEC.md § Data model.
  OWNERSHIP_WINDOW_MONTHS = 18

  validates :name, presence: true, uniqueness: { scope: :user_id }

  # Find-or-create by (user, name), the only way agency rows come into being:
  # the table is a vocabulary the applications share, not something the user
  # manages on its own page. Exact match after a strip, nothing fuzzier.
  def self.resolve(user:, name:)
    stripped = name.to_s.strip
    return nil if stripped.blank?

    user.agencies.find_or_create_by(name: stripped)
  rescue ActiveRecord::RecordNotUnique
    # The find-or-create race: another request created the row between our find
    # and our create. The row exists now, so the retry is a plain find.
    user.agencies.find_by!(name: stripped)
  end
end
