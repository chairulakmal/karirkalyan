class Application < ApplicationRecord
  belongs_to :user
  has_many :timeline_entries, dependent: :destroy

  self.locking_column = "lock_version"

  MAX_FILE_SIZE = 1.megabyte

  DOWNLOAD_KINDS = %i[resume cover_letter].freeze

  # Readable, not load-bearing: the id is what makes a download name unique, so a segment is
  # allowed to be short or to vanish entirely. Counted in codepoints — one per kanji.
  SLUG_MAX_LENGTH = 20

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

  # The one place a downloaded PDF gets its name — both the per-application endpoints and the
  # account archive call this, so a file means the same thing whichever door it left by.
  # See SPEC.md § Download filenames for why each segment is here.
  #
  #   {company}-{role}-{MMDD}-{id}-{kind}.pdf
  #
  # MMDD is the *upload* date, not the application date: the app keeps exactly one resume per
  # application and an upload overwrites it, so the stamp is what stops a re-uploaded resume's
  # download from silently overwriting the copy of the old one already in the downloads folder.
  # It disambiguates rather than guarantees, which is why the id stays.
  def download_basename(kind:)
    raise ArgumentError, "unknown download kind: #{kind.inspect}" unless DOWNLOAD_KINDS.include?(kind)

    stamp = public_send(:"#{kind}_updated_at") || created_at
    segments = [
      self.class.download_slug(company),
      self.class.download_slug(role),
      stamp.strftime("%m%d"),
      id,
      kind.to_s.dasherize
    ]

    # An empty segment is dropped, not placeheld: "unknown" would add fake meaning where the id
    # already carries the truth. company and role are both null: false, so this only fires on an
    # all-punctuation or emoji-only name — worst case "0712-12-resume.pdf", still unique.
    "#{segments.compact_blank.join('-')}.pdf"
  end

  # Sanitize and keep, do not transliterate. parameterize sends a Japanese company name to "",
  # and romanizing it needs a morphological analyzer to even be wrong slowly (日本 is nihon or
  # nippon by context) — while a download filename has no reason to be ASCII in the first place.
  # So: Unicode letters and digits survive with their case, everything else becomes a separator.
  def self.download_slug(value)
    value.to_s
      .unicode_normalize(:nfc)
      .gsub(/[^[[:alnum:]]]+/, "-")
      .gsub(/\A-+|-+\z/, "")
      .first(SLUG_MAX_LENGTH)
      .gsub(/-+\z/, "") # the cap can land mid-separator
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
