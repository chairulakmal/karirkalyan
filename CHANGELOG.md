# Changelog

Shipped work, newest first. Branch/PR names note where each change landed.
Open work lives in [`TODO.md`](TODO.md).

---

## v1.0.1 — 2026-07-10

Tagged at `2980300`. Scoped to a dedicated security pass over the API and frontend
plus the fixes it produced. Severity was triaged for a single-user portfolio app
behind Railway/Cloudflare, not a multi-tenant SaaS.

### Security

- **[med] Account-level brute-force backstop** — throttling was IP-only
  (`api/config/initializers/rack_attack.rb`, `sign_in` 5/min per IP), which a botnet or
  shared NAT egress defeats. Added email-keyed throttles that cap guesses against a
  *single* account across all IPs (`10/5min` + `50/hour`). Reads and rewinds `rack.input`
  in the initializer to get the email from the JSON body (`.sign_in_email`), so it works
  at the Rack layer without a controller `before_action`.
  *(chore/security-review-v1.0.1, PR #46)*
- **[med] Login-CSRF on the auth route handlers** — `web/app/api/auth/session/route.ts`
  and `.../register/route.ts` parsed a JSON body and forwarded it to Rails with no `Origin`
  check. Next's built-in CSRF protection covers Server Actions, not route handlers, so a
  cross-site form/fetch could drive a login (classic login-CSRF) or sign-up. Added an
  `Origin` allowlist check (`web/app/lib/csrf.ts`, same-origin by default, `ALLOWED_ORIGIN`
  to pin) on both `POST` handlers and the session `DELETE`; cross-origin → 403.
  *(chore/security-review-v1.0.1, 885e50b)*
- **[med] Demo account was shared and unbounded** — the "Try demo" button signs every
  visitor into one shared user with credentials hardcoded in the client bundle
  (`web/app/(auth)/sign-in/sign-in-form.tsx:62`). That much is inherent to a public demo;
  two things made it worse than intended:
    1. `Demo::ResetService` was **never invoked** — no route, no job — so the shared
       account accumulated every visitor's data indefinitely. Added `DemoResetJob`,
       scheduled hourly in `config/recurring.yml`. *(885e50b)*
    2. The demo user had the **same capabilities as a real user**, including the paid AI
       prefill endpoint (Claude call + outbound fetch), rate-limited by IP only — so
       distributed use of the demo login was an uncapped cost/abuse vector. Added
       **per-account** prefill caps for *every* user (10/min, 50/hour, 100/day), keyed on
       the JWT `sub` decoded in `rack_attack.rb` (`.prefill_user_id`). The demo account is
       now bounded like any other. *(chore/security-review-v1.0.1)*
- **[low] Tightened CSP** — `web/next.config.ts` shipped `script-src 'unsafe-inline'` for
  the Next bootstrap. Moved the CSP to a per-request nonce in `web/proxy.ts`
  (`script-src 'self' 'nonce-…' 'strict-dynamic'`, dropped `'unsafe-inline'`; dev keeps
  `'unsafe-eval'` for HMR). Because nonces are only applied during SSR, `await connection()`
  in the root layout opts the whole app into dynamic rendering so every page's scripts get
  the nonce — verified via `next build` that `/`, `/sign-up`, `/applications/new` and the
  404 render dynamically (they were static before). *(chore/security-review-v1.0.1)*

### Regressions introduced and fixed within the release

- **Host-authorization anchoring — a withdrawn finding that took production down.**
  The review claimed `/.*\.railway\.app/` accepted `foo.railway.app.attacker.com`. It never
  did: `HostAuthorization::Permissions#sanitize_regexp` wraps every pattern as
  `/\A#{pattern}(:\d+)?\z/`, so Rails anchors it for you and appends an optional port group.
  Adding our own `\z` made that port group unmatchable, blocking `api.railway.internal:3001`
  — the `Host` on every internal web→api call — so the API 403'd every request. The session
  route was collapsing all non-OK upstream statuses into `401`, so it surfaced as "Invalid
  email or password" for every user, including the demo account.

  Fixed before the tag: patterns un-anchored and moved to `api/app/lib/allowed_hosts.rb`
  with a regression spec driven through the real `Permissions` class; the session route now
  only reports `401` on a genuine upstream `401`. *(fix/host-authorization-regression, PR #47)*

  **Lesson:** verify a framework's own normalization before "hardening" a pattern it owns.

### Docs

- **JWT semantics documented** — single JTI per user via `JTIMatcher` (`api/app/models/user.rb`),
  so sign-out revokes **all** devices; 1-day expiry, no refresh flow. Added an
  `## Authentication` section to `README.md`, mirrored in `README.ja.md`, spelling out the
  single-session behaviour so it isn't mistaken for a bug. *(4b5038a)*

### Reviewed and found sound — no action taken

Recorded so a re-review doesn't re-litigate them. File references are `path:line` at `9708df6`.

- **SSRF surface (AI prefill)** — `url_prefill_service.rb` resolves, validates every
  resolved address against loopback/private/link-local + extra blocked ranges, pins the
  connection to the validated IP (`http.ipaddr`), restricts to ports 80/443, and
  re-validates on each redirect hop. The DNS-rebinding TOCTOU fixed in PR #39 holds.
- **Upload handling** — size checked from multipart metadata *before* `.read`
  (`applications_controller.rb:154`), 1 MB model cap, and PDF magic-byte validation
  (`application.rb:36`). Downloads are `current_user`-scoped, `nosniff`, PDF-only.
- **Tenant isolation / IDOR** — every record is reached through `current_user.applications`
  (`set_application`, dashboard, list), so cross-user access 404s. `status` is not
  mass-assignable; entry states are restricted and later changes go through `TransitionService`.
- **Password logging** — checked the actual Rails source: AC instrumentation logs
  `request.filtered_parameters`, and `filter_parameter_logging.rb` filters `passw`/`email`,
  so lograge (`params: event.payload[:params]`) does not leak credentials.
- **Sign-up auth** — the global `authenticate_user!` is a no-op inside Devise controllers,
  so registration is reachable (verified via `spec/requests/api/v1/auth_spec.rb`, green).

---

## v1.0.0 — 2026-07-10

Tagged at `e595b68`. First release: the initial security / performance / UX review pass
and every fix it produced.

### Stack

- **Adopted Solid Queue + Solid Cache instead of re-enabling Sidekiq/Redis** — runs on the
  existing Postgres, zero new Railway services. One change fixed four findings: recurring
  `FollowUpReminderJob` (Solid Queue recurring tasks), shared Rack::Attack store
  (Solid Cache), durable `deliver_later`, and removed the dead-feature caveat.
  *(feat/solid-queue-cache, PR #42 — requires `SOLID_QUEUE_IN_PUMA=true` on the Railway api service)*
- **DB pool sized for Solid Queue threads inside Puma** — `max_connections` is
  `RAILS_MAX_THREADS + 6`; a smaller pool made Solid Queue exit and take Puma with it.
  *(fix/solid-queue-db-pool, PR #43)*

### Security

- **Proxy matcher redirected crawler metadata to /sign-in** — `/robots.txt`, `/sitemap.xml`,
  `/llms.txt` weren't excluded in `web/proxy.ts`, so Googlebot got a 307 to sign-in and the
  whole SEO setup was unreachable. *(fix/review-quick-wins, PR #37)*
- **No security headers** — `web/next.config.ts` shipped no CSP, frame-ancestors, HSTS,
  Referrer-Policy, or Permissions-Policy. Added a baseline set. *(fix/review-quick-wins, PR #37)*
- **SSRF DNS-rebinding TOCTOU** — `api/app/services/applications/url_prefill_service.rb`
  validated IPs from `Resolv.getaddresses` but `Net::HTTP` re-resolved; now connects to the
  validated IP (`http.ipaddr`) and restricts to ports 80/443. *(fix/backend-hardening, PR #39)*
- **Upload memory DoS** — `applications_controller.rb#application_params` called `.read`
  before the 1 MB model validation; checks `.size` first. *(fix/backend-hardening, PR #39)*
- **Rate-limit counters were per-Puma-worker** — Rack::Attack used `:memory_store` in prod;
  moved to the shared Solid Cache store. *(feat/solid-queue-cache, PR #42)*

### Performance

- **Composite index `(user_id, created_at DESC)` on applications** — the list endpoint filters
  by user, orders and cursor-paginates on `created_at`; dropped the now-redundant
  single-column `user_id` index. *(fix/review-quick-wins, PR #37)*

### Correctness / robustness

- **Sign-up 500s if the welcome email fails** — `registrations_controller.rb` used
  `deliver_now` after save with `raise_delivery_errors = true`; user existed but got an error,
  and retry said "email taken". Now `deliver_later`. *(fix/backend-hardening, PR #39)*
- **Reminder timezone off-by-one** — `follow_up_reminder_job.rb` compared `DATE(follow_up_at)`
  in UTC; JST users got reminders a day early. Zone-aware day range + `config.time_zone`.
  *(fix/backend-hardening, PR #39)*
- **Reminder feature was dead in prod** — no scheduler since Sidekiq was removed.
  *(feat/solid-queue-cache, PR #42)*
- **Reminder idempotency race** — `exists?`-then-`create!` isn't atomic; now rescues
  `ActiveRecord::RecordNotUnique` for true exactly-once. *(feat/solid-queue-cache, PR #42)*

### UX

- **Expired session dead-ended on error boxes** — no 401 handling anywhere; `apiFetch` now
  bounces through `/api/auth/expired`, which clears the cookie and redirects to
  `/sign-in?expired=1` with a notice. *(fix/review-quick-wins, PR #37)*
- **No `error.tsx` / `loading.tsx` / `not-found.tsx`** — network failures hit the raw Next
  overlay, navigations blocked with no fallback, `notFound()` rendered the bare 404.
  *(fix/review-quick-wins, PR #37)*
- **409 conflicts unrecoverable** — stale `lock_version` was kept after a conflict so retries
  looped; now shows a friendly message + `router.refresh()`. *(fix/frontend-ux-polish, PR #38)*
- **Touch targets ~24px** — status filter chips and transition buttons were below the 44px
  guideline. *(fix/frontend-ux-polish, PR #38)*
- **Statuses were unexplained** — added in-context help for the FSM states, plus a UI polish
  round. *(feat/frontend-status-help, PR #44)*

### UI & accessibility

- **Dashboard stat tooltip was hover-only on a non-focusable span** — unreachable by
  keyboard/touch; now a button with `aria-describedby`. *(fix/frontend-ux-polish, PR #38)*

### Code quality

- **`Paginated<T>` typed three times** — hoisted into `web/app/lib/types.ts`.
  *(fix/frontend-ux-polish, PR #38)*
- **Three copy-pasted `Field` components** — extracted `web/app/components/field.tsx`.
  *(fix/frontend-ux-polish, PR #38)*
- **Server-action return types lied** — `createApplication`/`deleteApplication` were typed
  `Promise<ActionResult>` but ended in `redirect()` (throws). *(fix/frontend-ux-polish, PR #38)*
- **Client re-sort fought cursor pagination** — `applications-list.tsx` re-sorted accumulated
  pages by status, interleaving items after "Load more". *(fix/frontend-ux-polish, PR #38)*
- **Dead Redis config in CI** — `.github/workflows/api.yml` provisioned `redis:8` + `REDIS_URL`
  that nothing used. *(fix/backend-hardening, PR #39)*
- **E2E status assertions were unscoped** — narrowed to the header badge.
  *(fix/e2e-status-badge-selector, PR #45)*
