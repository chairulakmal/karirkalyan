# Rate-limit auth endpoints to defend against brute-force and account spam.
#
# Storage: Rails.cache — :solid_cache_store in prod (Postgres-backed, see
# config/environments/production.rb), so throttle counters are shared across all
# Puma workers/processes; :memory_store in dev, :null_store in test (the
# throttling spec swaps in its own MemoryStore).
#
# req.ip respects Rails' trusted-proxy handling, so behind Railway/Cloudflare the
# real client IP is used (not the proxy's).
#
# JSON-bodied requests don't expose `req.params` inside Rack middleware (Rails
# parses the body downstream), so where we need a value from the body — the
# sign-in email, the prefill caller's account — we read and rewind rack.input
# ourselves (see .sign_in_email / .prefill_user_id below).
class Rack::Attack
  Rack::Attack.cache.store = Rails.cache

  # Off by default in test; specific throttling specs flip this back on.
  Rack::Attack.enabled = !Rails.env.test?

  # The request path as *Rails* will route it, not as the client typed it.
  #
  # Rack::Attack runs above the router, so req.path is the raw PATH_INFO. Rails normalises
  # afterwards and routes far more strings than a naive == will match: `resources` generates
  # (.:format), and Journey tolerates trailing and duplicate slashes. All of these reach an
  # action — verified with recognize_path, not assumed:
  #
  #   POST  /api/v1/auth/sign_in.json      => auth/sessions#create
  #   POST  /api/v1/applications/          => applications#create
  #   PATCH /api/v1/applications/12.json   => applications#update
  #   PATCH /api/v1/applications//12       => applications#update
  #
  # A guard keyed on req.path returns nil for every one of them, and a nil key means no
  # counter and no limit — the guard fails *open*, so the throttle is opt-out by suffix.
  # squeeze first, so //applications/12.json collapses before the extension is stripped; the
  # (?<=.) lookbehind keeps a bare "/" from normalising to "". Memoised on the env like
  # account_id, since several throttles share a request. See SPEC.md § Security.
  def self.normalized_path(req)
    req.env.fetch("rack_attack.normalized_path") do
      req.env["rack_attack.normalized_path"] =
        req.path.squeeze("/").sub(/\.[A-Za-z0-9]+\z/, "").sub(%r{(?<=.)/\z}, "")
    end
  end

  # Normalised target email from a sign-in request's JSON body, or nil. Reads
  # rack.input directly (form parsing doesn't cover JSON) and rewinds it so
  # Rails can re-read the body downstream.
  def self.sign_in_email(req)
    return unless normalized_path(req) == "/api/v1/auth/sign_in" && req.post?

    body = req.body.read
    req.body.rewind
    email = JSON.parse(body).dig("user", "email")
    email.is_a?(String) ? email.strip.downcase.presence : nil
  rescue StandardError
    nil
  end

  # Authenticated caller's id (JWT `sub`), decoded straight from the Authorization
  # header so the endpoints below can cap per-account, not just per-IP. Memoised on
  # the Rack env so the several throttles sharing a request decode once.
  def self.account_id(req)
    req.env.fetch("rack_attack.account_id") do
      req.env["rack_attack.account_id"] = begin
        token = Warden::JWTAuth::HeaderParser.from_env(req.env)
        token && Warden::JWTAuth::TokenDecoder.new.call(token)["sub"]
      rescue StandardError
        nil
      end
    end
  end

  def self.prefill_user_id(req)
    return unless normalized_path(req) == "/api/v1/applications/prefill" && req.post?

    account_id(req)
  end

  def self.export_user_id(req)
    return unless normalized_path(req).start_with?("/api/v1/exports/") && req.get?

    account_id(req)
  end

  # The two requests that can carry a PDF: creating an application, and updating one. Anchored
  # tightly so the neighbours keep their own treatment — POST /applications/prefill is not the
  # collection path and has its own caps above, and .../:id/transition fails the /\d+\z anchor.
  # DELETE is absent on purpose: it is the one write that gives storage back.
  APPLICATION_MEMBER_PATH = %r{\A/api/v1/applications/\d+\z}

  def self.application_write_user_id(req)
    path = normalized_path(req)
    write = (req.post? && path == "/api/v1/applications") ||
            ((req.patch? || req.put?) && path.match?(APPLICATION_MEMBER_PATH))
    return unless write

    account_id(req)
  end

  throttle("auth/sign_in", limit: 5, period: 1.minute) do |req|
    req.ip if normalized_path(req) == "/api/v1/auth/sign_in" && req.post?
  end

  # Account-level brute-force backstop: caps guesses against a *single* email
  # across all IPs, so a distributed (IP-rotating) attack can't bypass the
  # per-IP limit above. Every attempt counts, not just failures.
  throttle("auth/sign_in/email", limit: 10, period: 5.minutes) { |req| sign_in_email(req) }
  throttle("auth/sign_in/email/hourly", limit: 50, period: 1.hour) { |req| sign_in_email(req) }

  # There is no auth/sign_up throttle because there is no sign-up endpoint — see
  # SPEC.md § Registration is closed. The unauthenticated writes left are sign_in
  # above and the passkey ceremony below.

  # Passkey sign-in, one per-IP family across both ceremony legs (options +
  # verify): a ceremony costs two requests, so 10/min is the same five
  # sign-ins a minute the password throttle allows. No email-keyed backstop
  # because there is no email in the request, and no guessing surface for one
  # to protect — an assertion is a signature over a server-issued challenge,
  # not a secret that enumeration erodes (SPEC.md § Passkeys).
  throttle("auth/passkey", limit: 10, period: 1.minute) do |req|
    req.ip if normalized_path(req).start_with?("/api/v1/auth/passkey") && req.post?
  end

  # AI URL pre-fill fans out to a paid Claude call + an outbound HTTP fetch.
  # Per-IP cap (coarse, also covers multi-account abuse from one IP)...
  throttle("ai/prefill", limit: 10, period: 1.minute) do |req|
    req.ip if normalized_path(req) == "/api/v1/applications/prefill" && req.post?
  end

  # ...plus per-account caps so every user (demo included) has a bounded spend:
  # 10/min, 50/hour, 100/day. A request whose token can't be decoded returns nil
  # here (no per-account throttle) — Devise 401s it before it reaches the endpoint.
  throttle("ai/prefill/account/minute", limit: 10, period: 1.minute) { |req| prefill_user_id(req) }
  throttle("ai/prefill/account/hour", limit: 50, period: 1.hour) { |req| prefill_user_id(req) }
  throttle("ai/prefill/account/day", limit: 100, period: 1.day) { |req| prefill_user_id(req) }

  # Exports are not a money vector — they are a *work* vector. /exports/account reads
  # every blob the user owns and assembles the zip in memory, so a signed-in client
  # looping it is the cheapest way to push this app over its memory ceiling. Capped
  # per-account rather than per-IP because the cost is a function of whose data is
  # being assembled, not of where the request came from.
  throttle("exports/account/minute", limit: 10, period: 1.minute) { |req| export_user_id(req) }
  throttle("exports/account/hour", limit: 60, period: 1.hour) { |req| export_user_id(req) }

  # The upload path. An upload overwrites (one bytea per application, no version history, 1 MB
  # cap), so a PATCH loop's storage stays flat — what it burns is CPU and write I/O, which is
  # what these bound. They do not bound *storage*: no throttle can, because every window resets.
  # Application::MAX_PER_USER is what does that job — see SPEC.md § Security.
  #
  # Every write to these paths counts, not only the ones carrying a file: telling them apart in
  # Rack means parsing a multipart body Rails has not parsed yet, to skip a counter increment on
  # a request that is cheap either way. 30/min is far above a human editing their applications.
  throttle("applications/write/minute", limit: 30, period: 1.minute) { |req| application_write_user_id(req) }
  throttle("applications/write/hour", limit: 300, period: 1.hour) { |req| application_write_user_id(req) }

  self.throttled_responder = lambda do |request|
    match_data  = request.env["rack.attack.match_data"] || {}
    retry_after = match_data[:period] || 60
    [
      429,
      { "Content-Type" => "application/json", "Retry-After" => retry_after.to_s },
      [ { error: "Too many requests. Retry after #{retry_after}s.", code: "rate_limited" }.to_json ]
    ]
  end
end
