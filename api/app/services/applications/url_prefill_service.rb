require "net/http"
require "resolv"
require "ipaddr"
require "uri"
require "cgi"

module Applications
  # Turns a job posting into structured fields with Claude: company/role/notes,
  # plus the Japan-market fields (channel, agency, japanese_level, the four
  # comp-structure numbers) since v1.8.0 -- one extraction pass owns every
  # captured field. Returns a plain hash -- the caller (and ultimately the user)
  # reviews the values before anything is saved. The hash also carries
  # :posting_text, the stripped capped text sent to Claude, which is how the
  # form fills posting_snapshot at create time without this service persisting
  # anything (SPEC.md section UrlPrefillService).
  #
  # The pipeline is fetch -> to_text -> extract, and there are two ways in:
  #   url:  the whole pipeline. The only path that can be refused by a site.
  #   text: the user pasted the posting, so the fetch is skipped and the same
  #         to_text -> extract tail runs on it. See #call_on_paste.
  #
  # The class keeps its name: a URL is still the primary source, and the paste is
  # the fallback for when that source is unreachable — not a co-equal mode.
  #
  # Claude reads Japanese postings natively, so this works across Wantedly,
  # Greenhouse, and company career pages without a per-site parser.
  #
  # Errors are typed so the controller can tell the user which of these happened.
  # They ask the user for different things, so reporting one as another is a lie:
  #   InvalidUrlError   -> 422 invalid_url           (the URL is the problem — never fetched)
  #   BlockedError      -> 422 prefill_blocked       (the site refuses automated readers)
  #   PasteTooLongError -> 422 prefill_paste_too_long (the paste exceeds the cap once stripped)
  #   FetchError        -> 502 prefill_unreachable   (couldn't get the page; a retry may help)
  #   UnreadableError   -> 502 prefill_failed        (got the page, found no text in it)
  #   ExtractionError   -> 502 prefill_failed        (Claude call failed or returned nothing usable)
  #   ConfigError       -> 503 prefill_unavailable   (ANTHROPIC_API_KEY not set)
  class UrlPrefillService
    class Error < StandardError; end
    class InvalidUrlError < Error; end
    class FetchError      < Error; end
    # Only the paste path raises this. A fetched page over the cap is truncated in
    # silence (see #capped) — the difference is whether the user watched us read it.
    class PasteTooLongError < Error; end
    # A failed fetch, so it subclasses FetchError — which obliges the controller to
    # rescue it *first*. That ordering is not decoration: a base class rescued ahead
    # of its subclass is the exact bug this taxonomy exists to fix.
    class BlockedError    < FetchError; end
    class UnreadableError < Error; end
    class ConfigError     < Error; end
    class ExtractionError < Error; end

    # Statuses a site uses to refuse a non-browser client outright. A `cf-mitigated`
    # header means a Cloudflare challenge whatever the status rides on.
    #
    # 429 is deliberately absent. It is the one refusal that *is* temporary — the
    # site is telling us to come back, and `prefill_blocked` would tell the user to
    # give up and type it by hand. That is this release's own bug in a new costume,
    # so a 429 falls through to FetchError and the user is told to retry.
    BLOCKED_STATUSES = [ 401, 403 ].freeze

    MODEL          = "claude-haiku-4-5-20251001"
    MAX_REDIRECTS  = 3
    MAX_BODY_BYTES = 2_000_000   # cap the HTML we read (~2 MB), enforced while streaming
    MAX_TEXT_CHARS = 12_000      # cap the text sent to Claude (~3-4k tokens)
    OPEN_TIMEOUT   = 5           # seconds
    READ_TIMEOUT   = 8           # seconds, per read — bounds a stalled socket, not a slow body
    FETCH_DEADLINE = 15          # seconds, the whole fetch: every hop, every chunk
    USER_AGENT     = "KarirKalyan-Prefill/1.0 (+https://kk.chairulakmal.com)"

    # Raised internally to stop reading a response at MAX_BODY_BYTES; never leaves
    # #fetch. Not part of the error taxonomy on purpose: hitting the cap is a
    # truncation the pipeline already promises to absorb (see #capped), not a
    # failure to report.
    class BodyCapReached < StandardError; end
    private_constant :BodyCapReached

    # SSRF defence: extra ranges beyond IPAddr's loopback?/private?/link_local?.
    # `::ffff:0:0/96` covers IPv4-mapped addresses, so `::ffff:127.0.0.1` is caught
    # here rather than needing its own unwrapping pass. NAT64 and 6to4 both need a
    # translating gateway to mean anything, so they are theoretical on Railway —
    # but `64:ff9b::7f00:1` is loopback wearing an IPv6 hat, and they cost a line.
    BLOCKED_RANGES = %w[
      0.0.0.0/8 100.64.0.0/10 192.0.0.0/24 198.18.0.0/15
      240.0.0.0/4 ::/128 ::ffff:0:0/96 64:ff9b::/96 2002::/16
    ].map { |cidr| IPAddr.new(cidr) }.freeze

    # Only company/role/notes are required: they are what makes a page a posting.
    # The market fields are optional, and #extract normalises what comes back
    # rather than trusting it -- a schema constrains shape, not judgement.
    TOOL = {
      name:        "extract_job_posting",
      description: "Record the structured fields extracted from a job posting page.",
      input_schema: {
        type:       "object",
        properties: {
          company: { type: "string", description: "Hiring company name. Empty string if not present." },
          role:    { type: "string", description: "Job title / role. Empty string if not present." },
          notes:   { type: "string", description: "Start with one line summarising the tech stack and industry/product type (e.g. 'Tech: React, Rails, PostgreSQL | Industry: B2B SaaS / Fintech'). Then 2-4 sentences covering location, employment type, key requirements, and salary if listed. Empty string if not present." },
          channel: { type: "string", enum: [ "direct", "agent", "" ],
                     description: "'agent' when the posting is listed by a recruitment agency on behalf of a client company; 'direct' when the hiring company posts its own opening; empty string when unclear." },
          agency:  { type: "string", description: "Name of the recruitment agency when the posting is an agency listing. Empty string otherwise." },
          japanese_level: { type: "string", enum: [ "none", "conversational", "business", "n2", "n1", "" ],
                            description: "Japanese language requirement: 'n1'/'n2' for explicit JLPT levels, 'business' for business-level Japanese, 'conversational' for conversational Japanese, 'none' when the posting says no Japanese is required or is explicitly English-only. Empty string when not stated." },
          comp_annual_min_yen: { type: "integer",
                                 description: "Low end of the quoted annual compensation (nensyu) in yen, e.g. 600man-yen is 6000000. 0 if not stated." },
          comp_annual_max_yen: { type: "integer",
                                 description: "High end of the quoted annual range in yen. 0 if the posting quotes a single figure or none." },
          comp_months_guaranteed: { type: "number",
                                    description: "Months of base salary guaranteed per year: 12 plus any guaranteed bonus months (e.g. base + 2 guaranteed bonus months is 14). 0 if not stated." },
          comp_months_variable: { type: "number",
                                  description: "Performance-tied bonus months on top of the guaranteed months. 0 if not stated." }
        },
        required: %w[company role notes]
      }
    }.freeze

    SYSTEM_PROMPT = <<~PROMPT.freeze
      You extract structured data from job postings using the extract_job_posting tool.
      The posting may be written in Japanese or English — return the company and role in
      their original language. Keep notes concise. Use an empty string for any field you
      cannot find on the page; never guess or invent values. For the compensation fields,
      年収 quoted in 万円 must be converted to yen (600万 → 6000000); report only figures
      the posting actually states, and 0 for any it does not.
      For the notes field, the very first line must be a tech-stack and industry summary
      in this format: "Tech: <stack> | Industry: <industry/product type>". Follow it with
      a blank line, then the rest of the summary.
    PROMPT

    def initialize(url = nil, text: nil, client: nil)
      @raw_url  = url.to_s.strip
      @raw_text = text.to_s
      @client   = client
    end

    def call
      # Text wins over URL, because the only reason to paste is that the URL has
      # already failed. Blank text is not a paste — it is a field nobody filled in —
      # so it falls through to the URL path, and a request carrying neither ends at
      # validated_uri's InvalidUrlError: we were given nothing to read.
      return call_on_paste if @raw_text.present?

      uri = validated_uri
      # Fail before the fetch, not after it. A server with no API key would
      # otherwise spend the full SSRF-guarded round trip — up to 13s of timeouts —
      # making an outbound request whose result it has no way to use.
      client

      html = fetch(uri)
      text = capped(to_text(html))
      raise UnreadableError, "That page had no readable text to work with." if text.blank?

      # posting_text is the exact text Claude read; the form carries it into
      # posting_snapshot at create time. Nothing is persisted here.
      extract(text).merge(url: uri.to_s, posting_text: text)
    end

    private

    # The recovery path for a posting the fetcher cannot read. Only `fetch` ever
    # failed — `to_text` and `extract` never knew where their text came from — so
    # this is a second door into the same pipeline, not a second pipeline.
    #
    # Nothing is dialled here, so nothing is guarded: the SSRF defence exists
    # because *we* fetch a user-supplied URL, and on this path the user fetched the
    # page themselves, in their own browser, as themselves. That is also why this
    # is not circumvention of a site that refused us — we are not asking it again.
    #
    # The URL is echoed back unfetched, so a posting pasted after a block still
    # records where it came from.
    def call_on_paste
      client

      # Byte-capped and scrubbed exactly like a fetched body, for exactly the
      # reason the fetch path documents: a cut landing mid-character makes every
      # gsub in to_text raise ArgumentError, and Japanese is 3 bytes a character.
      # It also bounds that regex work on a body whose size the user chose.
      text = to_text(@raw_text.byteslice(0, MAX_BODY_BYTES).to_s.scrub)
      raise UnreadableError, "That paste had no readable text in it." if text.blank?

      # Refused, not truncated — the one place the two entry points diverge past
      # the front door. The server is the only party that can measure this: the cap
      # counts *stripped* characters, so a browser counting the raw paste would
      # block a view-source dump that strips to a third of its size. Deciding it
      # here is what lets the form stay out of the business of guessing.
      if text.length > MAX_TEXT_CHARS
        raise PasteTooLongError,
              "That paste is #{text.length} characters once formatting is stripped, " \
              "and the limit is #{MAX_TEXT_CHARS}. Trim it and try again."
      end

      # A pasted posting snapshots exactly as a fetched one does -- a posting
      # that could never be fetched is the strongest case for keeping a copy.
      extract(text).merge(url: @raw_url, posting_text: text)
    end

    def validated_uri
      raise InvalidUrlError, "Paste a job posting URL first." if @raw_url.blank?

      uri = URI.parse(@raw_url)
      unless uri.is_a?(URI::HTTP) && uri.host.present?
        raise InvalidUrlError, "Enter a valid http(s) URL."
      end
      uri
    rescue URI::InvalidURIError
      raise InvalidUrlError, "Enter a valid http(s) URL."
    end

    def fetch(uri, redirects_left: MAX_REDIRECTS, deadline: nil)
      # One deadline for the whole fetch, threaded through every redirect hop.
      # READ_TIMEOUT is per-read: a trickle stream that delivers a chunk every few
      # seconds, forever, never trips it. This is what bounds it.
      deadline ||= monotonic_now + FETCH_DEADLINE

      # Resolve + validate once, then pin the connection to that exact IP.
      # Letting Net::HTTP re-resolve the host would reopen a DNS-rebinding hole:
      # a name that validated as public could rebind to a private IP between the
      # check and the connect. Setting http.ipaddr keeps the Host header and TLS
      # SNI on the original hostname while dialling the validated address.
      validated_ip = guard_against_internal_host!(uri)

      # p_addr: nil, not the default :ENV. With :ENV, an `http_proxy` variable makes
      # Net::HTTP dial the proxy and ignore `ipaddr` entirely — the proxy re-resolves
      # the hostname itself, and the rebinding defence above becomes decoration. No
      # proxy var is set today; this makes sure adding one later cannot quietly
      # switch the guard off.
      http              = Net::HTTP.new(uri.host, uri.port, nil)
      http.ipaddr       = validated_ip
      http.use_ssl      = uri.scheme == "https"
      http.open_timeout = OPEN_TIMEOUT
      http.read_timeout = READ_TIMEOUT

      body     = +""
      response = nil
      begin
        http.start do |conn|
          request = Net::HTTP::Get.new(uri)
          request["User-Agent"] = USER_AGENT
          request["Accept"]     = "text/html,application/xhtml+xml"
          # Block form, streamed. The unstreamed path has no cap worth the name:
          # response.body buffers the entire body before byteslice sees a byte, so
          # a huge or endless response occupies the container's memory — inline in
          # a Puma request thread — with the cap as decoration. Streaming stops
          # *reading* at the cap.
          conn.request(request) do |resp|
            response = resp
            read_capped(resp, body, deadline)
          end
        end
      rescue BodyCapReached
        # The cap is a truncation, not a failure: keep what was read. The
        # connection is dropped mid-body, which is fine — it is not reused.
      end

      # Ahead of the `case`, not inside its `else`. A Turnstile interstitial answers
      # `200` + `cf-mitigated` with "Just a moment…" — real text, so it would clear
      # the blank check, reach Claude on our money, and come back as a blank form
      # rendered as success. Checked here, the header means what its comment says:
      # a challenge, whatever status it rides on.
      raise BlockedError, "That site blocks automated readers." if blocked?(response)

      case response
      when Net::HTTPSuccess
        # byteslice is byte-indexed and Japanese text is 3 bytes a character, so a
        # cut at the cap lands mid-character and every later gsub raises
        # ArgumentError — an untyped 500 on the exact pages this service exists to
        # read. scrub drops the partial character instead. (The stream stops at the
        # cap, but the final chunk can overshoot it; the byteslice trims that.)
        body.byteslice(0, MAX_BODY_BYTES).to_s.scrub
      when Net::HTTPRedirection
        raise FetchError, "That URL redirected too many times." if redirects_left <= 0

        location = response["location"].to_s
        raise FetchError, "Couldn't follow that page's redirect." if location.blank?

        # The guard raises InvalidUrlError, which is an accusation about the URL the
        # *user* pasted. True on hop 0; a lie on every hop after it, where the site
        # chose the destination. Reporting a site's redirect to an internal host as
        # "your URL is malformed" is precisely the bug this release exists to fix,
        # so a rejection past hop 0 is a fetch failure.
        begin
          fetch(URI.join(uri.to_s, location), redirects_left: redirects_left - 1, deadline: deadline)
        rescue InvalidUrlError
          raise FetchError, "That page redirected somewhere we won't follow."
        end
      else
        raise FetchError, "Couldn't fetch that page (HTTP #{response.code})."
      end
    rescue SocketError, SystemCallError, Timeout::Error, OpenSSL::SSL::SSLError, URI::InvalidURIError
      raise FetchError, "Couldn't reach that URL."
    end

    # Reads a response body in chunks into +buffer+, stopping at MAX_BODY_BYTES or
    # the deadline. Runs for *every* response, not just the 200s: returning from
    # the request block without reading leaves Net::HTTP to drain the body into
    # memory itself on the way out (Net::HTTPResponse#reading_body reads whatever
    # the block didn't), which would reopen the unbounded read on exactly the
    # responses nobody looks at — redirects and error pages.
    def read_capped(resp, buffer, deadline)
      resp.read_body do |chunk|
        raise FetchError, "That page took too long to read." if monotonic_now > deadline

        buffer << chunk
        raise BodyCapReached if buffer.bytesize >= MAX_BODY_BYTES
      end
    end

    def monotonic_now
      Process.clock_gettime(Process::CLOCK_MONOTONIC)
    end

    # A refusal, not a failure: the URL is fine and a retry fetches the same wall,
    # so this is a state to report honestly rather than dress around by rotating
    # User-Agents. No board is currently known to answer us this way — this comment
    # named TokyoDev until 2026-07-17 on evidence that did not hold up; SPEC.md
    # § UrlPrefillService has the account, and the probing rule it left behind.
    def blocked?(response)
      response["cf-mitigated"].present? || BLOCKED_STATUSES.include?(response.code.to_i)
    end

    # Refuse to fetch private/loopback/link-local/internal addresses (incl. the
    # cloud metadata endpoint 169.254.169.254, covered by link_local). Resolves
    # the host and checks every address, so a public name pointing at a private
    # IP is still blocked. Returns a validated IP for the caller to connect to
    # directly (defeats DNS rebinding). Re-run on each redirect hop by fetch.
    def guard_against_internal_host!(uri)
      # Re-checked here rather than trusting validated_uri, because fetch recurses
      # into itself on a redirect and never passes back through it. URI.join will
      # happily produce `ftp://host:80/x` from a Location header — which clears the
      # port check below and then dies in Net::HTTP::Get.new as an untyped 500.
      unless uri.is_a?(URI::HTTP) && uri.host.present?
        raise InvalidUrlError, "Enter a valid http(s) URL."
      end

      unless [ 80, 443 ].include?(uri.port)
        raise InvalidUrlError, "That URL uses a port we don't allow (only 80 and 443)."
      end

      addresses = resolve(uri.host)

      # One message for "doesn't resolve" and "resolves somewhere internal", because
      # the difference between them is the answer to a question the user should not
      # be able to ask. Distinct copy turns a blind SSRF into an internal-hostname
      # oracle: probe redis.railway.internal and admin.corp, and the wording tells
      # you which names exist. The demo account's credentials are published, so
      # "authenticated" is not a meaningful barrier to whoever is asking. The real
      # reason goes to the log, where the operator can see it and the prober can't.
      if addresses.empty? || addresses.any? { |ip| internal_ip?(ip) }
        reason = addresses.empty? ? "did not resolve" : "resolved to an internal address"
        Rails.logger.warn("[prefill] refused #{uri.host}: #{reason}")
        raise InvalidUrlError, "That URL can't be fetched."
      end

      # Every resolved address passed the check, so any of them is safe to dial —
      # but not every one is reachable. Outbound IPv6 is disabled on the api
      # service, so dialling a AAAA record dies with ENETUNREACH before a packet
      # leaves the container and the user is told we couldn't reach a URL that is
      # perfectly fine. Cloudflare-fronted hosts resolve IPv6-first, which makes
      # that the common case rather than the edge.
      #
      # This does not weaken the guard. Every address was validated above and one
      # internal address rejects the whole URL; preferring IPv4 only decides which
      # already-validated address we dial, never whether validation ran.
      (addresses.find(&:ipv4?) || addresses.first).to_s
    end

    # An address the resolver returns but IPAddr can't parse is not a reason to let
    # the fetch through — it is one fewer address we managed to validate, so it is
    # dropped. An empty result then reads as "nothing here validated", which the
    # caller already refuses.
    def resolve(host)
      Resolv.getaddresses(host).filter_map do |address|
        IPAddr.new(address)
      rescue IPAddr::InvalidAddressError
        nil
      end
    end

    def internal_ip?(ip)
      ip.loopback? || ip.private? || ip.link_local? ||
        BLOCKED_RANGES.any? { |range| range.include?(ip) }
    end

    # Strips markup to text. Deliberately *uncapped* — the cap is applied by the
    # caller, because the two entry points owe the user different things when the
    # text is too long. See #capped and #call_on_paste.
    def to_text(html)
      text = html.dup
      text.gsub!(%r{<script\b[^>]*>.*?</script>}mi, " ")
      text.gsub!(%r{<style\b[^>]*>.*?</style>}mi, " ")
      text.gsub!(/<!--.*?-->/m, " ")
      text.gsub!(/<[^>]+>/, " ")
      text = CGI.unescapeHTML(text)
      text.gsub!(/\s+/, " ")
      text.strip!
      text.to_s
    end

    # The fetched path truncates in silence, and that stays true: nobody watched us
    # read that page, the user never saw its length, and a posting has said what it
    # needs to well before 12k of stripped text. A paste is the opposite case — the
    # user assembled it and can see it — so #call_on_paste refuses instead.
    def capped(text)
      text[0, MAX_TEXT_CHARS].to_s
    end

    def extract(text)
      message = client.messages.create(
        model:       MODEL,
        max_tokens:  1024,
        system:      SYSTEM_PROMPT,
        tools:       [ TOOL ],
        tool_choice: { type: :tool, name: TOOL[:name] },
        messages:    [ { role: "user", content: "Extract the job posting fields from this page text:\n\n#{text}" } ]
      )

      block = message.content.find { |part| part.type == :tool_use }
      raise ExtractionError, "The AI couldn't read that posting. Fill the fields in manually." if block.nil?

      input  = block.input
      fields = {
        company: field(input, :company),
        role:    field(input, :role),
        notes:   field(input, :notes),
        # Normalised, not trusted: the schema constrains shape, not judgement.
        # An enum value outside the model's set becomes nil, a non-positive
        # number becomes nil -- a hallucinated channel written into the form is
        # worse than an empty one.
        channel:                enum_field(input, :channel, Application::CHANNELS),
        agency:                 field(input, :agency).presence,
        japanese_level:         enum_field(input, :japanese_level, Application::JAPANESE_LEVELS),
        comp_annual_min_yen:    positive_number(input, :comp_annual_min_yen)&.round,
        comp_annual_max_yen:    positive_number(input, :comp_annual_max_yen)&.round,
        comp_months_guaranteed: positive_number(input, :comp_months_guaranteed),
        comp_months_variable:   positive_number(input, :comp_months_variable)
      }

      # Keyed to company/role/notes alone, deliberately: a page with a company
      # and role is a posting even when it names no salary, and the reverse is
      # not true. All three empty means Claude read the page and found no
      # posting in it — a challenge interstitial, a login wall, an SPA shell.
      # Returning that as a 200 hands the user a blank form and calls it
      # success, which is the same class of lie as the status codes this
      # taxonomy untangled.
      if fields.values_at(:company, :role, :notes).all?(&:blank?)
        raise ExtractionError, "That page didn't look like a job posting. Fill the fields in manually."
      end

      fields
    rescue Anthropic::Errors::Error
      raise ExtractionError, "The AI service is unavailable right now. Fill the fields in manually."
    end

    def field(input, key)
      (input[key] || input[key.to_s]).to_s.strip
    end

    def enum_field(input, key, allowed)
      value = field(input, key)
      allowed.include?(value) ? value : nil
    end

    # nil for absent, non-numeric, and non-positive alike: the schema asks for 0
    # when a figure is not stated, and a 年収 of zero yen is not a real answer.
    def positive_number(input, key)
      value = Float(input[key] || input[key.to_s], exception: false)
      value&.positive? ? value : nil
    end

    def client
      @client ||= begin
        api_key = ENV["ANTHROPIC_API_KEY"].to_s
        raise ConfigError, "AI pre-fill isn't configured on this server." if api_key.blank?

        Anthropic::Client.new(api_key: api_key)
      end
    end
  end
end
