class ApplicationController < ActionController::API
  before_action :authenticate_user!

  rescue_from ApplicationFSM::InvalidTransitionError, with: :render_unprocessable_transition
  rescue_from ActiveRecord::StaleObjectError,          with: :render_conflict

  private

  def render_unprocessable_transition(error)
    render json: { error: error.message }, status: :unprocessable_entity
  end

  def render_conflict
    render json: { error: "Record was modified by another request. Reload and try again." }, status: :conflict
  end
end
