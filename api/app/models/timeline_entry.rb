class TimelineEntry < ApplicationRecord
  # `note` is a `text` column with no database ceiling, and the FSM permits an
  # unbounded transition cycle (applied -> rejected -> applied -> ...), so before
  # this cap one authenticated caller could write rows of arbitrary size forever.
  # The rate is bounded in rack_attack.rb; this is the other half, and it has to
  # exist separately for the reason Application::MAX_PER_USER already records: a
  # throttle bounds a rate over a window, every window resets, and any positive
  # rate integrates to an unbounded total.
  #
  # 2,000 characters is far above the transition notes this field was built for
  # (a sentence about why a stage moved) and well under anything that threatens
  # the row. The web textareas carry the same number as `maxLength`, so a user
  # meets the limit as a stop rather than as a 422.
  NOTE_MAX_LENGTH = 2_000

  belongs_to :application
  belongs_to :actor, class_name: "User"

  validates :from_status, :to_status, presence: true
  validates :note, length: { maximum: NOTE_MAX_LENGTH }, allow_nil: true
  validate :transition_must_be_valid

  private

  # System-generated reminder entries write from == to (status unchanged) and
  # carry an idempotency_key. They legitimately bypass FSM transition rules;
  # user-triggered entries (via TransitionService) always have a non-blank
  # idempotency_key field of nil and must pass FSM validation.
  def transition_must_be_valid
    return if idempotency_key.present?
    return if from_status.blank? || to_status.blank?

    ApplicationFSM.assert_transition!(from_status, to_status)
  rescue ApplicationFSM::InvalidTransitionError => e
    errors.add(:base, e.message)
  end
end
