module Exports
  # Turns an application's upcoming interview into a single-event iCalendar
  # (RFC 5545) file. Hand-written rather than a gem: the format is a handful of
  # CRLF-delimited lines and the whole surface is one VEVENT, so a dependency
  # would be more to audit than to write. SPEC.md § Data model (interview_at)
  # and § Exports.
  #
  # DTSTART is a UTC instant (the trailing Z), so the user's calendar renders it
  # in whatever zone the device is set to and we do no timezone math: the point
  # of storing the instant rather than a wall-clock-plus-zone.
  class InterviewCalendar
    # A calendar block a real interview rarely fits into a single minute; one
    # hour is the honest default duration when we only know the start.
    DEFAULT_DURATION = 1.hour

    def initialize(application)
      @application = application
    end

    # nil when there is nothing scheduled: the controller turns that into a 404
    # rather than shipping an empty calendar.
    def call
      return nil if application.interview_at.blank?

      lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//KarirKalyan//Interview//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        "UID:#{uid}",
        "DTSTAMP:#{utc(Time.current)}",
        "DTSTART:#{utc(application.interview_at)}",
        "DTEND:#{utc(application.interview_at + DEFAULT_DURATION)}",
        "SUMMARY:#{escape(summary)}",
        "DESCRIPTION:#{escape(description)}",
        "END:VEVENT",
        "END:VCALENDAR"
      ]

      # RFC 5545 lines are CRLF-delimited, and each is folded to <= 75 octets.
      lines.map { |line| fold(line) }.join("\r\n") + "\r\n"
    end

    def filename
      slug = Application.download_slug(application.company)
      [ slug.presence, "interview.ics" ].compact.join("-")
    end

    private

    attr_reader :application

    def summary
      "Interview: #{application.company} (#{application.role})"
    end

    def description
      parts = [ "Role: #{application.role}" ]
      parts << "Link: #{application.url}" if application.url.present?
      parts.join("\n")
    end

    # Stable per application, so re-importing after a reschedule updates the same
    # calendar event rather than creating a duplicate.
    def uid
      "interview-#{application.id}@karirkalyan"
    end

    def utc(time)
      time.utc.strftime("%Y%m%dT%H%M%SZ")
    end

    # RFC 5545 TEXT escaping: backslash, semicolon, comma, and newline.
    def escape(value)
      value.to_s
        .gsub("\\", "\\\\\\\\")
        .gsub(";", "\\;")
        .gsub(",", "\\,")
        .gsub("\n", "\\n")
    end

    # Content lines longer than 75 octets are folded: split on octet boundaries
    # with each continuation line beginning with a single space. Measured in
    # bytes, not characters, because a fold landing mid-multibyte-character is
    # malformed, and company/role are routinely Japanese here.
    def fold(line)
      bytes = line.b
      return line if bytes.bytesize <= 75

      chunks = []
      rest = bytes
      # First line: 75 octets. Continuations: 74 (the leading space counts).
      first, rest = take_octets(rest, 75)
      chunks << first
      until rest.empty?
        chunk, rest = take_octets(rest, 74)
        chunks << " #{chunk}"
      end
      chunks.join("\r\n").force_encoding("UTF-8")
    end

    # Takes up to `limit` octets without splitting a UTF-8 character: backs off
    # to the last whole-character boundary at or before the limit.
    def take_octets(bytes, limit)
      return [ bytes, "".b ] if bytes.bytesize <= limit

      cut = limit
      # A continuation byte is 10xxxxxx (0x80..0xBF); step back off one.
      cut -= 1 while cut.positive? && (bytes.getbyte(cut) & 0xC0) == 0x80
      [ bytes.byteslice(0, cut), bytes.byteslice(cut..) ]
    end
  end
end
