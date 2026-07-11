# Renders the API's error envelope: { error:, code: } plus optional per-field
# details. `code` is the stable machine-readable identifier web/ keys its
# message catalog on — see SPEC.md § API contract. Codes are append-only:
# renaming or removing one breaks the frontend catalog, adding one does not.
module ErrorRendering
  extend ActiveSupport::Concern

  private

  def render_error(message, code:, status:, details: nil)
    body = { error: message, code: code }
    body[:details] = details if details
    render json: body, status: status
  end

  # 422 envelope for a record whose validations failed. `error` joins
  # full_messages into one sentence (the pre-code contract, kept so nothing
  # breaks); `details` carries the ActiveModel error types (`blank`,
  # `inclusion`, `too_long`, …) so clients can localize per field without
  # parsing the sentence.
  def render_validation_failed(record)
    details = record.errors.details.flat_map do |field, field_errors|
      field_errors.map { |e| { field: field, code: e[:error].to_s } }
    end

    render_error(
      record.errors.full_messages.join(". "),
      code:    "validation_failed",
      status:  :unprocessable_entity,
      details: details
    )
  end
end
