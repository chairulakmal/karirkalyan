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
          .to raise_error(described_class::InvalidUrlError, /can't be fetched/)
      end

      it "rejects a public host that resolves to a private address" do
        allow(Resolv).to receive(:getaddresses).and_return([ "192.168.1.10" ])
        expect { described_class.new("http://intranet.example.com/", client: client).call }
          .to raise_error(described_class::InvalidUrlError, /can't be fetched/)
      end

      # The wording is the security property, not cosmetics: if "doesn't exist" and
      # "exists but is internal" read differently, an authenticated prober reads
      # the internal DNS map off the error copy. The demo account's credentials are
      # published, so authentication is not a barrier to that prober.
      it "gives an unresolvable host and an internal host the same message" do
        allow(Resolv).to receive(:getaddresses).with("nx.example.com").and_return([])
        allow(Resolv).to receive(:getaddresses).with("intranet.example.com").and_return([ "10.0.0.5" ])

        messages = %w[http://nx.example.com/ http://intranet.example.com/].map do |url|
          described_class.new(url, client: client).call
        rescue described_class::InvalidUrlError => e
          e.message
        end

        expect(messages.uniq.length).to eq(1)
      end

      it "drops an address the resolver returns but IPAddr cannot parse" do
        allow(Resolv).to receive(:getaddresses).and_return([ "not-an-ip" ])
        expect { described_class.new("http://garbled.example.com/", client: client).call }
          .to raise_error(described_class::InvalidUrlError, /can't be fetched/)
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

      let(:http)      { instance_double(Net::HTTP) }
      let(:addresses) { [ "93.184.216.34" ] }
      let(:response) do
        Net::HTTPOK.new("1.1", "200", "OK").tap do |r|
          allow(r).to receive(:body).and_return("<html>Mercari — Backend Engineer</html>")
        end
      end

      before do
        allow(Resolv).to receive(:getaddresses).with("example.com").and_return(addresses)
        allow(Net::HTTP).to receive(:new).with("example.com", 80, nil).and_return(http)
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

      # The `nil` is the pin's load-bearing argument, not tidiness. Net::HTTP's
      # default p_addr is :ENV, and under a proxy Net::HTTP dials the proxy and
      # never consults ipaddr — the proxy re-resolves the host and the rebinding
      # defence is gone. Nothing fails loudly when that happens, so it gets a test.
      it "constructs the connection with proxying disabled" do
        service.call
        expect(Net::HTTP).to have_received(:new).with("example.com", 80, nil)
      end

      # Outbound IPv6 is disabled on the api service, so dialling a AAAA record
      # dies with ENETUNREACH and the user is told we couldn't reach a URL that
      # is fine. Cloudflare-fronted hosts answer AAAA-first, so a resolver order
      # that puts IPv6 in front is the common case, not a contrived one.
      context "when the host resolves to IPv6 first and IPv4 second" do
        let(:addresses) { [ "2606:4700::6810:85e5", "93.184.216.34" ] }

        it "pins the IPv4 address, which is the one we can actually dial" do
          service.call
          expect(http).to have_received(:ipaddr=).with("93.184.216.34")
        end
      end

      context "when the host resolves to IPv6 only" do
        let(:addresses) { [ "2606:4700::6810:85e5" ] }

        it "still pins a validated address rather than letting Net::HTTP re-resolve" do
          service.call
          expect(http).to have_received(:ipaddr=).with("2606:4700::6810:85e5")
        end
      end

      # The IPv4 preference must not become a way in. Validation runs over every
      # resolved address, so one internal address rejects the whole URL — picking
      # which validated address to dial is a separate question from whether the
      # set validated at all.
      context "when a dialable IPv4 resolves alongside an internal IPv6" do
        let(:addresses) { [ "::1", "93.184.216.34" ] }

        it "rejects the URL instead of preferring the reachable address" do
          expect { service.call }
            .to raise_error(described_class::InvalidUrlError, /can't be fetched/)
          expect(http).not_to have_received(:ipaddr=)
        end
      end

      # The IPv4-mapped twin of the case above. `::ffff:127.0.0.1` is loopback in
      # IPv6 clothing, caught by the `::ffff:0:0/96` entry in BLOCKED_RANGES — and
      # IPAddr#ipv4? is false for it, so `find(&:ipv4?)` cannot select it to dial
      # around the guard either. Pinned so that range can't be pruned as redundant.
      context "when an IPv4-mapped loopback resolves alongside a real IPv4" do
        let(:addresses) { [ "::ffff:127.0.0.1", "93.184.216.34" ] }

        it "rejects the URL" do
          expect { service.call }
            .to raise_error(described_class::InvalidUrlError, /can't be fetched/)
          expect(http).not_to have_received(:ipaddr=)
        end
      end
    end

    # The point of the taxonomy: a site refusing us is permanent and unfixable by
    # the user; an unreachable page is worth a retry. Neither means "your URL is
    # malformed", which is what all of this used to be reported as.
    context "when the fetch does not come back with a page" do
      subject(:service) { described_class.new("http://example.com/jobs/42", client: client) }

      let(:http) { instance_double(Net::HTTP) }

      before do
        allow(Resolv).to receive(:getaddresses).with("example.com").and_return([ "93.184.216.34" ])
        allow(Net::HTTP).to receive(:new).with("example.com", 80, nil).and_return(http)
        allow(http).to receive(:ipaddr=)
        allow(http).to receive(:use_ssl=)
        allow(http).to receive(:open_timeout=)
        allow(http).to receive(:read_timeout=)
        allow(http).to receive(:start).and_yield(http).and_return(response)
        allow(http).to receive(:request).and_return(response)
      end

      # TokyoDev's actual behaviour, verified 2026-07-16: 403 + cf-mitigated, to
      # our User-Agent and to a stock Chrome one alike.
      context "with a 403 carrying a Cloudflare challenge" do
        let(:response) do
          Net::HTTPForbidden.new("1.1", "403", "Forbidden").tap { |r| r["cf-mitigated"] = "challenge" }
        end

        it "raises BlockedError, never InvalidUrlError" do
          expect { service.call }
            .to raise_error(described_class::BlockedError, /blocks automated readers/)
        end
      end

      context "with a 401" do
        let(:response) { Net::HTTPUnauthorized.new("1.1", "401", "Unauthorized") }

        it "raises BlockedError" do
          expect { service.call }.to raise_error(described_class::BlockedError)
        end
      end

      # 429 is the one refusal that lifts. Calling it BlockedError would tell a user
      # who pre-filled three postings in a row that the site "blocks automated
      # readers" and to type everything by hand, when waiting 30 seconds would have
      # worked — this release's own bug in a new costume.
      context "with a 429" do
        let(:response) { Net::HTTPTooManyRequests.new("1.1", "429", "Too Many Requests") }

        it "raises a plain FetchError, so the user is told to retry rather than give up" do
          expect { service.call }.to raise_error(described_class::FetchError) do |error|
            expect(error).not_to be_a(described_class::BlockedError)
          end
        end
      end

      # The interstitial that looks like success: 200, real text ("Just a moment…"),
      # so it clears the blank check, reaches Claude on our money, and comes back as
      # a blank form rendered as a 200. The header has to be read before the status
      # is, or this is the one challenge shape that gets through.
      context "with a 200 carrying a Cloudflare challenge" do
        let(:response) do
          Net::HTTPOK.new("1.1", "200", "OK").tap do |r|
            r["cf-mitigated"] = "challenge"
            allow(r).to receive(:body).and_return("<html>Just a moment… Enable JavaScript.</html>")
          end
        end

        it "raises BlockedError rather than shipping the interstitial to Claude" do
          expect { service.call }.to raise_error(described_class::BlockedError)
          expect(client).not_to have_received(:messages)
        end
      end

      # A challenge does not have to ride a status we already treat as a refusal.
      context "with a cf-mitigated header on an otherwise unremarkable status" do
        let(:response) do
          Net::HTTPServiceUnavailable.new("1.1", "503", "Service Unavailable")
            .tap { |r| r["cf-mitigated"] = "challenge" }
        end

        it "raises BlockedError on the header alone" do
          expect { service.call }.to raise_error(described_class::BlockedError)
        end
      end

      context "with a 404" do
        let(:response) { Net::HTTPNotFound.new("1.1", "404", "Not Found") }

        it "raises a plain FetchError — the site did not refuse us, the page is gone" do
          expect { service.call }.to raise_error(described_class::FetchError) do |error|
            expect(error).not_to be_a(described_class::BlockedError)
          end
        end
      end

      # The IPv6 symptom itself, in the shape the user saw it.
      context "when the connection cannot be opened at all" do
        let(:response) { nil }

        before { allow(http).to receive(:start).and_raise(Errno::ENETUNREACH) }

        it "raises FetchError" do
          expect { service.call }.to raise_error(described_class::FetchError, /reach/)
        end
      end
    end

    # The SSRF guard's load-bearing claim is that it re-runs on every hop, and
    # until now not one spec exercised a redirect at all. A refactor that hoists
    # guard_against_internal_host! out of fetch — a natural-looking cleanup, since
    # it reads as redundant per-hop — would reopen the hole with a green suite.
    context "when the page redirects" do
      subject(:service) { described_class.new("http://example.com/jobs/42", client: client) }

      # One connection double per host, so a hop to another host is a distinguishable
      # event rather than a reused stub.
      let(:connections) { Hash.new { |store, host| store[host] = build_connection } }

      def build_connection
        instance_double(Net::HTTP).tap do |conn|
          allow(conn).to receive(:ipaddr=)
          allow(conn).to receive(:use_ssl=)
          allow(conn).to receive(:open_timeout=)
          allow(conn).to receive(:read_timeout=)
          allow(conn).to receive(:start).and_yield(conn)
        end
      end

      def redirect_to(location)
        Net::HTTPFound.new("1.1", "302", "Found").tap { |r| r["location"] = location }
      end

      def page(body)
        Net::HTTPOK.new("1.1", "200", "OK").tap { |r| allow(r).to receive(:body).and_return(body) }
      end

      before do
        allow(Resolv).to receive(:getaddresses).with("example.com").and_return([ "93.184.216.34" ])
        allow(Net::HTTP).to receive(:new) { |host, _port, _proxy| connections[host] }
      end

      it "follows a redirect and returns the destination page" do
        allow(Resolv).to receive(:getaddresses).with("jobs.example.com").and_return([ "93.184.216.35" ])
        allow(connections["example.com"]).to receive(:request)
          .and_return(redirect_to("https://jobs.example.com/42"))
        allow(connections["jobs.example.com"]).to receive(:request)
          .and_return(page("<html>Mercari — Backend Engineer</html>"))

        expect(service.call).to include(company: "Mercari")
      end

      # A bare path in Location has to be joined against the hop it came from, or
      # the second fetch never happens. The returned `url` stays the URL the user
      # pasted — that is the one they recognise — so the second request is what
      # proves the join worked.
      it "resolves a relative Location against the current hop" do
        allow(connections["example.com"]).to receive(:request)
          .and_return(redirect_to("/jobs/43"), page("<html>Mercari — Backend Engineer</html>"))

        expect(service.call).to include(company: "Mercari")
        expect(connections["example.com"]).to have_received(:request).twice
      end

      it "re-runs the SSRF guard on the hop, not just on the pasted URL" do
        allow(Resolv).to receive(:getaddresses).with("cdn.internal.corp").and_return([ "10.0.0.5" ])
        allow(connections["example.com"]).to receive(:request)
          .and_return(redirect_to("https://cdn.internal.corp/x"))

        expect { service.call }.to raise_error(described_class::FetchError)
        expect(connections["cdn.internal.corp"]).not_to have_received(:start)
      end

      # The user picked hop 0. The site picked hop 1. Blaming the pasted URL for
      # where the site sent us is this taxonomy's own bug, one hop later.
      it "blames the fetch, not the user's URL, when a hop is refused" do
        allow(Resolv).to receive(:getaddresses).with("cdn.internal.corp").and_return([ "10.0.0.5" ])
        allow(connections["example.com"]).to receive(:request)
          .and_return(redirect_to("https://cdn.internal.corp/x"))

        expect { service.call }.to raise_error(described_class::FetchError) do |error|
          expect(error).not_to be_a(described_class::InvalidUrlError)
        end
      end

      it "refuses a hop to a non-80/443 port without dying inside Net::HTTP" do
        allow(connections["example.com"]).to receive(:request)
          .and_return(redirect_to("http://example.com:8080/jobs"))

        expect { service.call }.to raise_error(described_class::FetchError)
      end

      # URI.join produces a URI::FTP here, which clears a port-only check and then
      # raises ArgumentError inside Net::HTTP::Get.new — an untyped 500.
      it "refuses a hop to a non-http scheme riding an allowed port" do
        allow(connections["example.com"]).to receive(:request)
          .and_return(redirect_to("ftp://example.com:80/x"))

        expect { service.call }.to raise_error(described_class::FetchError)
      end

      it "gives up rather than following a redirect loop forever" do
        allow(connections["example.com"]).to receive(:request)
          .and_return(redirect_to("http://example.com/jobs/42"))

        expect { service.call }.to raise_error(described_class::FetchError, /too many times/)
      end

      it "raises FetchError when a redirect carries no Location" do
        allow(connections["example.com"]).to receive(:request)
          .and_return(Net::HTTPFound.new("1.1", "302", "Found"))

        expect { service.call }.to raise_error(described_class::FetchError, /redirect/)
      end
    end

    # byteslice is byte-indexed; Japanese is three bytes a character. A cut landing
    # mid-character used to make to_text raise ArgumentError — outside every rescue
    # in the service, so it reached the user as a 500 on the exact pages this thing
    # exists to read.
    context "when the body is larger than the byte cap and not ASCII" do
      subject(:service) { described_class.new("http://example.com/jobs/42", client: client) }

      let(:http) { instance_double(Net::HTTP) }
      let(:oversized_japanese_page) do
        "<html><body>" + ("東京の求人。Rubyエンジニアを募集しています。" * 60_000) + "</body></html>"
      end
      let(:response) do
        Net::HTTPOK.new("1.1", "200", "OK").tap do |r|
          allow(r).to receive(:body).and_return(oversized_japanese_page)
        end
      end

      before do
        allow(Resolv).to receive(:getaddresses).with("example.com").and_return([ "93.184.216.34" ])
        allow(Net::HTTP).to receive(:new).with("example.com", 80, nil).and_return(http)
        allow(http).to receive(:ipaddr=)
        allow(http).to receive(:use_ssl=)
        allow(http).to receive(:open_timeout=)
        allow(http).to receive(:read_timeout=)
        allow(http).to receive(:start).and_yield(http).and_return(response)
        allow(http).to receive(:request).and_return(response)
      end

      it "truncates without splitting a character, and extracts normally" do
        expect(oversized_japanese_page.bytesize).to be > described_class::MAX_BODY_BYTES
        expect(service.call).to include(company: "Mercari")
      end
    end

    context "page has no readable text" do
      subject(:service) { described_class.new("https://example.com/empty", client: client) }

      # Not a FetchError: the fetch worked perfectly. Calling this unreachable
      # would swap one lie for another.
      it "raises UnreadableError" do
        allow(service).to receive(:fetch).and_return("<html><head></head><body></body></html>")
        expect { service.call }.to raise_error(described_class::UnreadableError)
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

    # Claude read the page and found no posting in it — a login wall, an SPA shell,
    # an interstitial that got past blocked?. Handing that back as a 200 gives the
    # user a blank form and calls it success.
    context "Claude finds nothing on the page" do
      subject(:service) { described_class.new("https://example.com/jobs/42", client: client) }

      before do
        allow(service).to receive(:fetch).and_return("<html>Just a moment…</html>")
        allow(client).to receive_message_chain(:messages, :create).and_return(
          double("Message", content: [
            double("ToolUseBlock", type: :tool_use, input: { company: "", role: "", notes: "" })
          ])
        )
      end

      it "raises ExtractionError instead of returning a blank form as success" do
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
