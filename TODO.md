# TODO

Roadmap and open findings. Items are grouped by release; everything under
**Shipped** is done and tagged.

**Current release: `v1.0.0`** — tagged 2026-07-10 at `e595b68`.
**Next release: `v1.0.1`** — security review and the fixes it produces.

---

## v1.0.1 — Security review & fixes (next)

`v1.0.1` is scoped to a dedicated security pass over the API and frontend, plus the
fixes it produces. No features; anything non-security that surfaces goes to the backlog.

### Planned work

- [x] **Run a focused security review** of `api/` and `web/` — auth flows, the JWT
  lifecycle, upload handling, the AI prefill SSRF surface, and the Next.js route
  handlers. Done 2026-07-10; findings recorded below. Severity is triaged for a
  single-user portfolio app behind Railway/Cloudflare, not a multi-tenant SaaS.

### Findings to fix

Ordered by severity. File references are `path:line` at `9708df6`.

- [ ] **[med] No account-level brute-force backstop** — throttling is IP-only
  (`api/config/initializers/rack_attack.rb:19`, `sign_in` 5/min per IP). A botnet or a
  shared NAT egress defeats it; there's no per-account lockout or email-keyed throttle.
  Add Devise `:lockable`, or throttle on the email once the JSON body is parsed
  (a controller-level `before_action` throttle sees `params`, unlike the Rack layer —
  see the "throttle by IP only" note in the initializer). Confirmed.
- [x] **[med] Login-CSRF on the auth route handlers** — `web/app/api/auth/session/route.ts`
  and `.../register/route.ts` parsed a JSON body and forwarded it to Rails with no `Origin`
  check. Next's built-in CSRF protection covers Server Actions, not route handlers, so a
  cross-site form/fetch could drive a login (classic login-CSRF) or sign-up. Added an
  `Origin` allowlist check (`web/app/lib/csrf.ts`, same-origin by default, `ALLOWED_ORIGIN`
  to pin) on both `POST` handlers and the session `DELETE`; cross-origin → 403.
  *(chore/security-review-v1.0.1, 885e50b)*
- [ ] **[med] Demo account is a shared, writable account** (partly fixed) — the "Try demo"
  button signs every visitor into one shared user with credentials hardcoded in the
  client bundle (`web/app/(auth)/sign-in/sign-in-form.tsx:62`). That much is inherent to
  a public demo, but two things made it worse than intended:
    1. ~~`Demo::ResetService` was **never invoked** — no route, no job — so the shared
       account accumulated every visitor's data indefinitely.~~ **Fixed:** added
       `DemoResetJob`, scheduled hourly in `config/recurring.yml`.
       *(chore/security-review-v1.0.1, 885e50b)*
    2. **Still open:** the demo user has the **same capabilities as a real user**, including
       the paid AI prefill endpoint (Claude call + outbound fetch), rate-limited by IP only.
       Distributed use of the demo login is an uncapped cost/abuse vector. Gate AI prefill
       for the demo user or give the demo account a tighter per-account throttle.
- [ ] **[low] Tighten CSP** — `web/next.config.ts:9` still ships `script-src 'unsafe-inline'`
  for the Next bootstrap. Move to a nonce-based policy (per-request nonce via `proxy.ts`,
  drop `'unsafe-inline'`). `object-src 'none'`, `frame-ancestors 'none'`, and `base-uri`
  are already set, so this is the last soft spot. Confirmed.
- [ ] **[low] Unanchored host-authorization regexes** — `api/config/environments/production.rb:79-80`
  use `/.*\.railway\.app/` and `/.*\.railway\.internal/` with no `\z` anchor, so
  `foo.railway.app.attacker.com` is accepted as a trusted Host. Impact is limited here
  (mailer links use `FRONTEND_URL`, not the request host), but anchor them
  (`/\A([a-z0-9-]+\.)*railway\.app\z/`) while touching this file. New finding.
- [ ] **[doc] Document JWT semantics** — single JTI per user via `JTIMatcher`
  (`api/app/models/user.rb:2`), so sign-out revokes **all** devices; 1-day expiry, no
  refresh flow (`api/config/initializers/devise.rb:20-25`). Fine as designed — note it in
  the README so the single-session behaviour isn't mistaken for a bug. Confirmed.

### Reviewed and found sound (no action)

Recorded so a re-review doesn't re-litigate them:

