require "uri"

# A crude "job board" derived from a posting URL's host — no extra column, just
# the `url` we already store. `from_url` returns the host minus a leading "www."
# (e.g. "https://www.linkedin.com/jobs/42" → "linkedin.com"); applications with
# no usable URL bucket under NONE. The host is the filter key; the frontend maps
# it to a friendly label ("linkedin.com" → "LinkedIn"). Deliberately host-only:
# it's a convenience filter, not a taxonomy.
module JobBoard
  NONE = "(none)".freeze

  def self.from_url(url)
    return nil if url.blank?

    host = URI.parse(url).host
    host&.sub(/\Awww\./i, "")&.downcase.presence
  rescue URI::InvalidURIError
    nil
  end
end
