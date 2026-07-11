module Applications
  # Which applications has the user probably been ghosted on?
  #
  # Reconstructs how long each application sat in each stage from the audit trail
  # already in `timeline_entries` — no new column, no new table. See SPEC.md
  # § Query layer for the reasoning behind every constant below; the short version
  # is that all three guards exist because a p90 over four data points is a rumour,
  # not a statistic.
  class GhostRiskQuery
    # The stages where the next move belongs to the company, so silence means
    # something. Nowhere else does a lack of movement imply a lack of interest.
    RISK_STAGES = %w[applied phone_screen].freeze

    # Exits that are NOT the company responding, and so must not enter the sample.
    # `ghosted` above all: folding it in would let every ghosting the user records
    # raise their own threshold, and the predictor would talk itself out of ever
    # predicting again.
    NO_RESPONSE_EXITS = %w[ghosted withdrawn archived].freeze

    PERCENTILE   = 0.9
    MIN_SAMPLE   = 5
    DEFAULT_P90  = { "applied" => 21.0, "phone_screen" => 14.0 }.freeze
    FLOOR_DAYS   = 7.0
    CEILING_DAYS = 90.0

    def initialize(user:)
      @user = user
    end

    def call
      stats        = response_time_stats
      thresholds   = {}
      basis        = {}
      sample_sizes = {}

      RISK_STAGES.each do |stage|
        sample   = stats[stage]
        size     = sample ? sample[:sample_size] : 0
        personal = size >= MIN_SAMPLE && sample[:p90].present?

        thresholds[stage]   = personal ? sample[:p90].clamp(FLOOR_DAYS, CEILING_DAYS).round(1)
                                       : DEFAULT_P90.fetch(stage)
        basis[stage]        = personal ? "personal" : "default"
        sample_sizes[stage] = size
      end

      at_risk = in_flight
        .select { |row| row[:days_in_stage] > thresholds.fetch(row[:status]) }
        .sort_by { |row| -row[:days_in_stage] }
        .map { |row| row.merge(threshold: thresholds.fetch(row[:status])) }

      {
        thresholds:   thresholds,
        basis:        basis,
        sample_sizes: sample_sizes,
        at_risk:      at_risk
      }
    end

    private

    attr_reader :user

    # How long the user's applications have historically sat in each risk stage
    # *before the company came back to them*.
    #
    # Each timeline row is read as an EXIT from `from_status`, never as an entry
    # into `to_status`. Creation writes no timeline row, so an application added
    # straight as `applied` — the common case — has no `to_status = 'applied'` row
    # to anchor on; reading rows as exits and taking the entry moment from LAG (or,
    # for the first exit, the application's own start) is the only formulation that
    # sees those. It also makes backdated `applied_at` and `ghosted → applied`
    # revivals fall out correctly rather than needing special cases.
    def response_time_stats
      sql = <<~SQL.squish
        WITH stage_exits AS (
          SELECT
            te.from_status AS stage,
            te.to_status   AS exit_to,
            te.created_at  AS exited_at,
            COALESCE(
              LAG(te.created_at) OVER (PARTITION BY te.application_id ORDER BY te.created_at),
              a.applied_at,
              a.created_at
            ) AS entered_at
          FROM timeline_entries te
          INNER JOIN applications a ON a.id = te.application_id
          WHERE a.user_id = :user_id
        )
        SELECT
          stage,
          COUNT(*) AS sample_size,
          percentile_cont(:percentile) WITHIN GROUP (
            ORDER BY EXTRACT(epoch FROM (exited_at - entered_at)) / 86400.0
          ) AS p90
        FROM stage_exits
        WHERE stage IN (:stages)
          AND exit_to NOT IN (:no_response)
          AND exited_at > entered_at
        GROUP BY stage
      SQL

      rows = select_all(sql, percentile: PERCENTILE, stages: RISK_STAGES,
                             no_response: NO_RESPONSE_EXITS)

      rows.each_with_object({}) do |row, acc|
        acc[row["stage"]] = {
          sample_size: row["sample_size"].to_i,
          p90:         row["p90"]&.to_f
        }
      end
    end

    # Applications sitting in a risk stage right now, and for how long. Symmetric
    # with the historical query: the stage was entered at the last transition, or —
    # if there has never been one — at the application's own start.
    #
    # "Now" is bound from Ruby rather than SQL's now(). The app's clock is the one
    # that decides what "today" means everywhere else (the reminder job, the cache
    # key), and a query whose answer depends on the database's clock instead is
    # both a second source of time and untestable with travel_to.
    def in_flight
      sql = <<~SQL.squish
        SELECT
          a.id, a.company, a.role, a.status, a.lock_version,
          EXTRACT(epoch FROM (
            :now - COALESCE(
              (SELECT MAX(te.created_at) FROM timeline_entries te WHERE te.application_id = a.id),
              a.applied_at,
              a.created_at
            )
          )) / 86400.0 AS days_in_stage
        FROM applications a
        WHERE a.user_id = :user_id
          AND a.status IN (:stages)
      SQL

      select_all(sql, stages: RISK_STAGES, now: Time.current).map do |row|
        {
          id:            row["id"],
          company:       row["company"],
          role:          row["role"],
          status:        row["status"],
          lock_version:  row["lock_version"],
          days_in_stage: row["days_in_stage"].to_f.round(1)
        }
      end
    end

    def select_all(sql, **binds)
      ActiveRecord::Base.connection.select_all(
        ActiveRecord::Base.sanitize_sql_array([ sql, { user_id: user.id, **binds } ])
      ).to_a
    end
  end
end