- **SSRF surface (AI prefill)** — `url_prefill_service.rb` resolves, validates every
  resolved address against loopback/private/link-local + extra blocked ranges, pins the
  connection to the validated IP (`http.ipaddr`), restricts to ports 80/443, and
  re-validates on each redirect hop. The DNS-rebinding TOCTOU fixed in PR #39 holds.
- **Upload handling** — size checked from multipart metadata *before* `.read`
  (`applications_controller.rb:154`), 1 MB model cap, and PDF magic-byte validation
  (`application.rb:36`). Downloads are `current_user`-scoped, `nosniff`, PDF-only.
- **Tenant isolation / IDOR** — every record is reached through
  `current_user.applications` (`set_application`, dashboard, list), so cross-user access
  404s. `status` is not mass-assignable; entry states are restricted and later changes go
  through `TransitionService`.
- **Password logging** — checked the actual Rails source: AC instrumentation logs
  `request.filtered_parameters`, and `filter_parameter_logging.rb` filters `passw`/`email`,
  so lograge (`params: event.payload[:params]`) does not leak credentials.
- **Sign-up auth** — the global `authenticate_user!` is a no-op inside Devise controllers,
  so registration is reachable (verified via `spec/requests/api/v1/auth_spec.rb`, green).

---

## Backlog (post-1.0.1)

### Performance

- [ ] **Font payload** — 3 families / ~15 files in `web/app/layout.tsx`; switch Fraunces &
  Manrope to variable builds or trim unused weights.
- [ ] **`timeline_entries` offer-lookup index** — dashboard subquery filters
  `to_status = 'offer'` unindexed; add `(to_status, application_id, created_at)` if it grows.
- [ ] **Fold `/me` into the dashboard payload** (or cache it) — extra uncached request per visit.

### UX

- [ ] **No optimistic UI** — pending states are hand-rolled `useTransition` flags;
  consider `useOptimistic` / `useFormStatus` for transitions.

### UI & accessibility

- [ ] **Danger colors bypass the token system** — Tailwind `red-*` improvised everywhere;
  add a `--color-danger` token to `design/assets/tokens.css` + `globals.css`.
- [ ] **No dark mode** — `color-scheme: light` hardcoded while dark icon assets exist in
  `design/`; decide to ship it or remove the unused assets.

### Code quality

- [ ] **Extract `Applications::ListQuery`** — `ApplicationsController#index` mixes
  filtering, cursor decoding, and serialization inline.
- [ ] **`API_BASE` vs `API_BASE_URL`** — two near-identical names for different things
  (`web/app/lib/api.ts` vs `links.ts`); rename or comment.

### Feature ideas

- [ ] **Japanese UI (i18n)** — the most persuasive addition for a Tokyo-market portfolio.
- [ ] **Kanban board view** of the FSM states — demos the state machine far better than a list.
- [ ] **Email verification** (Devise `:confirmable`).
- [ ] **CSV export** of applications.
- [ ] **Follow-up digest email** — Solid Queue now landed; the mailer already exists.

---

## Shipped in v1.0.0

Tagged 2026-07-10. Branch/PR names note where each fix landed.

### Stack

