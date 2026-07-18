class FollowUpReminderJob < ApplicationJob
  queue_as :default

  # How far back "overdue" reaches. Past this, a forgotten follow-up date is not a
  # reminder, it is archaeology — and resurrecting it as a nudge helps nobody.
  LOOKBACK = 30.days

  def perform
    today = Time.zone.today
    return if hold_for_dead_zone(today)

    reminded = due_on_or_before(today).group_by(&:user).filter_map do |user, applications|
      won = applications.select { |application| claim(application) }
      next if won.empty?

      # Two channels, one claim: the timeline entry above is the exactly-once
      # anchor for both. Each channel is decoupled onto its own job so a
      # failure in one is handled alone — a push-service failure retries the
      # push job (its own declared retry_on), never re-mails, and an SMTP
      # failure retries the mail without re-pushing. The enqueue itself is
      # gated so email-only mode stays genuinely quiet: no VAPID keys, no
      # throwaway job rows (SPEC.md § Push notifications).
      FollowUpMailer.digest(user, won).deliver_later
      PushDigestJob.perform_later(user, won.map(&:id)) if PushVapid.configured?
      [ user, won ]
    end

    Rails.logger.info(
      "[follow_up_reminder] digests=#{reminded.size} applications=#{reminded.sum { |_, won| won.size }}"
    )
  end

  private

  # A reminder that fires on 1 January is noise: nobody is reading it and no company
  # is answering it. Returning early *defers* rather than drops, because the scope
  # below reaches backwards — see #due_on_or_before.
  def hold_for_dead_zone(today)
    reason = JapanCalendar.dead_zone_reason(today)
    return false if reason.nil?

    Rails.logger.info("[follow_up_reminder] held — #{today} is a dead zone (#{reason})")
    true
  end

  # Everything due *by* the end of today (JST), not everything due exactly today.
  #
  # The difference is what makes the dead-zone skip a deferral instead of a deletion:
  # a reminder falling inside Golden Week is held on its own day and then picked up
  # by the next business day's run, because that run still sees it. LOOKBACK bounds
  # how far back that reaching goes.
  def due_on_or_before(today)
    Application
      .includes(:user)
      .where(follow_up_at: (today - LOOKBACK).beginning_of_day..today.end_of_day)
      .where.not(status: ApplicationFSM::TERMINAL_STATES)
      .order(:follow_up_at)
  end

  # Writes the TimelineEntry that *is* the exactly-once guarantee, and reports whether
  # this run won it. Only a winner goes into the digest, so an at-least-once redelivery
  # of the job cannot mail the same reminder twice.
  #
  # The key is keyed on follow_up_at, never on Date.current. That is what lets an
  # overdue application sit in the scope every morning without being nudged every
  # morning — and it means moving follow_up_at re-arms the reminder, which is exactly
  # what a user who moved the date meant.
  def claim(application)
    TimelineEntry.create!(
      application:     application,
      actor:           application.user,
      from_status:     application.status,
      to_status:       application.status,
      note:            "Follow-up reminder",
      idempotency_key: idempotency_key(application)
    )
    true
  rescue ActiveRecord::RecordNotUnique
    # exists?-then-create! isn't atomic: a concurrent run (an overlapping retry) can
    # insert between the check and the create. The unique index on idempotency_key is
    # the real guarantee — losing the race means the reminder is already handled.
    false
  end

  def idempotency_key(application)
    "reminder-#{application.id}-#{application.follow_up_at.in_time_zone.to_date}"
  end
end
