module Applications
  # One page of a user's applications, filtered and cursor-paginated.
  #
  # Backs `GET /api/v1/applications` and nothing else — the controller renders
  # what this returns into the `{ data, meta }` envelope and does no other work.
  # See SPEC.md § Applications::ListQuery for why a read path this ordinary owns
  # an object: the filters are the growth axis, and they all land here.
  #
  # Every param is nil-tolerant, and bad input is ignored rather than rejected —
  # an unknown status, a malformed cursor and a junk limit each fall back to the
  # unfiltered first page. These arrive from navigation (a stale bookmark, a
  # hand-edited URL), not from a form, so a 422 would be the wrong answer.
  class ListQuery
    DEFAULT_LIMIT = 10
    MIN_LIMIT     = 1
    MAX_LIMIT     = 100

    def initialize(user:, status: nil, company: nil, source: nil, after: nil, limit: nil)
      @user    = user
      @status  = status
      @company = company
      @source  = source
      @after   = after
      @limit   = limit
    end

    # => { records: [Application], next_cursor: String | nil, has_more: Boolean }
    def call
      # One row past the page: the cheapest way to know whether a next page
      # exists without a second COUNT over the whole filtered set.
      records  = scope.limit(limit + 1).to_a
      has_more = records.size > limit
      records  = records.first(limit)

      {
        records:     records,
        next_cursor: has_more ? encode_cursor(records.last) : nil,
        has_more:    has_more
      }
    end

    private

    attr_reader :user, :status, :company, :source, :after

    def scope
      relation = user.applications.order(created_at: :desc)
      relation = filter_by_status(relation)
      relation = filter_by_company(relation)
      relation = filter_by_source(relation)
      filter_by_cursor(relation)
    end

    def filter_by_status(relation)
      return relation if status.blank? || ApplicationFSM::VALID_STATES.exclude?(status)

      relation.where(status: status)
    end

    def filter_by_company(relation)
      return relation if company.blank?

      relation.where(company: company)
    end

    # Crude "job board" filter: match the URL host as a substring. There is no
    # `source` column (SPEC.md § JobBoard); the NONE sentinel selects
    # applications added without a link.
    def filter_by_source(relation)
      return relation if source.blank?
      return relation.where("url IS NULL OR url = ''") if source == JobBoard::NONE

      like = "%#{ActiveRecord::Base.sanitize_sql_like(source)}%"
      relation.where("url ILIKE ?", like)
    end

    def filter_by_cursor(relation)
      cursor_time = decode_cursor
      return relation if cursor_time.nil?

      relation.where("created_at < ?", cursor_time)
    end

    # The cursor is a Base64 `created_at` in ISO-8601 with microseconds — the
    # precision matters, since the sort key is `created_at` and a truncated
    # second could skip or repeat rows created inside the same one.
    def decode_cursor
      return nil if after.blank?

      Time.zone.parse(Base64.urlsafe_decode64(after))
    rescue ArgumentError
      # Malformed cursor — ignore it and return the first page.
      nil
    end

    def encode_cursor(record)
      Base64.urlsafe_encode64(record.created_at.iso8601(6))
    end

    def limit
      @clamped_limit ||= (@limit.presence || DEFAULT_LIMIT).to_i.clamp(MIN_LIMIT, MAX_LIMIT)
    end
  end
end