- [x] **Adopt Solid Queue + Solid Cache instead of re-enabling Sidekiq/Redis** — runs on
  the existing Postgres, zero new Railway services. One change fixed four findings:
  recurring `FollowUpReminderJob` (Solid Queue recurring tasks), shared Rack::Attack store
  (Solid Cache), durable `deliver_later`, and removed the dead-feature caveat.
  *(feat/solid-queue-cache, PR #42 — requires `SOLID_QUEUE_IN_PUMA=true` on the Railway api service)*
- [x] **DB pool sized for Solid Queue threads inside Puma** — `max_connections` is
  `RAILS_MAX_THREADS + 6`; a smaller pool made Solid Queue exit and take Puma with it.
  *(fix/solid-queue-db-pool, PR #43)*

### Security

- [x] **Proxy matcher redirected crawler metadata to /sign-in** — `/robots.txt`,
  `/sitemap.xml`, `/llms.txt` weren't excluded in `web/proxy.ts`, so Googlebot got a 307
  to sign-in and the whole SEO setup was unreachable. *(fix/review-quick-wins, PR #37)*
- [x] **No security headers** — `web/next.config.ts` shipped no CSP, frame-ancestors,
  HSTS, Referrer-Policy, or Permissions-Policy. Added a baseline set. *(fix/review-quick-wins, PR #37)*
- [x] **SSRF DNS-rebinding TOCTOU** — `api/app/services/applications/url_prefill_service.rb`
  validated IPs from `Resolv.getaddresses` but `Net::HTTP` re-resolved; now connects to the
  validated IP (`http.ipaddr`) and restricts to ports 80/443. *(fix/backend-hardening, PR #39)*
- [x] **Upload memory DoS** — `applications_controller.rb#application_params` called
  `.read` before the 1 MB model validation; checks `.size` first. *(fix/backend-hardening, PR #39)*
- [x] **Rate-limit counters were per-Puma-worker** — Rack::Attack used `:memory_store` in
  prod; moved to the shared Solid Cache store. *(feat/solid-queue-cache, PR #42)*

### Performance

- [x] **Composite index `(user_id, created_at DESC)` on applications** — the list endpoint
  filters by user, orders and cursor-paginates on `created_at`; dropped the now-redundant
  single-column `user_id` index. *(fix/review-quick-wins, PR #37)*

### Correctness / robustness

- [x] **Sign-up 500s if the welcome email fails** — `registrations_controller.rb` used
  `deliver_now` after save with `raise_delivery_errors = true`; user existed but got an
  error, and retry said "email taken". Now `deliver_later`. *(fix/backend-hardening, PR #39)*
- [x] **Reminder timezone off-by-one** — `follow_up_reminder_job.rb` compared
  `DATE(follow_up_at)` in UTC; JST users got reminders a day early. Zone-aware day range +
  `config.time_zone`. *(fix/backend-hardening, PR #39)*
- [x] **Reminder feature was dead in prod** — no scheduler since Sidekiq was removed.
  *(feat/solid-queue-cache, PR #42)*
- [x] **Reminder idempotency race** — `exists?`-then-`create!` isn't atomic; now rescues
  `ActiveRecord::RecordNotUnique` for true exactly-once. *(feat/solid-queue-cache, PR #42)*

### UX

- [x] **Expired session dead-ended on error boxes** — no 401 handling anywhere; `apiFetch`
  now bounces through `/api/auth/expired`, which clears the cookie and redirects to
  `/sign-in?expired=1` with a notice. *(fix/review-quick-wins, PR #37)*
- [x] **No `error.tsx` / `loading.tsx` / `not-found.tsx`** — network failures hit the raw
  Next overlay, navigations blocked with no fallback, `notFound()` rendered the bare 404.
  *(fix/review-quick-wins, PR #37)*
- [x] **409 conflicts unrecoverable** — stale `lock_version` was kept after a conflict so
  retries looped; now shows a friendly message + `router.refresh()`. *(fix/frontend-ux-polish, PR #38)*
- [x] **Touch targets ~24px** — status filter chips and transition buttons were below the
  44px guideline. *(fix/frontend-ux-polish, PR #38)*
- [x] **Statuses were unexplained** — added in-context help for the FSM states, plus a UI
  polish round. *(feat/frontend-status-help, PR #44)*

### UI & accessibility

- [x] **Dashboard stat tooltip was hover-only on a non-focusable span** — unreachable by
  keyboard/touch; now a button with `aria-describedby`. *(fix/frontend-ux-polish, PR #38)*

### Code quality

- [x] **`Paginated<T>` typed three times** — hoisted into `web/app/lib/types.ts`.
  *(fix/frontend-ux-polish, PR #38)*
- [x] **Three copy-pasted `Field` components** — extracted `web/app/components/field.tsx`.
  *(fix/frontend-ux-polish, PR #38)*
- [x] **Server-action return types lied** — `createApplication`/`deleteApplication` were
  typed `Promise<ActionResult>` but ended in `redirect()` (throws). *(fix/frontend-ux-polish, PR #38)*
- [x] **Client re-sort fought cursor pagination** — `applications-list.tsx` re-sorted
  accumulated pages by status, interleaving items after "Load more". *(fix/frontend-ux-polish, PR #38)*
- [x] **Dead Redis config in CI** — `.github/workflows/api.yml` provisioned `redis:8` +
  `REDIS_URL` that nothing used. *(fix/backend-hardening, PR #39)*
- [x] **E2E status assertions were unscoped** — narrowed to the header badge.
  *(fix/e2e-status-badge-selector, PR #45)*
