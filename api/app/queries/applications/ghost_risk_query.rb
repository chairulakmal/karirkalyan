module Applications
  # Which applications has the user probably been ghosted on?
  #
  # Reconstructs how long each in-flight application has sat in its current
  # stage from the audit trail already in `timeline_entries` (no new column, no
  # new table) and compares that against a fixed per-stage threshold. See
  # SPEC.md § Query layer for the reasoning behind every constant below.
  #
  # The one thing to know before reading: silence is counted in **business
  # days**. The question this asks is whether a company has gone quiet, and a
  # company that is closed has not. JapanCalendar already owns that judgement
  # for FollowUpReminderJob, which refuses to send into the same dead zones.
  class GhostRiskQuery
    # The stages where the next move belongs to the company, so silence means
    # something. Nowhere else does a lack of movement imply a lack of interest.
    RISK_STAGES = %w[applied phone_screen].freeze

    # Business days of silence past which an application is probably dead.
    # Fixed, and the user's own response-time percentile no longer competes with
    # them: SPEC.md § Applications::GhostRiskQuery carries why the derived
    # threshold was removed. In a week without holidays these are three weeks
    # and two weeks; across Golden Week or the New Year they stretch, which is
    # the entire point of counting this way.
    THRESHOLDS = { "applied" => 15, "phone_screen" => 10 }.freeze

    def initialize(user:)
      @user = user
    end

    def call
      at_risk = in_flight
        .select { |row| row[:business_days_in_stage] > THRESHOLDS.fetch(row[:status]) }
        .sort_by { |row| -row[:business_days_in_stage] }
        .map { |row| row.merge(threshold: THRESHOLDS.fetch(row[:status])) }

      { thresholds: THRESHOLDS, at_risk: at_risk }
    end

    private

    attr_reader :user

    # Applications sitting in a risk stage right now, and when they got there.
    #
    # The stage was entered at the last transition, or, if there has never been
    # one, at the application's own start. Creation writes no timeline row, so
    # an application added straight as `applied` (the common case) has no
    # `to_status = 'applied'` row to anchor on, and the COALESCE is what sees
    # those. It also makes a backdated `applied_at` date the silence from the
    # real application date rather than from the day the row was typed in.
    #
    # "Now" is bound from Ruby rather than SQL's now(). The app's clock is the
    # one that decides what "today" means everywhere else (the reminder job, the
    # cache key), and a query whose answer depends on the database's clock
    # instead is both a second source of time and untestable with travel_to.
    #
    # The elapsed-time arithmetic itself is deliberately *not* in SQL any more:
    # the holiday rules live in a Ruby gem and the seasonal dead zones live in
    # JapanCalendar, so Postgres cannot answer this question. It costs one row
    # per in-flight application, which at personal-tracker scale is tens.
    def in_flight
      sql = <<~SQL.squish
        SELECT
          a.id, a.company, a.role, a.status, a.lock_version,
          COALESCE(
            (SELECT MAX(te.created_at) FROM timeline_entries te WHERE te.application_id = a.id),
            a.applied_at,
            a.created_at
          ) AS entered_at
        FROM applications a
        WHERE a.user_id = :user_id
          AND a.status IN (:stages)
      SQL

      now = Time.current

      select_all(sql, stages: RISK_STAGES).map do |row|
        {
          id:           row["id"],
          company:      row["company"],
          role:         row["role"],
          status:       row["status"],
          lock_version: row["lock_version"],
          business_days_in_stage: JapanCalendar.business_days_between(row["entered_at"], now)
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
