# The single place that knows what a business day in Japan is. FollowUpReminderJob
# asks it one question — "will a company answer a nudge sent today?" — and stays
# silent when the answer is no.
#
# The `holidays` gem carries the national holidays rather than a hardcoded array,
# because two of them are astronomical: 春分の日 and 秋分の日 move with the equinoxes
# and are fixed by cabinet proclamation each February. 振替休日 (a holiday landing on
# a Sunday displaces the following Monday) is likewise a rule, not a date — the
# :observed flag below is what turns it on. Both are what a hand-maintained list
# gets quietly wrong in a year nobody is looking.
#
# The three spans below are NOT public holidays and the gem does not know them.
# Golden Week is a run of real holidays with working days wedged between; Obon has
# no legal status at all. They are here anyway because the question is about a
# company answering, not about the post office being open — and in mid-August, it
# will not.
module JapanCalendar
  # (month, day) → (month, day), inclusive. New Year wraps the year boundary, so it
  # is two spans rather than one.
  DEAD_ZONES = [
    { name: :new_year,    from: [ 12, 29 ], to: [ 12, 31 ] },
    { name: :new_year,    from: [ 1, 1 ],   to: [ 1, 3 ] },
    { name: :golden_week, from: [ 4, 29 ],  to: [ 5, 5 ] },
    { name: :obon,        from: [ 8, 13 ],  to: [ 8, 16 ] }
  ].freeze

  # True when a company would plausibly read and answer a follow-up sent on `date`.
  def self.business_day?(date)
    !weekend?(date) && !national_holiday?(date) && !seasonal_dead_zone?(date)
  end

  # How many business days of silence separate `from` and `to`: the number of
  # days on which a company could actually have replied. GhostRiskQuery measures
  # against this rather than against calendar days, so that the same dead zones
  # FollowUpReminderJob refuses to send into do not also count as being ignored.
  #
  # Exclusive of `from` and inclusive of `to`, so an application that entered a
  # stage today has nothing to answer for yet, and one that entered on Friday is
  # owed one business day by Monday.
  #
  # It walks the span a day at a time, because the seasonal spans above are this
  # module's own invention and no arithmetic on weekday numbers knows about
  # them. What it must not do is call business_day? per day: that asks the gem
  # about a single date, which is right for the one question
  # FollowUpReminderJob asks and one gem call per day here. The worst case is
  # reachable, since MAX_PER_USER allows 200 applications and one forgotten in
  # `applied` is precisely what this feature exists to catch: 200 of them silent
  # for three years measured 13.7s that way, against 0.7s with a single
  # Holidays.between per span.
  #
  # Both ends are read in the app's zone before being reduced to dates: they
  # arrive as UTC timestamps from Postgres, and a UTC date is the wrong day for
  # nine hours out of every twenty-four.
  def self.business_days_between(from, to)
    return 0 if from.blank? || to.blank?

    from = from.in_time_zone.to_date
    to   = to.in_time_zone.to_date
    return 0 if to <= from

    span     = (from + 1)..to
    holidays = national_holidays_in(span)

    span.count { |date| !weekend?(date) && !holidays.include?(date) && !seasonal_dead_zone?(date) }
  end

  # Every Japanese national holiday in the span, as a Set, in one gem call.
  def self.national_holidays_in(span)
    Holidays.between(span.first, span.last, :jp, :observed).map { |holiday| holiday[:date] }.to_set
  end
  private_class_method :national_holidays_in

  # Why the job held its fire, for the log line. nil when `date` is a business day.
  def self.dead_zone_reason(date)
    return :weekend if weekend?(date)
    return :national_holiday if national_holiday?(date)

    seasonal_dead_zone(date)&.fetch(:name)
  end

  def self.weekend?(date)
    date.saturday? || date.sunday?
  end

  def self.national_holiday?(date)
    Holidays.on(date, :jp, :observed).any?
  end

  def self.seasonal_dead_zone?(date)
    seasonal_dead_zone(date).present?
  end

  # Compared as month*100 + day integers rather than by building two Dates per
  # zone per call. This is only correct because no span above wraps the year
  # boundary: New Year is deliberately stored as two spans for exactly that
  # reason. Called once per day of every span measured, so the allocations it
  # avoids are the ones that actually added up.
  def self.seasonal_dead_zone(date)
    key = month_day(date.month, date.day)

    DEAD_ZONES.find { |zone| month_day(*zone[:from]) <= key && key <= month_day(*zone[:to]) }
  end
  private_class_method :seasonal_dead_zone

  def self.month_day(month, day) = (month * 100) + day
  private_class_method :month_day
end
