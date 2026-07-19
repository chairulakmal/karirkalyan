class Application < ApplicationRecord
  belongs_to :user
  belongs_to :agency, optional: true
  has_many :timeline_entries, dependent: :destroy

  self.locking_column = "lock_version"

  MAX_FILE_SIZE = 1.megabyte

  # How the application reached the company. Hiring in Japan is heavily
  # agent-mediated, and `agent` is the value the ownership check keys on.
  CHANNELS = %w[direct agent referral].freeze

  # The posting's Japanese requirement, on the market's own taxonomy (TokyoDev
  # and Japan Dev tag every posting with these buckets). What the posting asks,
  # not what the user holds. Null means unrecorded, and there is no filter
  # value for it — `none` is a recorded "no Japanese required".
  JAPANESE_LEVELS = %w[none conversational business n2 n1].freeze

  # The ceiling that bounds storage. A Rack::Attack throttle cannot do this job — it bounds a
  # rate over a window, and every window resets, so any positive rate integrates to unbounded
  # total. 200 x 2 MB of blobs caps the worst case around 400 MB, on a database whose whole
  # backup story is a nightly pg_dump. See SPEC.md § Security.
  MAX_PER_USER = 200

  DOWNLOAD_KINDS = %i[resume cover_letter].freeze

  # Readable, not load-bearing: the id is what makes a download name unique, so a segment is
  # allowed to be short or to vanish entirely. Counted in codepoints — one per kanji.
  SLUG_MAX_LENGTH = 20

  # An agent submission to a company opens an ownership window; the check reads
  # them back per company. SPEC.md § API contract → The ownership check.
  scope :open_ownership_submissions, ->(company) {
    where(company: company, channel: "agent")
      .where(applied_at: Agency::OWNERSHIP_WINDOW_MONTHS.months.ago..)
  }

  validates :company, :role, :status, presence: true
  validates :status, inclusion: { in: ->(_) { ApplicationFSM::VALID_STATES } }
  validates :channel,        inclusion: { in: CHANNELS },        allow_nil: true
  validates :japanese_level, inclusion: { in: JAPANESE_LEVELS }, allow_nil: true
  validates :comp_annual_min_yen, :comp_annual_max_yen,
            numericality: { greater_than: 0, only_integer: true }, allow_nil: true
  validates :comp_months_guaranteed, :comp_months_variable,
            numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
  # The same cap the prefill pipeline truncates extraction at — one constant,
  # owned by the service; this only stops a client persisting past it.
  validates :posting_snapshot,
            length: { maximum: Applications::UrlPrefillService::MAX_TEXT_CHARS },
            allow_nil: true
  validates :resume,       length: { maximum: MAX_FILE_SIZE, message: "must be under 1 MB" }, allow_nil: true
  validates :cover_letter, length: { maximum: MAX_FILE_SIZE, message: "must be under 1 MB" }, allow_nil: true
  validate :resume_must_be_pdf,       if: -> { resume.present? && will_save_change_to_resume? }
  validate :cover_letter_must_be_pdf, if: -> { cover_letter.present? && will_save_change_to_cover_letter? }
  validate :user_within_application_limit, on: :create

  before_save :touch_resume_timestamp,       if: :will_save_change_to_resume?
  before_save :touch_cover_letter_timestamp, if: :will_save_change_to_cover_letter?

  # posting_snapshot is excluded the way the blobs are: index and board fetch
  # every row, and 12k of text per row is blob weight in a text costume.
  # ApplicationsController#show merges it back explicitly.
  def as_json(options = {})
    super(options.merge(except: %i[resume cover_letter posting_snapshot]))
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

  # A bound, not an invariant: this counts in the same transaction as the insert without taking a
  # lock, so concurrent creates at the ceiling can overshoot by the number of them in flight. That
  # is accepted — the cap exists to stop unbounded growth, not to make 200 exact, and a real
  # guarantee costs a counter column and an advisory lock to defend a number chosen by judgement.
  #
  # :base, not a field, because no field is wrong — the account is full. ErrorRendering turns the
  # symbol into the validation_failed detail code, so clients read `too_many_applications`.
  def user_within_application_limit
    return if user.blank?
    return if user.applications.count < MAX_PER_USER

    errors.add(:base, :too_many_applications,
      message: "You have reached the limit of #{MAX_PER_USER} applications. Delete one to add another.")
  end
end
