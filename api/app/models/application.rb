class Application < ApplicationRecord
  belongs_to :user
  has_many :timeline_entries, dependent: :destroy

  self.locking_column = "lock_version"

  MAX_FILE_SIZE = 1.megabyte

  validates :company, :role, :status, presence: true
  validates :status, inclusion: { in: ->(_) { ApplicationFSM::VALID_STATES } }
  validates :resume,       length: { maximum: MAX_FILE_SIZE, message: "must be under 1 MB" }, allow_nil: true
  validates :cover_letter, length: { maximum: MAX_FILE_SIZE, message: "must be under 1 MB" }, allow_nil: true
  validate :resume_must_be_pdf,       if: -> { resume.present? && will_save_change_to_resume? }
  validate :cover_letter_must_be_pdf, if: -> { cover_letter.present? && will_save_change_to_cover_letter? }

  before_save :touch_resume_timestamp,       if: :will_save_change_to_resume?
  before_save :touch_cover_letter_timestamp, if: :will_save_change_to_cover_letter?

  def as_json(options = {})
    super(options.merge(except: %i[resume cover_letter]))
  end

  private

  PDF_MAGIC_BYTES = "%PDF".b.freeze

  def touch_resume_timestamp
    self.resume_updated_at = Time.current
  end

  def touch_cover_letter_timestamp
    self.cover_letter_updated_at = Time.current
  end

  # The :not_a_pdf symbol (not the prose message) is what API clients receive
  # as the validation_failed detail code — see ErrorRendering.
  def resume_must_be_pdf
    errors.add(:resume, :not_a_pdf, message: "must be a PDF") unless resume.b.start_with?(PDF_MAGIC_BYTES)
  end

  def cover_letter_must_be_pdf
    errors.add(:cover_letter, :not_a_pdf, message: "must be a PDF") unless cover_letter.b.start_with?(PDF_MAGIC_BYTES)
  end
end
