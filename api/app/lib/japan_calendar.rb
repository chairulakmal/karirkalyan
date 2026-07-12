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

  def self.seasonal_dead_zone(date)
    DEAD_ZONES.find do |zone|
      from = Date.new(date.year, *zone[:from])
      to   = Date.new(date.year, *zone[:to])
      date.between?(from, to)
    end
  end
  private_class_method :seasonal_dead_zone
end
