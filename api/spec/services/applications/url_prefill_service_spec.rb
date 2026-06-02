require "rails_helper"

RSpec.describe Applications::UrlPrefillService do
  # A fake Claude client: messages.create returns a message whose content holds
  # a single tool_use block, mirroring the real SDK response shape.
  let(:tool_block) do
    double("ToolUseBlock", type: :tool_use, input: {
      company: "Mercari",
      role:    "Backend Engineer",
      notes:   "Tokyo, full-time. Ruby/Go backend."
    })
  end
  let(:message) { double("Message", content: [ tool_block ]) }
  let(:client)  { double("Anthropic::Client") }

  before { allow(client).to receive_message_chain(:messages, :create).and_return(message) }

  describe "#call" do
    context "happy path" do
      subject(:service) { described_class.new("https://example.com/jobs/42", client: client) }

      before do
        allow(service).to receive(:fetch).and_return("<html><body>Mercari — Backend Engineer</body></html>")
      end

      it "returns the extracted fields plus the resolved url" do
        expect(service.call).to eq(
          company: "Mercari",
          role:    "Backend Engineer",
          notes:   "Tokyo, full-time. Ruby/Go backend.",
          url:     "https://example.com/jobs/42"
        )
      end
    end

    context "invalid URL" do
      it "rejects a blank url" do
        expect { described_class.new("", client: client).call }
          .to raise_error(described_class::InvalidUrlError)
      end

      it "rejects a non-http(s) scheme" do
        expect { described_class.new("ftp://example.com/x", client: client).call }
          .to raise_error(described_class::InvalidUrlError)
      end

      it "rejects a private/internal IP literal (SSRF guard)" do
        expect { described_class.new("http://10.0.0.1/admin", client: client).call }
          .to raise_error(described_class::InvalidUrlError, /private or internal/)
      end

      it "rejects a public host that resolves to a private address" do
        allow(Resolv).to receive(:getaddresses).and_return([ "192.168.1.10" ])
        expect { described_class.new("http://intranet.example.com/", client: client).call }
          .to raise_error(described_class::InvalidUrlError, /private or internal/)
      end
    end

    context "page has no readable text" do
      subject(:service) { described_class.new("https://example.com/empty", client: client) }

      it "raises FetchError" do
        allow(service).to receive(:fetch).and_return("<html><head></head><body></body></html>")
        expect { service.call }.to raise_error(described_class::FetchError)
      end
    end

    context "Claude returns no tool_use block" do
      subject(:service) { described_class.new("https://example.com/jobs/42", client: client) }

      before do
        allow(service).to receive(:fetch).and_return("<html>Real posting text</html>")
        allow(client).to receive_message_chain(:messages, :create)
          .and_return(double("Message", content: []))
      end

      it "raises ExtractionError" do
        expect { service.call }.to raise_error(described_class::ExtractionError)
      end
    end

    context "Claude API errors" do
      subject(:service) { described_class.new("https://example.com/jobs/42", client: client) }

      before do
        allow(service).to receive(:fetch).and_return("<html>Real posting text</html>")
        allow(client).to receive_message_chain(:messages, :create)
          .and_raise(Anthropic::Errors::Error)
      end

      it "wraps it as ExtractionError" do
        expect { service.call }.to raise_error(described_class::ExtractionError)
      end
    end

    context "ANTHROPIC_API_KEY is not set" do
      subject(:service) { described_class.new("https://example.com/jobs/42") }

      before do
        allow(service).to receive(:fetch).and_return("<html>Real posting text</html>")
        allow(ENV).to receive(:[]).and_call_original
        allow(ENV).to receive(:[]).with("ANTHROPIC_API_KEY").and_return("")
      end

      it "raises ConfigError" do
        expect { service.call }.to raise_error(described_class::ConfigError)
      end
    end
  end
end
