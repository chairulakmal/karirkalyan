require "rails_helper"

RSpec.describe Applications::TalkingPointsService do
  let(:user) { create(:user) }
  # A fake Claude client returning one tool_use block, the real SDK response shape.
  let(:tool_block) do
    double("ToolUseBlock", type: :tool_use, input: {
      points: [ "Five years of Ruby maps to the Rails backend role", "  ", "Fintech domain overlap" ]
    })
  end
  let(:message)      { double("Message", content: [ tool_block ]) }
  let(:messages_api) { double("Messages") }
  let(:client)       { double("Anthropic::Client", messages: messages_api) }

  before { allow(messages_api).to receive(:create).and_return(message) }

  def application_with_resume(**attrs)
    create(:application, :with_resume, user: user,
           posting_snapshot: "Backend Engineer at a fintech. Ruby/Go.", **attrs)
  end

  describe "#call" do
    it "returns the bullets, trimmed and blanks dropped" do
      service = described_class.new(application_with_resume, client: client)

      expect(service.call).to eq([
        "Five years of Ruby maps to the Rails backend role",
        "Fintech domain overlap"
      ])
    end

    it "sends the resume as a PDF document block beside the posting text" do
      described_class.new(application_with_resume, client: client).call

      expect(messages_api).to have_received(:create) do |kwargs|
        content = kwargs[:messages].first[:content]
        doc = content.find { |b| b[:type] == "document" }
        text = content.find { |b| b[:type] == "text" }
        expect(doc[:source][:media_type]).to eq("application/pdf")
        expect(text[:text]).to include("Backend Engineer at a fintech")
      end
    end

    it "raises MissingInputError when there is no resume" do
      application = create(:application, user: user, posting_snapshot: "text")

      expect { described_class.new(application, client: client).call }
        .to raise_error(described_class::MissingInputError)
    end

    it "raises MissingInputError when there is no posting to compare against" do
      application = create(:application, :with_resume, user: user, posting_snapshot: nil, notes: nil)

      expect { described_class.new(application, client: client).call }
        .to raise_error(described_class::MissingInputError)
    end

    it "falls back to notes when no snapshot was captured" do
      application = create(:application, :with_resume, user: user,
                           posting_snapshot: nil, notes: "Senior Go role, remote")
      described_class.new(application, client: client).call

      expect(messages_api).to have_received(:create) do |kwargs|
        text = kwargs[:messages].first[:content].find { |b| b[:type] == "text" }
        expect(text[:text]).to include("Senior Go role, remote")
      end
    end

    it "raises ExtractionError when the model returns no usable points" do
      allow(tool_block).to receive(:input).and_return(points: [ "", "   " ])
      application = application_with_resume

      expect { described_class.new(application, client: client).call }
        .to raise_error(described_class::ExtractionError)
    end
  end
end
