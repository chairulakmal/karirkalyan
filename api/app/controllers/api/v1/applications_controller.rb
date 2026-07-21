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

      before_action :set_application, only: %i[show update destroy transition resume cover_letter interview_calendar talking_points]
      before_action :set_nosniff_header, only: %i[resume cover_letter]

      rescue_from FileTooLargeError do |error|
        render_error(error.message, code: "validation_failed", status: :unprocessable_entity,
                     details: [ { field: error.field, code: "too_long" } ])
      end

      def index
        page = Applications::ListQuery.new(
          user:           current_user,
          status:         params[:status],
          company:        params[:company],
          source:         params[:source],
          japanese_level: params[:japanese_level],
          after:          params[:after],
          limit:          params[:limit]
        ).call

        render json: {
          data: page[:records].map { |record| index_row(record) },
          meta: { next_cursor: page[:next_cursor], has_more: page[:has_more] }
        }
      end

      # POST /api/v1/applications/prefill — extracts company/role/notes from a job
      # posting via Claude. Returns the fields for the user to review and edit in
      # the new-application form; nothing is persisted here.
      #
      # Takes `url` (fetch it) or `text` (the user pasted it, because the fetch was
      # refused or found no posting). The service prefers `text` when both arrive —
      # nobody pastes a posting whose URL already worked.
      def prefill
        # `text` is only a paste if it is a string. A JSON object arrives as
        # ActionController::Parameters, whose #to_s is a hash inspection — which is
        # `present?`, so it would sail past the paste branch and be billed to us as
        # a Claude call on garbage. `url` needs no such guard: anything that isn't a
        # URL dies in validated_uri. This one has no backstop, so it gets one here.
        text   = params[:text].is_a?(String) ? params[:text] : nil
        fields = Applications::UrlPrefillService.new(params[:url], text: text).call
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
      rescue Applications::UrlPrefillService::PasteTooLongError => e
        render_error(e.message, code: "prefill_paste_too_long", status: :unprocessable_entity)
      rescue Applications::UrlPrefillService::FetchError => e
        render_error(e.message, code: "prefill_unreachable", status: :bad_gateway)
      rescue Applications::UrlPrefillService::Error => e
        render_error(e.message, code: "invalid_url", status: :unprocessable_entity)
      end

      def show
        # agency_name and posting_snapshot are merged here and only here: the
        # name saves the client re-deriving a row it cannot see, and the
        # snapshot is excluded from as_json so index rows stay lean.
        render json: @application.as_json.merge(
          valid_next_states: ApplicationFSM.valid_next_states(@application.status),
          timeline_entries:  @application.timeline_entries.order(created_at: :asc),
          agency_name:       @application.agency&.name,
          posting_snapshot:  @application.posting_snapshot,
          days_in_stage:     days_in_stage(@application)
        )
      end

      # GET /api/v1/applications/ownership_check?company=… : does an agency
      # already have an open ownership window on this company? A warning
      # surface only: nothing here blocks a create, the FSM has no opinion.
      # Blank company is an empty list, not a 422, because the form calls this as the
      # user works. SPEC.md § API contract → The ownership check.
      def ownership_check
        submissions = current_user.applications
          .open_ownership_submissions(params[:company].to_s.strip.presence)
          .includes(:agency)
          .order(applied_at: :desc)

        render json: {
          window_months: Agency::OWNERSHIP_WINDOW_MONTHS,
          submissions: submissions.map do |application|
            {
              id:            application.id,
              agency_name:   application.agency&.name,
              submitted_at:  application.applied_at,
              window_ends_on: (application.applied_at + Agency::OWNERSHIP_WINDOW_MONTHS.months).to_date
            }
          end
        }
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
          filename:    @application.download_basename(kind: :resume),
          type:        "application/pdf",
          disposition: "inline"
      end

      def cover_letter
        return head :not_found unless @application.cover_letter.present?

        send_data @application.cover_letter,
          filename:    @application.download_basename(kind: :cover_letter),
          type:        "application/pdf",
          disposition: "inline"
      end

      # The interview .ics. 404 when nothing is scheduled: the service returns
      # nil for a blank interview_at, and an empty calendar is not a file worth
      # handing back.
      def interview_calendar
        calendar = Exports::InterviewCalendar.new(@application)
        ics = calendar.call
        return head :not_found if ics.nil?

        send_data ics,
          filename:    calendar.filename,
          type:        "text/calendar; charset=utf-8",
          disposition: "attachment"
      end

      # Cover-letter talking points: match points between the resume and the
      # posting, generated on demand and not persisted. The error taxonomy is
      # small: the input is missing, the AI is off, or it returned nothing.
      def talking_points
        points = Applications::TalkingPointsService.new(@application).call
        render json: { points: points }
      rescue Applications::TalkingPointsService::ConfigError => e
        render_error(e.message, code: "talking_points_unavailable", status: :service_unavailable)
      rescue Applications::TalkingPointsService::MissingInputError
        render_error("Add a resume and save the posting text first.",
          code: "talking_points_missing_input", status: :unprocessable_entity)
      rescue Applications::TalkingPointsService::Error => e
        render_error(e.message, code: "talking_points_failed", status: :bad_gateway)
      end

      private

      # The board's triage cards need "how long has this sat here". `source` now
      # rides as_json; only `days_in_stage` is added here, from the query's
      # batched `last_stage_at` anchor (dropped from the payload, which speaks in
      # days). The anchor is the last stage change, or applied_at, or creation
      # (not updated_at, which any edit bumps).
      def index_row(record)
        record.as_json.except("last_stage_at").merge("days_in_stage" => days_in_stage(record))
      end

      # Two call sites, one meaning. On the index the anchor is the SELECTed
      # `last_stage_at` (one SQL statement for the whole page). On #show there is
      # a single record, so a fresh MAX is fine and avoids threading the select
      # through that path.
      def days_in_stage(record)
        anchor =
          if record.has_attribute?(:last_stage_at)
            record.read_attribute(:last_stage_at)
          else
            record.timeline_entries.maximum(:created_at) || record.applied_at || record.created_at
          end
        return nil if anchor.blank?

        # An AR-typed column yields a Time; the SELECT alias can come back as a
        # naive string, which is stored UTC and must be parsed as UTC (not the
        # app's Tokyo zone, which would shift it nine hours and could flip the
        # floored day count at a boundary).
        anchor = anchor.is_a?(Time) ? anchor : Time.find_zone("UTC").parse(anchor.to_s)
        ((Time.current - anchor) / 1.day).floor
      end

      def set_application
        @application = current_user.applications.find(params[:id])
      end

      def set_nosniff_header
        response.headers["X-Content-Type-Options"] = "nosniff"
      end

      def application_params
        attrs = params.require(:application).permit(
          :company, :role, :url, :notes, :follow_up_at, :lock_version,
          :channel, :japanese_level, :sponsorship, :status_of_residence, :hiring_entity,
          :company_timezone, :overlap_hours_required, :interview_at, :posting_snapshot,
          :comp_annual_min_yen, :comp_annual_max_yen,
          :comp_months_guaranteed, :comp_months_variable
        )
        attrs[:resume]       = read_upload(:resume)       if params.dig(:application, :resume).respond_to?(:read)
        attrs[:cover_letter] = read_upload(:cover_letter) if params.dig(:application, :cover_letter).respond_to?(:read)

        # The agency arrives as a name, never an id: the client cannot know row
        # ids for a vocabulary that is created lazily. Only touched when the key
        # is present, so updates that don't carry it leave the agency alone; a
        # blank name clears it.
        if params[:application].key?(:agency_name)
          attrs[:agency] = Agency.resolve(user: current_user, name: params.dig(:application, :agency_name))
        end

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
