require "spec_helper"
require_relative "../../app/lib/application_fsm"

RSpec.describe ApplicationFSM do
  describe ".assert_transition!" do
    context "valid transitions — happy path" do
      it "allows wishlist → draft" do
        expect { described_class.assert_transition!("wishlist", "draft") }.not_to raise_error
      end

      it "allows draft → applied" do
        expect { described_class.assert_transition!("draft", "applied") }.not_to raise_error
      end

      it "allows applied → phone_screen" do
        expect { described_class.assert_transition!("applied", "phone_screen") }.not_to raise_error
      end

      it "allows phone_screen → technical" do
        expect { described_class.assert_transition!("phone_screen", "technical") }.not_to raise_error
      end

      it "allows technical → final_round" do
        expect { described_class.assert_transition!("technical", "final_round") }.not_to raise_error
      end

      it "allows final_round → offer" do
        expect { described_class.assert_transition!("final_round", "offer") }.not_to raise_error
      end

      it "allows offer → accepted" do
        expect { described_class.assert_transition!("offer", "accepted") }.not_to raise_error
      end

      it "allows offer → declined" do
        expect { described_class.assert_transition!("offer", "declined") }.not_to raise_error
      end
    end

    context "valid transitions — exits" do
      it "allows rejection from applied, phone_screen, technical, final_round, offer" do
        %w[applied phone_screen technical final_round offer].each do |state|
          expect { described_class.assert_transition!(state, "rejected") }.not_to raise_error
        end
      end

      it "allows ghosting from applied, phone_screen, technical, final_round" do
        %w[applied phone_screen technical final_round].each do |state|
          expect { described_class.assert_transition!(state, "ghosted") }.not_to raise_error
        end
      end

      it "allows withdrawal from wishlist, draft, applied, phone_screen, technical, final_round" do
        %w[wishlist draft applied phone_screen technical final_round].each do |state|
          expect { described_class.assert_transition!(state, "withdrawn") }.not_to raise_error
        end
      end

      it "allows any non-terminal state → archived" do
        %w[wishlist draft applied phone_screen technical final_round offer ghosted rejected withdrawn].each do |state|
          expect { described_class.assert_transition!(state, "archived") }.not_to raise_error
        end
      end
    end

    context "valid transitions — revival" do
      it "allows ghosted → applied (company reaches back out)" do
        expect { described_class.assert_transition!("ghosted", "applied") }.not_to raise_error
      end

      it "allows rejected → applied (recruiter rescinds rejection)" do
        expect { described_class.assert_transition!("rejected", "applied") }.not_to raise_error
      end

      it "allows withdrawn → applied (candidate re-engages)" do
        expect { described_class.assert_transition!("withdrawn", "applied") }.not_to raise_error
      end
    end

    context "invalid transitions" do
      it "raises when skipping stages (draft → phone_screen)" do
        expect { described_class.assert_transition!("draft", "phone_screen") }
          .to raise_error(ApplicationFSM::InvalidTransitionError)
      end

      it "raises when skipping technical (applied → final_round)" do
        expect { described_class.assert_transition!("applied", "final_round") }
          .to raise_error(ApplicationFSM::InvalidTransitionError)
      end

      it "raises on backwards transition (phone_screen → draft)" do
        expect { described_class.assert_transition!("phone_screen", "draft") }
          .to raise_error(ApplicationFSM::InvalidTransitionError)
      end

      it "raises on accepted → anything (terminal)" do
        expect { described_class.assert_transition!("accepted", "applied") }
          .to raise_error(ApplicationFSM::InvalidTransitionError)
      end

      it "raises on rejected → non-applied state (only revival to applied allowed)" do
        expect { described_class.assert_transition!("rejected", "phone_screen") }
          .to raise_error(ApplicationFSM::InvalidTransitionError)
      end

      it "raises on declined → anything (terminal)" do
        expect { described_class.assert_transition!("declined", "applied") }
          .to raise_error(ApplicationFSM::InvalidTransitionError)
      end

      it "raises on withdrawn → non-applied state (only revival to applied allowed)" do
        expect { described_class.assert_transition!("withdrawn", "phone_screen") }
          .to raise_error(ApplicationFSM::InvalidTransitionError)
      end

      it "raises on archived → anything (terminal)" do
        expect { described_class.assert_transition!("archived", "draft") }
          .to raise_error(ApplicationFSM::InvalidTransitionError)
      end
    end
  end

  describe ".valid_next_states" do
    it "returns [draft, withdrawn, archived] for wishlist" do
      expect(described_class.valid_next_states("wishlist"))
        .to contain_exactly("draft", "withdrawn", "archived")
    end

    it "returns [applied, withdrawn, archived] for draft" do
      expect(described_class.valid_next_states("draft"))
        .to contain_exactly("applied", "withdrawn", "archived")
    end

    it "returns all exits for applied" do
      expect(described_class.valid_next_states("applied"))
        .to contain_exactly("phone_screen", "rejected", "ghosted", "withdrawn", "archived")
    end

    it "returns all exits for phone_screen" do
      expect(described_class.valid_next_states("phone_screen"))
        .to contain_exactly("technical", "rejected", "ghosted", "withdrawn", "archived")
    end

    it "returns all exits for technical" do
      expect(described_class.valid_next_states("technical"))
        .to contain_exactly("final_round", "rejected", "ghosted", "withdrawn", "archived")
    end

    it "returns all exits for final_round" do
      expect(described_class.valid_next_states("final_round"))
        .to contain_exactly("offer", "rejected", "ghosted", "withdrawn", "archived")
    end

    it "returns [accepted, declined, rejected] for offer" do
      expect(described_class.valid_next_states("offer"))
        .to contain_exactly("accepted", "declined", "rejected", "archived")
    end

    it "returns [applied, archived] for ghosted (revivable)" do
      expect(described_class.valid_next_states("ghosted"))
        .to contain_exactly("applied", "archived")
    end

    it "returns [applied, archived] for rejected (recruiter re-engagement)" do
      expect(described_class.valid_next_states("rejected"))
        .to contain_exactly("applied", "archived")
    end

    it "returns [applied, archived] for withdrawn (candidate re-engagement)" do
      expect(described_class.valid_next_states("withdrawn"))
        .to contain_exactly("applied", "archived")
    end

    it "returns empty array for hard terminal states" do
      %w[accepted declined archived].each do |state|
        expect(described_class.valid_next_states(state)).to be_empty
      end
    end
  end

  describe "VALID_STATES" do
    it "includes all expected states" do
      expect(described_class::VALID_STATES).to include(
        "wishlist", "draft", "applied", "phone_screen",
        "technical", "final_round", "offer",
        "accepted", "declined", "rejected", "ghosted", "withdrawn", "archived"
      )
    end
  end
end
