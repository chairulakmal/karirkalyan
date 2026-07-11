module Api
  module V1
    # Read-only view of the FSM for clients that must know which transitions
    # are legal before attempting one — the Kanban board's drag targets. This
    # is the *effective* table, not the raw TRANSITIONS constant: mapping every
    # state through valid_next_states folds in the any-non-terminal → archived
    # rule, which lives in assert_transition!'s early return rather than in a
    # TRANSITIONS row. See SPEC.md § API contract.
    class TransitionsController < ApplicationController
      def index
        render json: {
          states:          ApplicationFSM::VALID_STATES,
          entry_states:    ApplicationFSM::ENTRY_STATES,
          terminal_states: ApplicationFSM::TERMINAL_STATES,
          transitions:     ApplicationFSM::VALID_STATES.index_with { |state| ApplicationFSM.valid_next_states(state) }
        }
      end
    end
  end
end
