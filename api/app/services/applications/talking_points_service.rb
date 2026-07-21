module Applications
  # Cover-letter talking points: the concrete overlaps between the user's resume
  # and the posting, as bullets the user then writes the letter from. Bullets,
  # not a draft (TODO.md v1.10.0): a generic AI voice is the real risk in a market
  # where the letter *is* the signal, so this extracts match points and stops.
  #
  # Reuses the Claude pipeline UrlPrefillService established: the same anthropic
  # gem, the same Haiku model, the same tool/JSON-schema for typed output. The
  # new part is that it reads *both* documents at once: the resume PDF as a
  # document content block, the posting text beside it. Nothing is persisted; the
  # points are generated on demand and shown for the user to draw from.
  class TalkingPointsService
    MODEL      = "claude-haiku-4-5-20251001"
    MAX_POINTS = 6

    class Error            < StandardError; end
    class MissingInputError < Error; end # no resume, or no posting to compare it to
    class ConfigError       < Error; end # ANTHROPIC_API_KEY not set
    class ExtractionError   < Error; end # the model returned nothing usable

    TOOL = {
      name:        "cover_letter_talking_points",
      description: "Return concise cover-letter talking points grounded in both the resume and the posting.",
      input_schema: {
        type:       "object",
        properties: {
          points: {
            type:  "array",
            items: { type: "string" },
            description: "One-sentence bullets, each a concrete overlap between the resume and the posting " \
                         "(a matching skill, relevant experience, or shared domain). Specific, not generic."
          }
        },
        required: %w[points]
      }
    }.freeze

    def initialize(application, client: nil)
      @application = application
      @client      = client
    end

    def call
      raise MissingInputError if @application.resume.blank? || posting_text.blank?

      message = client.messages.create(
        model:       MODEL,
        max_tokens:  1024,
        tools:       [ TOOL ],
        tool_choice: { type: :tool, name: TOOL[:name] },
        messages:    [ { role: "user", content: content } ]
      )

      block = message.content.find { |part| part.type == :tool_use }
      raise ExtractionError, "The AI couldn't find talking points. Try again." if block.nil?

      points = Array(block.input[:points] || block.input["points"])
        .map { |p| p.to_s.strip }
        .reject(&:blank?)
        .first(MAX_POINTS)
      raise ExtractionError, "The AI couldn't find talking points. Try again." if points.empty?

      points
    end

    private

    # Resume as a PDF document block, posting text beside it. The model reads both
    # and reports where they overlap.
    def content
      [
        { type: "document",
          source: { type: "base64", media_type: "application/pdf", data: Base64.strict_encode64(@application.resume) } },
        { type: "text", text: prompt }
      ]
    end

    def prompt
      <<~PROMPT
        The attached PDF is a candidate's resume. Below is a job posting they are applying to.

        Extract up to #{MAX_POINTS} short talking points the candidate could use in a cover letter:
        concrete overlaps between the resume and the posting: a matching skill, a relevant past
        role, a shared industry or product domain. One sentence each, specific and grounded in
        both documents. Do NOT invent experience the resume does not show, and do NOT write the
        letter; return only the bullets.

        Job posting:

        #{posting_text}
      PROMPT
    end

    # The snapshot captured at prefill is the richest source; notes is the
    # fallback for an application added by hand.
    def posting_text
      @application.posting_snapshot.presence || @application.notes.to_s
    end

    def client
      @client ||= begin
        api_key = ENV["ANTHROPIC_API_KEY"].to_s
        raise ConfigError, "AI features aren't configured on this server." if api_key.blank?

        Anthropic::Client.new(api_key: api_key)
      end
    end
  end
end
