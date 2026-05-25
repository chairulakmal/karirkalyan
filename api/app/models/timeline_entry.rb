class TimelineEntry < ApplicationRecord
  belongs_to :application
  belongs_to :actor, class_name: "User"

  validates :from_status, :to_status, presence: true
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
