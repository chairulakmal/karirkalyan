# Rate-limit auth endpoints to defend against brute-force and account spam.
#
# Storage: Rails.cache — :solid_cache_store in prod (Postgres-backed, see
# config/environments/production.rb), so throttle counters are shared across all
# Puma workers/processes; :memory_store in dev, :null_store in test (the
# throttling spec swaps in its own MemoryStore).
#
# Client IP: this file used to claim "req.ip respects Rails' trusted-proxy
# handling". It does not, and the difference was exploitable. Rack::Attack::Request
# subclasses Rack::Request and overrides neither #ip nor reads
# env["action_dispatch.remote_ip"], so req.ip is governed by Rack's own rules and
# NOT by config.action_dispatch.trusted_proxies (which this app never set anyway).
# Rack 3.2 reads the RFC-7239 `Forwarded:` header ahead of `X-Forwarded-For`, and
# Railway normalised the latter but did not strip the former, so any client could
# hand us the IP it wanted to be throttled as. The Cloudflare Tunnel this app now
# sits behind closes the hole structurally (SPEC.md § Production lessons), since
# a client has no path to the origin except through it, but the pin stays anyway:
#
#   REMOTE_ADDR 10.0.1.5 + XFF 203.0.113.9 + "Forwarded: for=1.2.3.4"  =>  1.2.3.4
#
# Rotating that header per request gave a fresh throttle key every time, which
# defeated auth/sign_in, auth/passkey (the ONLY limit on an unauthenticated
# endpoint that does bcrypt work and writes a cache row per call), and ai/prefill's
# per-IP leg. Pinning the priority to the header our proxy actually sets closes it.
# This is a global Rack setting, so ActionDispatch's request.ip inherits the same
# hardening, which is what we want.
Rack::Request.forwarded_priority = [ :x_forwarded ]

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

  # Normalised target email from a sign-in request, or nil.
  #
  # This has to recognise every encoding Devise will actually authenticate from,
  # not just the one the frontend happens to send. It previously read the body
  # through JSON.parse alone, so a form-encoded, multipart or query-string
  # sign-in (all of which authenticate exactly the same) raised, hit the rescue,
  # and returned nil. A nil discriminator makes Rack::Attack count nothing and
  # throttle nothing, so the two throttles below fell open on any request that
  # simply declined to send JSON.
  #
  # That mattered more here than it would elsewhere: Devise :lockable is not
  # enabled (app/models/user.rb), so these two are the ONLY account-level
  # brute-force defence in the system. The per-IP throttle still fired, which
  # left an attacker with N addresses 5N guesses a minute against one named
  # account and no account-level ceiling at all: precisely the distributed case
  # the email key exists to cover, against targets (demo@karirkalyan.com) the
  # README publishes.
  #
  # The rule this is an instance of: a guard must key off what the request
  # MEANS, never off an encoding the client chooses. Anything reading a body
  # here owes both branches.
  #
  # JSON first, from rack.input directly because Rack's form parsing does not
  # cover it, rewound so Rails can re-read the body downstream. Then Rack's own
  # parsing, which covers form-encoded and multipart bodies and the query
  # string, since #params merges GET over POST.
  def self.sign_in_email(req)
    return unless normalized_path(req) == "/api/v1/auth/sign_in" && req.post?

    email = json_sign_in_email(req) || rack_sign_in_email(req)
    email.is_a?(String) ? email.strip.downcase.presence : nil
  end

  def self.json_sign_in_email(req)
    body = req.body.read
    req.body.rewind
    JSON.parse(body).dig("user", "email")
  rescue StandardError
    nil
  end
  private_class_method :json_sign_in_email

  # `params["user"]` is whatever the client sent, so it is not necessarily a
  # Hash: `?user=x` makes it a String, and #dig raises TypeError on those.
  def self.rack_sign_in_email(req)
    req.params.dig("user", "email")
  rescue StandardError
    nil
  end
  private_class_method :rack_sign_in_email

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
  #
  # "The neighbours keep their own treatment" was true of prefill and false of the other two:
  # transition and talking_points fell through this anchor into *no* throttle at all, which is
  # the fail-open the header comment warns about, landing on routes that comment predates. Both
  # now have their own discriminators below.
  APPLICATION_MEMBER_PATH = %r{\A/api/v1/applications/\d+\z}
  APPLICATION_TRANSITION_PATH = %r{\A/api/v1/applications/\d+/transition\z}
  APPLICATION_TALKING_POINTS_PATH = %r{\A/api/v1/applications/\d+/talking_points\z}

  def self.application_write_user_id(req)
    path = normalized_path(req)
    write = (req.post? && path == "/api/v1/applications") ||
            ((req.patch? || req.put?) && path.match?(APPLICATION_MEMBER_PATH))
    return unless write

    account_id(req)
  end

  # Status changes. Every one writes a timeline_entries row, and the FSM permits an
  # unbounded cycle (applied -> rejected -> applied -> ...), so this is a write loop
  # with no natural ceiling. Per-account, like the writes above, because the cost is
  # a function of whose data grows.
  def self.application_transition_user_id(req)
    return unless req.patch? && normalized_path(req).match?(APPLICATION_TRANSITION_PATH)

    account_id(req)
  end

  # The most expensive call in the app: it base64-encodes the stored resume PDF
  # inline (up to 1 MB) into a paid Claude request, inside a Puma request thread.
  # It had no throttle of any kind, per-IP or per-account, while prefill (which is
  # cheaper) had four. The shared demo account's credentials are published by
  # design, so "a user can overspend their own budget" was really "anyone can".
  def self.talking_points_user_id(req)
    return unless req.post? && normalized_path(req).match?(APPLICATION_TALKING_POINTS_PATH)

    account_id(req)
  end

  # The two enrollment-side passkey writes. DELETE is absent for the same
  # reason it is on applications: it gives capacity back.
  def self.passkey_write_user_id(req)
    return unless req.post? &&
                  [ "/api/v1/passkeys", "/api/v1/passkeys/options" ].include?(normalized_path(req))

    account_id(req)
  end

  # The push-subscription write. Same shape as passkeys: POST only, DELETE
  # gives capacity back and the public_key GET is a cheap read.
  def self.push_subscription_write_user_id(req)
    return unless req.post? && normalized_path(req) == "/api/v1/push_subscriptions"

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

  # Transitions, matching the write numbers above: the same shape of authenticated
  # write, on the same records. As with uploads, this bounds the rate and not the
  # total: TimelineEntry::NOTE_MAX_LENGTH bounds how much each one can carry.
  throttle("applications/transition/minute", limit: 30, period: 1.minute) { |req| application_transition_user_id(req) }
  throttle("applications/transition/hour", limit: 300, period: 1.hour) { |req| application_transition_user_id(req) }

  # Talking points: the prefill posture and tighter numbers, because each call ships
  # a PDF as well as a prompt. Per-account only, and deliberately not per-IP: the
  # endpoint requires a decodable JWT, so there is no unauthenticated leg for a
  # coarse IP cap to protect.
  throttle("ai/talking_points/account/minute", limit: 5, period: 1.minute) { |req| talking_points_user_id(req) }
  throttle("ai/talking_points/account/hour", limit: 30, period: 1.hour) { |req| talking_points_user_id(req) }
  throttle("ai/talking_points/account/day", limit: 60, period: 1.day) { |req| talking_points_user_id(req) }

  # Passkey enrollment is an authenticated write like the two above, and the
  # shared demo login makes every authenticated write a public one. The rate
  # is bounded here; the total is bounded by Credential::MAX_PER_USER, because
  # a throttle cannot bound a total — every window resets (SPEC.md § Passkeys).
  throttle("passkeys/write/minute", limit: 10, period: 1.minute) { |req| passkey_write_user_id(req) }
  throttle("passkeys/write/hour", limit: 30, period: 1.hour) { |req| passkey_write_user_id(req) }

  # Push subscriptions: the same posture, the same numbers, the same division
  # of labour — this bounds the rate, PushSubscription::MAX_PER_USER bounds
  # the total (SPEC.md § Push notifications).
  throttle("push_subscriptions/write/minute", limit: 10, period: 1.minute) { |req| push_subscription_write_user_id(req) }
  throttle("push_subscriptions/write/hour", limit: 30, period: 1.hour) { |req| push_subscription_write_user_id(req) }

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
