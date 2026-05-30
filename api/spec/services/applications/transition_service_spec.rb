require "spec_helper"
require_relative "../../../app/lib/application_fsm"
require_relative "../../../app/services/applications/transition_service"

RSpec.describe Applications::TransitionService do
  let(:actor)       { double("User") }
  let(:entries)     { double("AssociationProxy") }
  let(:application) do
    double("Application",
      status:                  "draft",
      applied_at:              nil,
      status_before_last_save: "draft",
      timeline_entries:        entries
    )
  end

  subject(:service) { described_class.new(application: application, to: "applied", actor: actor) }

  before do
    allow(ActiveRecord::Base).to receive(:transaction).and_yield
  end

  describe "#call" do
    context "valid transition" do
      before do
        allow(application).to receive(:update!).and_return(true)
        allow(entries).to receive(:create!).and_return(true)
      end

      it "calls assert_transition! before writing" do
        expect(ApplicationFSM).to receive(:assert_transition!).with("draft", "applied").ordered
        expect(application).to receive(:update!).ordered
        service.call
      end

      it "sets applied_at on draft → applied" do
        expect(application).to receive(:update!).with(
          hash_including(status: "applied", applied_at: instance_of(ActiveSupport::TimeWithZone))
        )
        service.call
      end

      it "does not overwrite applied_at on later transitions" do
        existing_time = Time.current - 2.days
        allow(application).to receive(:status).and_return("applied")
        allow(application).to receive(:applied_at).and_return(existing_time)
        allow(application).to receive(:status_before_last_save).and_return("applied")

        service_later = described_class.new(application: application, to: "phone_screen", actor: actor)

        expect(application).to receive(:update!).with(
          hash_including(applied_at: existing_time)
        )
        service_later.call
      end

      it "writes a timeline entry" do
        allow(application).to receive(:update!)
        expect(entries).to receive(:create!).with(
          hash_including(actor: actor, from_status: "draft", to_status: "applied", note: nil)
        )
        service.call
      end

      it "writes the note to the timeline entry when provided" do
        allow(application).to receive(:update!)
        service_with_note = described_class.new(
          application: application, to: "applied", actor: actor, note: "Company reached back out"
        )
        expect(entries).to receive(:create!).with(
          hash_including(note: "Company reached back out")
        )
        service_with_note.call
      end

      it "returns the application" do
        allow(application).to receive(:update!)
        allow(entries).to receive(:create!)
        expect(service.call).to eq(application)
      end
    end

    context "invalid transition" do
      it "raises InvalidTransitionError without touching the DB" do
        service_invalid = described_class.new(application: application, to: "offer", actor: actor)
        expect(application).not_to receive(:update!)
        expect { service_invalid.call }.to raise_error(ApplicationFSM::InvalidTransitionError)
      end
    end
  end
end
