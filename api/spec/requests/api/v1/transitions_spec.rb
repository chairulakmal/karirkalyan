require "swagger_helper"

RSpec.describe "Transitions", type: :request do
  let(:user) { create(:user) }

  path "/api/v1/transitions" do
    get "Get the FSM's effective transition table" do
      tags "Transitions"
      security [ bearerAuth: [] ]
      produces "application/json"
      description "The legal status transitions, derived server-side from the FSM. " \
                  "`transitions` maps every state to its valid next states with the " \
                  "archived rule folded in; terminal states map to an empty array. " \
                  "Clients consume this at runtime instead of hardcoding the table."

      response "200", "the effective transition table" do
        let(:Authorization) { jwt_for(user) }

        # Expectations are derived from ApplicationFSM, never written out —
        # TRANSITIONS has exactly one copy, and it is not in this file.
        run_test! do |response|
          body = JSON.parse(response.body)

          expect(body["states"]).to          eq(ApplicationFSM::VALID_STATES)
          expect(body["entry_states"]).to    eq(ApplicationFSM::ENTRY_STATES)
          expect(body["terminal_states"]).to eq(ApplicationFSM::TERMINAL_STATES)

          expect(body["transitions"]).to eq(
            ApplicationFSM::VALID_STATES.index_with { |state| ApplicationFSM.valid_next_states(state) }
          )

          # The two properties a board client leans on: terminal states are
          # dead ends, and non-terminal states can always be archived.
          ApplicationFSM::TERMINAL_STATES.each do |state|
            expect(body["transitions"][state]).to eq([])
          end
          (ApplicationFSM::VALID_STATES - ApplicationFSM::TERMINAL_STATES).each do |state|
            expect(body["transitions"][state]).to include("archived")
          end
        end
      end

      response "401", "not authenticated" do
        let(:Authorization) { nil }
        run_test!
      end
    end
  end
end
