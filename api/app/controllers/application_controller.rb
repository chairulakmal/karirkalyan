class ApplicationController < ActionController::API
  include ErrorRendering

  before_action :authenticate_user!

  rescue_from ApplicationFSM::InvalidTransitionError, with: :render_invalid_transition
  rescue_from ActiveRecord::StaleObjectError,          with: :render_conflict
  rescue_from ActiveRecord::RecordNotFound,            with: :render_not_found

  private

  def render_invalid_transition(error)
    render_error(error.message, code: "invalid_transition", status: :unprocessable_entity)
  end

  def render_conflict
    render_error("Record was modified by another request. Reload and try again.",
                 code: "stale_record", status: :conflict)
  end

  def render_not_found
    render_error("Record not found.", code: "not_found", status: :not_found)
  end
end
