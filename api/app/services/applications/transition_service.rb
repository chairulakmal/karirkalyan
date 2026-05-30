module Applications
  class TransitionService
    def initialize(application:, to:, actor:, note: nil)
      @application = application
      @to          = to
      @actor       = actor
      @note        = note
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
          to_status:   @to,
          note:        @note
        )
      end

      @application
    end
  end
end
