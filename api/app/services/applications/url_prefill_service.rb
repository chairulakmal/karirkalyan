require "net/http"
require "resolv"
require "ipaddr"
require "uri"
require "cgi"

module Applications
  # Fetches a job-posting URL, strips it to text, and asks Claude to pull out
  # the company, role, and a short notes summary. Returns a plain hash — the
  # caller (and ultimately the user) reviews the values before anything is saved.
  #
  # Claude reads Japanese postings natively, so this works across Wantedly,
  # Greenhouse, and company career pages without a per-site parser.
  #
  # Errors are typed so the controller can map them to the right HTTP status:
  #   InvalidUrlError  -> 422 (bad or private/internal URL — never fetched)
  #   FetchError       -> 422 (URL was fine but the page couldn't be read)
  #   ConfigError      -> 503 (ANTHROPIC_API_KEY not set)
  #   ExtractionError  -> 502 (Claude call failed or returned nothing usable)
  class UrlPrefillService
    class Error < StandardError; end
    class InvalidUrlError < Error; end
    class FetchError      < Error; end
    class ConfigError     < Error; end
    class ExtractionError < Error; end

    MODEL          = "claude-haiku-4-5-20251001"
    MAX_REDIRECTS  = 3
    MAX_BODY_BYTES = 2_000_000   # cap the HTML we read (~2 MB)
    MAX_TEXT_CHARS = 12_000      # cap the text sent to Claude (~3-4k tokens)
    OPEN_TIMEOUT   = 5           # seconds
    READ_TIMEOUT   = 8           # seconds
    USER_AGENT     = "KarirKalyan-Prefill/1.0 (+https://kk.chairulakmal.com)"

    # SSRF defence: extra ranges beyond IPAddr's loopback?/private?/link_local?.
    BLOCKED_RANGES = %w[
      0.0.0.0/8 100.64.0.0/10 192.0.0.0/24 198.18.0.0/15
      240.0.0.0/4 ::/128 ::ffff:0:0/96
    ].map { |cidr| IPAddr.new(cidr) }.freeze

    TOOL = {
      name:        "extract_job_posting",
      description: "Record the structured fields extracted from a job posting page.",
      input_schema: {
        type:       "object",
        properties: {
          company: { type: "string", description: "Hiring company name. Empty string if not present." },
          role:    { type: "string", description: "Job title / role. Empty string if not present." },
          notes:   { type: "string", description: "Start with one line summarising the tech stack and industry/product type (e.g. 'Tech: React, Rails, PostgreSQL | Industry: B2B SaaS / Fintech'). Then 2-4 sentences covering location, employment type, key requirements, and salary if listed. Empty string if not present." }
        },
        required: %w[company role notes]
      }
    }.freeze

    SYSTEM_PROMPT = <<~PROMPT.freeze
      You extract structured data from job postings using the extract_job_posting tool.
      The posting may be written in Japanese or English — return the company and role in
      their original language. Keep notes concise. Use an empty string for any field you
      cannot find on the page; never guess or invent values.
      For the notes field, the very first line must be a tech-stack and industry summary
      in this format: "Tech: <stack> | Industry: <industry/product type>". Follow it with
      a blank line, then the rest of the summary.
    PROMPT

    def initialize(url, client: nil)
      @raw_url = url.to_s.strip
      @client  = client
    end

    def call
      uri  = validated_uri
      html = fetch(uri)
      text = to_text(html)
      raise FetchError, "That page had no readable text to work with." if text.blank?

      extract(text).merge(url: uri.to_s)
    end

    private

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

    def fetch(uri, redirects_left: MAX_REDIRECTS)
      guard_against_internal_host!(uri)

      response = Net::HTTP.start(
        uri.host, uri.port,
        use_ssl:      uri.scheme == "https",
        open_timeout: OPEN_TIMEOUT,
        read_timeout: READ_TIMEOUT
      ) do |http|
        request = Net::HTTP::Get.new(uri)
        request["User-Agent"] = USER_AGENT
        request["Accept"]     = "text/html,application/xhtml+xml"
        http.request(request)
      end

      case response
      when Net::HTTPSuccess
        response.body.to_s.byteslice(0, MAX_BODY_BYTES).to_s
      when Net::HTTPRedirection
        raise FetchError, "That URL redirected too many times." if redirects_left <= 0

        location = response["location"].to_s
        raise FetchError, "Couldn't follow that page's redirect." if location.blank?
        fetch(URI.join(uri.to_s, location), redirects_left: redirects_left - 1)
      else
        raise FetchError, "Couldn't fetch that page (HTTP #{response.code})."
      end
    rescue SocketError, SystemCallError, Timeout::Error, OpenSSL::SSL::SSLError, URI::InvalidURIError
      raise FetchError, "Couldn't reach that URL."
    end

    # Refuse to fetch private/loopback/link-local/internal addresses (incl. the
    # cloud metadata endpoint 169.254.169.254, covered by link_local). Resolves
    # the host and checks every address, so a public name pointing at a private
    # IP is still blocked. Re-run on each redirect hop by fetch.
    def guard_against_internal_host!(uri)
      addresses = Resolv.getaddresses(uri.host)
      raise InvalidUrlError, "Couldn't resolve that host." if addresses.empty?

      addresses.each do |address|
        ip = IPAddr.new(address)
        next unless internal_ip?(ip)

        raise InvalidUrlError, "That URL points to a private or internal address."
      end
    rescue IPAddr::InvalidAddressError
      raise InvalidUrlError, "Couldn't resolve that host."
    end

    def internal_ip?(ip)
      ip.loopback? || ip.private? || ip.link_local? ||
        BLOCKED_RANGES.any? { |range| range.include?(ip) }
    end

    def to_text(html)
      text = html.dup
      text.gsub!(%r{<script\b[^>]*>.*?</script>}mi, " ")
      text.gsub!(%r{<style\b[^>]*>.*?</style>}mi, " ")
      text.gsub!(/<!--.*?-->/m, " ")
      text.gsub!(/<[^>]+>/, " ")
      text = CGI.unescapeHTML(text)
      text.gsub!(/\s+/, " ")
      text.strip!
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

      input = block.input
      {
        company: field(input, :company),
        role:    field(input, :role),
        notes:   field(input, :notes)
      }
    rescue Anthropic::Errors::Error
      raise ExtractionError, "The AI service is unavailable right now. Fill the fields in manually."
    end

    def field(input, key)
      (input[key] || input[key.to_s]).to_s.strip
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
