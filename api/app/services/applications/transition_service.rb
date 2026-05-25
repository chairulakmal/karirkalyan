module Applications
  class TransitionService
    def initialize(application:, to:, actor:)
      @application = application
      @to          = to
      @actor       = actor
    end

    def call
      ApplicationFSM.assert_transition!(@application.status, @to)

      ActiveRecord::Base.transaction do
        @application.update!(
          status:     @to,
          applied_at: (@to == "applied" ? Time.current : @application.applied_at)
        )
        @application.timeline_entries.create!(
          actor:       @actor,
          from_status: @application.status_before_last_save,
          to_status:   @to
        )
      end

      @application
    end
  end
end
