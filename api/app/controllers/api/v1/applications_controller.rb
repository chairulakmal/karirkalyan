module Api
  module V1
    class ApplicationsController < ApplicationController
      # Raised when an upload exceeds ::Application::MAX_FILE_SIZE, before its body
      # is read into memory. Mapped to the same 422 validation_failed envelope
      # (detail code `too_long`) as the model-level size validation it pre-empts,
      # so clients handle both paths identically.
      class FileTooLargeError < StandardError
        attr_reader :field

        def initialize(field)
          @field = field
          super("#{field.to_s.humanize} must be under 1 MB")
        end
      end

      before_action :set_application, only: %i[show update destroy transition resume cover_letter]
      before_action :set_nosniff_header, only: %i[resume cover_letter]

      rescue_from FileTooLargeError do |error|
        render_error(error.message, code: "validation_failed", status: :unprocessable_entity,
                     details: [ { field: error.field, code: "too_long" } ])
      end

      def index
        page = Applications::ListQuery.new(
          user:    current_user,
          status:  params[:status],
          company: params[:company],
          source:  params[:source],
          after:   params[:after],
          limit:   params[:limit]
        ).call

        render json: {
          data: page[:records],
          meta: { next_cursor: page[:next_cursor], has_more: page[:has_more] }
        }
      end

      # POST /api/v1/applications/prefill — extracts company/role/notes from a
      # pasted job-posting URL via Claude. Returns the fields for the user to
      # review and edit in the new-application form; nothing is persisted here.
      def prefill
        fields = Applications::UrlPrefillService.new(params[:url]).call
        render json: fields
      # Order matters twice over: BlockedError subclasses FetchError, and every
      # class here subclasses Error. The base-class rescue stays last and now
      # means only what it says — InvalidUrlError, the URL itself being the
      # problem. It used to catch FetchError as well, which told users who had
      # pasted a perfectly good URL that their URL was malformed.
      rescue Applications::UrlPrefillService::ConfigError => e
        render_error(e.message, code: "prefill_unavailable", status: :service_unavailable)
      rescue Applications::UrlPrefillService::UnreadableError,
             Applications::UrlPrefillService::ExtractionError => e
        render_error(e.message, code: "prefill_failed", status: :bad_gateway)
      rescue Applications::UrlPrefillService::BlockedError => e
        render_error(e.message, code: "prefill_blocked", status: :unprocessable_entity)
      rescue Applications::UrlPrefillService::FetchError => e
        render_error(e.message, code: "prefill_unreachable", status: :bad_gateway)
      rescue Applications::UrlPrefillService::Error => e
        render_error(e.message, code: "invalid_url", status: :unprocessable_entity)
      end

      def show
        render json: @application.as_json.merge(
          valid_next_states: ApplicationFSM.valid_next_states(@application.status),
          timeline_entries:  @application.timeline_entries.order(created_at: :asc)
        )
      end

      def create
        application = current_user.applications.build(application_params)
        apply_initial_status(application)

        if application.errors.any? || !application.save
          return render_validation_failed(application)
        end

        render json: application, status: :created
      end

      def update
        if @application.update(application_params)
          render json: @application
        else
          render_validation_failed(@application)
        end
      end

      def destroy
        @application.destroy
        head :no_content
      end

      def transition
        @application.lock_version = params[:lock_version] if params.key?(:lock_version)
        Applications::TransitionService.new(
          application: @application,
          to:          params.require(:status),
          actor:       current_user,
          note:        params[:note].presence
        ).call
        render json: @application.reload.as_json.merge(
          valid_next_states: ApplicationFSM.valid_next_states(@application.status)
        )
      end

      def resume
        return head :not_found unless @application.resume.present?

        send_data @application.resume,
          filename:    "resume.pdf",
          type:        "application/pdf",
          disposition: "inline"
      end

      def cover_letter
        return head :not_found unless @application.cover_letter.present?

        send_data @application.cover_letter,
          filename:    "cover_letter.pdf",
          type:        "application/pdf",
          disposition: "inline"
      end

      private

      def set_application
        @application = current_user.applications.find(params[:id])
      end

      def set_nosniff_header
        response.headers["X-Content-Type-Options"] = "nosniff"
      end

      def application_params
        attrs = params.require(:application).permit(
          :company, :role, :url, :notes, :follow_up_at, :lock_version
        )
        attrs[:resume]       = read_upload(:resume)       if params.dig(:application, :resume).respond_to?(:read)
        attrs[:cover_letter] = read_upload(:cover_letter) if params.dig(:application, :cover_letter).respond_to?(:read)
        attrs
      end

      # Reads an uploaded file into memory, but only after confirming its size is
      # within the model's limit. Checking `.size` (cheap, from the multipart
      # metadata) before `.read` stops an attacker from forcing us to buffer an
      # arbitrarily large body just to have the model reject it afterwards.
      def read_upload(field)
        upload = params[:application][field]

        if upload.respond_to?(:size) && upload.size > ::Application::MAX_FILE_SIZE
          raise FileTooLargeError, field
        end

        upload.read
      end

      # Creation sets the initial state (the FSM only governs later transitions).
      # `status` is restricted to the curated entry set — `status` is never mass-
      # assignable, so a client can't POST its way straight to "offer". When the
      # entry state is "applied", record the real applied date (defaults to now)
      # so the dashboard's apply→response/offer timing stays honest for jobs
      # added after the fact.
      def apply_initial_status(application)
        requested = params.dig(:application, :status).presence || "draft"

        unless ApplicationFSM::ENTRY_STATES.include?(requested)
          application.errors.add(:status, :inclusion,
            message: "must be one of: #{ApplicationFSM::ENTRY_STATES.join(', ')}")
          return
        end

        application.status = requested
        application.applied_at = requested_applied_at || Time.current if requested == "applied"
      end

      def requested_applied_at
        raw = params.dig(:application, :applied_at).presence
        raw && Time.zone.parse(raw.to_s)
      rescue ArgumentError
        nil
      end
    end
  end
end
