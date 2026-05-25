module Api
  module V1
    class ApplicationsController < ApplicationController
      before_action :set_application, only: %i[show update destroy transition resume cover_letter]

      def index
        applications = current_user.applications.order(created_at: :desc)
        render json: applications
      end

      def show
        render json: @application.as_json.merge(
          valid_next_states: ApplicationFSM.valid_next_states(@application.status),
          timeline_entries:  @application.timeline_entries.order(created_at: :asc)
        )
      end

      def create
        application = current_user.applications.build(application_params)
        if application.save
          render json: application, status: :created
        else
          render json: { errors: application.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def update
        if @application.update(application_params)
          render json: @application
        else
          render json: { errors: @application.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def destroy
        @application.destroy
        head :no_content
      end

      def transition
        Applications::TransitionService.new(
          application: @application,
          to:          params.require(:status),
          actor:       current_user
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

      def application_params
        attrs = params.require(:application).permit(
          :company, :role, :url, :notes, :follow_up_at, :lock_version
        )
        attrs[:resume]       = params[:application][:resume].read       if params.dig(:application, :resume).respond_to?(:read)
        attrs[:cover_letter] = params[:application][:cover_letter].read if params.dig(:application, :cover_letter).respond_to?(:read)
        attrs
      end
    end
  end
end
