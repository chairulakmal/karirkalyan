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

      it "rejects a URL on a non-80/443 port before resolving DNS" do
        expect(Resolv).not_to receive(:getaddresses)
        expect { described_class.new("http://example.com:8080/jobs", client: client).call }
          .to raise_error(described_class::InvalidUrlError, /port/)
      end
    end

    # DNS-rebinding defence: the connection must be pinned to the IP we validated,
    # not re-resolved by Net::HTTP (which an attacker's DNS could rebind between
    # the check and the connect).
    context "connection is pinned to the validated IP" do
      subject(:service) { described_class.new("http://example.com/jobs/42", client: client) }

      let(:http) { instance_double(Net::HTTP) }
      let(:response) do
        Net::HTTPOK.new("1.1", "200", "OK").tap do |r|
          allow(r).to receive(:body).and_return("<html>Mercari — Backend Engineer</html>")
        end
      end

      before do
        allow(Resolv).to receive(:getaddresses).with("example.com").and_return([ "93.184.216.34" ])
        allow(Net::HTTP).to receive(:new).with("example.com", 80).and_return(http)
        allow(http).to receive(:ipaddr=)
        allow(http).to receive(:use_ssl=)
        allow(http).to receive(:open_timeout=)
        allow(http).to receive(:read_timeout=)
        allow(http).to receive(:start).and_yield(http).and_return(response)
        allow(http).to receive(:request).and_return(response)
      end

      it "sets ipaddr= to the resolved address" do
        service.call
        expect(http).to have_received(:ipaddr=).with("93.184.216.34")
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
