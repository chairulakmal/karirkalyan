# Changelog

Shipped work, newest first. Branch/PR names note where each change landed.
Open work lives in [`TODO.md`](TODO.md).

---

## Unreleased — ships as v1.3.0

Ghost prediction: the dashboard now says which applications have almost certainly gone dead.
Not yet tagged — the "Tagged at" line goes in when it is. *(feat/ghost-prediction)*

### Ghost prediction

- **`Applications::GhostRiskQuery`** (`api/app/queries/` — a new directory) flags any
  application sitting in `applied` or `phone_screen` that has been silent longer than the
  user's **own p90 reply time** for that stage. No migration, no new column: the dwell times
  are reconstructed from the `timeline_entries` audit trail with a window function, which is
  the whole point — the FSM's audit log stops being bookkeeping and becomes a feature.
- **Each timeline row is read as an *exit*, not an entry.** Creation writes no timeline entry,
  so an application added straight as `applied` — the common case — has no `to_status =
  'applied'` row to date the stage from. The stage's start comes from
  `COALESCE(LAG(created_at) OVER (…), applied_at, created_at)`, which also makes backdated
  `applied_at` and `ghosted → applied` revivals fall out with no special cases.
- **Cold start is handled, and admitted to.** Below five recorded replies at a stage the
  threshold is a global default (21 days for `applied`, 14 for `phone_screen`), and the
  payload carries `basis: "default" | "personal"` so the UI can say so rather than passing a
  default off as the user's own statistic. Personal thresholds are clamped to 7…90 days.
  Exits to `ghosted` / `withdrawn` / `archived` never enter the sample — folding `ghosted` in
  would let every ghosting the user records raise their own threshold, and the predictor would
  talk itself out of ever predicting again.
- **The dashboard card offers the `ghosted` transition inline** (`at_risk` rows carry
  `lock_version`, so no re-fetch), sorted longest-silence-first, with a "Quiet" marker on the
  matching rows of the applications list. The card renders nothing when there is nothing to
  act on. Japanese throughout: 音信不通の可能性.

### Folded in along the way — the two parked performance items

- **`/me` is folded into the dashboard payload.** The dashboard was fetching both in one
  `Promise.all`; that is one wasted request, and TODO said to fix it the next time the payload
  was touched for another reason. This was that reason. `GET /api/v1/me` stays for API clients.
- **`timeline_entries` index widened to `(application_id, created_at)`.** It *replaces* the
  bare `application_id` index rather than adding to it (a prefix covers it), and serves the new
  window function's `PARTITION BY … ORDER BY` as well as the detail page's timeline.
- **The dashboard cache key now carries `Date.current`.** Ghost risk is a function of elapsed
  time, and an application crossing its threshold changes no row — so a key derived from rows
  alone would keep serving a stale, unflagged payload for up to 12 hours.
- **`GET /api/v1/dashboard` has a response schema in the OpenAPI output**, the first endpoint
  to get one: it is the only response that cannot be guessed from a model.

## v1.2.0 — 2026-07-11

Tagged at `36c9378`. The Kanban board view, plus the `api/` groundwork it needed. As scoped,
the release opened with the API changes in their own PR before any board component was
written. *(feat/api-error-codes-and-transitions PR #52, feat/web-error-codes PR #53,
feat/kanban-board PR #54)*

### API groundwork *(PR #52)*

- **Machine-readable error codes** — deferred here from v1.1.0's i18n work, which could not
  localize per-field validation errors without them. A stable `code` (`stale_record`,
  `invalid_credentials`, `validation_failed` with per-field `details`, …) now rides alongside
  the existing `error` string — additive, nothing breaks. Full taxonomy in SPEC.md § Error
  codes.
- **`GET /api/v1/transitions`** — serves the effective transition table, built from
  `ApplicationFSM.valid_next_states`, so a client can learn which moves are legal without
  mirroring the table. The server rejects illegal transitions regardless; the table only
  decides what *looks* possible.

### Errors localized by code, not status *(PR #53)*

- **`web/` keys its message catalog off the API's `code`** — per-field `details[].field` /
  `details[].code` first (`errors.field.*`), then the code (`errors.code.*`), with the v1.1.0
  status map kept as fallback and `errors.unknown` last. Both resolution sites — `apiFailure()`
  in server actions and the auth form — share the order, and the shared failure-detail guard
  keeps the server and client parsers in agreement. Recovers the per-field `422` detail that
  v1.1.0 had to drop.

### The Kanban board *(PR #54)*

- **`/board`, labeled "Kanban" (カンバン)** — columns are FSM states, cards are applications,
  and a drag between columns is a `PATCH /api/v1/applications/:id/transition` call. It demos
  the state machine far better than a list does. The route stays `/board`; only the label says
  Kanban.
- **The board fetches the transition table** from `GET /api/v1/transitions` and highlights
  legal drop targets from it — no copy in TypeScript, per the repo's oldest invariant.
- **Seven active columns, six closed states in a rail** — the active pipeline (`wishlist` →
  … → `offer`) lays out as a wrapping grid (four columns per row at `lg`, two at `sm`, one
  below) with the interview loop grouped on the first row; the terminal and dead-end states
  collapse into a toggleable closed rail below the board, not a drop target. Thirteen columns
  is unreadable at any width.
- **One bounded fetch-all** against the existing `index` (`limit=100`, capped at 10 pages)
  with an on-screen truncation notice past the cap — per-column cursors were rejected in the
  decisions log as new query params for precision the board doesn't need.
- **Optimistic transitions** via `useOptimistic` — a move renders instantly, a failed one
  snaps the card home with a board-level notice, and the `409` stale-`lock_version` path
  additionally refreshes the route so fresh `lock_version`s flow in.
- **Keyboard-accessible card menu** — every card carries a focusable menu listing *all* legal
  next states, including the closed ones drag refuses, sharing the detail page's
  confirm/revival semantics via `app/lib/transitions.ts`. The menu is the accessible path and
  the only complete one; drag is a pointer convenience.
- **Homepage gains a fourth numbered card** stating the board's claim — it reads its legal
  moves from the API instead of copying them — and the claims grid reflows two across at
  `md`, four at `lg`. README, README.ja, and `llms.txt` describe the board.

---

## v1.1.2 — 2026-07-11

Tagged at `b66fceb`. One mobile-layout fix that v1.1.1's responsive audit missed: the audit
checked the detail page's resting state, not the delete button's confirming state. Entirely
`web/`, no behaviour change. *(fix/delete-confirm-overflow, PR #51)*

- **Delete confirm prompt no longer clips at 375px.** The detail-page header's actions group
  is `shrink-0`, so the confirm prompt's single-line width became the group's width and
  overflowed the viewport on iPhone SE — a confirmation you cannot read defeats the confirm
  step. In Japanese the back link and the confirm block genuinely do not fit side by side at
  375px, so the actions group now wraps (`flex-wrap justify-end`) and the confirm block takes
  `basis-full` below `sm`, landing on its own right-aligned row where the prompt and both
  buttons fit on one line. `sm` and up keeps the side-by-side layout, and the confirm buttons
  still render away from the original Delete button's position, so the double-tap protection
  is unchanged.

---

## v1.1.1 — 2026-07-11

Tagged at `885ec4d`. Mobile view improvements — the responsive audit found the two headers
were what actually broke at 375px; the dashboard list, application detail page, and
transition buttons already carried responsive classes and held up in both locales. Entirely
`web/`, no behaviour change, as scoped. *(fix/mobile-header-cta, PR #50)*

- **Headers declutter below `sm` (640px) rather than collapse into a menu** — a hamburger
  would hide the locale switcher exactly where a Japanese visitor first meets the app. Each
  header drops only what is redundant at that width: the homepage hides its "About" nav link
  (the hero's primary CTA is the same destination immediately below); the signed-in app
  shell hides the wordmark text and the "Dashboard" link (the mark beside them already links
  to `/dashboard`). What remains fits 375px in Japanese, the wider locale, without wrapping.
- **Homepage primary CTA renamed** "Read the architecture" → "How it's built" (Japanese
  unchanged: 設計を読む); message key `readArchitecture` → `ctaAbout` in both catalogs.
- **Chore:** `next dev` gets `--max-old-space-size=4096`; `build` and `start` untouched.
- The `llms.txt` bilingual-UI mention deferred from v1.1.0 had already landed (it lists the
  `/ja` pages), so no docs change was needed here.

---

## v1.1.0 — 2026-07-11

Tagged at `161b343`. Japanese UI (i18n) and the homepage + about/docs revamp. Entirely
`web/` — no `api/` changes, as scoped; the Kanban board moved to v1.2.0 because it needs
the FSM transition table exposed from the API. *(feat/i18n-japanese-ui, PR #49)*

### Japanese UI (i18n)

- **next-intl@4.13.2, `localePrefix: "as-needed"`** — English stays unprefixed, Japanese
  lives at `/ja/*`, and `/en/*` 307s to the unprefixed canonical path, so no existing URL
  moved. The app moved under `app/[locale]`; the auth guard in `proxy.ts` runs on the
  locale-stripped pathname, so `PUBLIC_PATHS`/`OPEN_PATHS` stay one entry per path rather
  than one per locale.
- **All copy in message catalogs** — every page, form, and component reads
  `messages/{en,ja}.json`, key-for-key identical; `format.ts` holds no copy. The 13 FSM
  state names live in the `status` namespace, translated for how Japanese job boards label
  the stages (`phone_screen` → `カジュアル面談` — recognition beat precision).
- **Locale switcher** — a two-locale toggle showing only the inactive language, mounted in
  the app shell, the marketing header, and the auth layout. Switches with `router.replace`
  on the locale-stripped pathname.
- **Server-side errors localized by HTTP status** — the API stays English-only; `web/`
  discards the English sentence and maps status → catalog entry in `apiFailure()`/
  `localFailure()` (`app/lib/actions.ts`) and `errorMessage()` (sign-in form, which talks
  to route handlers over `fetch`). Per-field `422` detail is lost until the API grows
  error codes in v1.2.0.
- **Dates and `lang` follow the locale** — `Intl` formatters take the active locale;
  `formatDate()` pins `Asia/Tokyo` so date-only fields don't shift a day west of UTC.

### Homepage, `/about`, `/docs`

- **Hero reframed at the hiring reviewer** — the homepage now argues the FSM claim (13
  states, immutable audit trail, stack named outright); primary CTA is "Read the
  architecture" → `/about`, demo second. `pipeline-diagram.tsx` illustrates the machine —
  labels and colours reuse the `status` catalog and `statusBadgeClass`; the transition
  table itself stays only in `application_fsm.rb`.
- **`/about`** — the four architecture decisions, each stated against the cheaper
  alternative it rejected. **`/docs`** — frames the API (auth, scoping, error shape,
  cursor pagination, endpoint table) and links out to the rswag UI instead of deep-linking
  raw Swagger off-site. Both are `OPEN_PATHS` in `proxy.ts`: they render with or without a
  session.
- **Design pass from `design/assets/tokens.css`** — brand motion via Tailwind's default
  transition variables, the Fraunces `opsz 144` display cut (`.kk-display`),
  `--color-danger` replacing 25 improvised `red-*` utilities, one global cobalt
  `:focus-visible` ring, and a `prefers-reduced-motion` block.
- **SEO surfaces** — `sitemap.ts` derives all five public pages with per-locale `hreflang`
  alternates via `getPathname`; `llms.txt` no longer claims Sidekiq/Redis and names
  `application_fsm.rb` as the FSM authority.

### Fixed

- **`package-lock.json` was missing a nested `@swc/helpers` resolution** — next-intl's
  `@swc/core` peers `>=0.5.17` while `next` pins `0.5.15`; CI's npm 10 refused `npm ci`.
  Regenerated the lock with npm 10. *(42862d9)*

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

---

## Pre-1.0.0 — the build phases

Before the repo had a changelog, the work was tracked as nine numbered phases in what was
then `PLAN.md` (now [`SPEC.md`](SPEC.md)). They are recorded here so the history isn't lost.

**These entries describe the system as it was at the time.** Several of the decisions below
were later reversed — most visibly Sidekiq and Redis, which v1.0.0 replaced with Solid Queue
and Solid Cache. For how the system works *now*, read `SPEC.md`; this section is archaeology.

### Phase 1 — Rails API foundation

Scaffolded with `rails new api --api --skip-test` (RSpec, so Minitest's `test/` folder would
be dead weight). Gemfile: Sidekiq, devise + devise-jwt, rspec-rails, factory_bot_rails, faker,
database_cleaner-active_record, rswag-api/ui/specs; `solid_queue` and `solid_cache` removed.
CORS configured to expose the `Authorization` header, origin read from `FRONTEND_URL`. Routes,
migrations (pgcrypto, users, applications, timeline_entries, file timestamps), models, and the
`ApplicationFSM` PORO. RSpec set up with a DatabaseCleaner transaction strategy and an
`auth_headers_for` request-spec helper.

### Phase 2 — Service layer + specs

`Applications::TransitionService` — FSM assertion, then status update and `TimelineEntry`
creation in one transaction. `FollowUpReminderJob` with the `"reminder-{id}-{date}"`
idempotency key. FSM unit specs (31 examples, no DB) and TransitionService specs (doubles
only). 37 request specs written *before* the controllers existed. Support added:
`spec/swagger_helper.rb`, a `jwt_for(user)` helper that issues a JWT without a controller, and
a `fake_pdf` helper. Zeitwerk inflections taught to autoload `ApplicationFSM`.

The FSM grew here: `wishlist`, `final_round`, `withdrawn`, and `declined` were added, and
`ghosted` became revivable (`ghosted → applied`).

### Phase 3 — Controllers

`ApplicationController` rescues `InvalidTransitionError` → 422 and `StaleObjectError` → 409.
`Auth::SessionsController` returns the JWT in the `Authorization` response header; `destroy`
overridden for API mode (no flash, no `respond_to`). `Auth::RegistrationsController` overrides
`create` to skip Devise's automatic `sign_up`, which writes to session. `ApplicationsController`
applies `lock_version` from params *before* calling `TransitionService`, so the 409 path
actually fires. `DashboardController` is pure SQL aggregation.

Devise's `config.navigational_formats = []` was the missing piece that makes the gem behave as
a pure JSON API — otherwise `*/*` is treated as navigational and `set_flash_message!` raises.
79 specs green.

### Phase 4 — API docs

`rswag_api.rb` + `rswag_ui.rb` initializers; `rake rswag:specs:swaggerize` emits
`swagger/v1/swagger.yaml` from the request specs. Swagger UI at `GET /api-docs`.

### Phase 5 — Next.js frontend

The auth flow that still stands today: credentials POST to Next route handlers, which proxy to
Rails, capture the JWT from the `Authorization` header, and store it in an `httpOnly` cookie.
The browser never sees the token. Route guard in `web/proxy.ts` (Next 16 renamed
`middleware.ts` → `proxy.ts`). Server-side `apiFetch` + server actions for mutations. File
downloads proxied so the JWT stays server-side. Tailwind v4; no UI library, no form library, no
state management.

### Phase 6 — Deploy

Railway project: `api`, `web`, managed PostgreSQL, managed Redis. Puma and Sidekiq ran from a
single service via the `Procfile` — which turned out not to work under a Dockerfile build, and
was later split into a dedicated `sidekiq` service before Sidekiq was removed entirely.

The production lessons from this phase (no Thruster; `CMD` overrides `Procfile`;
`bin/docker-entrypoint` arg matching; Cloudflare grey cloud for ACME; the DNSSEC drift) are
recorded permanently in `SPEC.md` under Deployment.

### Phase 7 — Production-readiness and Tokyo-market polish

None of it was needed to *use* the app; all of it was needed for the repo to read like
production work. CI running Brakeman, bundler-audit, Rubocop, and RSpec against Postgres 16 +
Redis 7; a `web/` workflow running ESLint, `tsc --noEmit`, and `next build`. A `/up` health
endpoint that pings its dependencies rather than merely proving the app booted. Structured JSON
logging (`lograge`), SimpleCov at an 80% floor, `prosopite` N+1 detection around every request
spec, Honeybadger, and one Playwright E2E: sign up → create → transition → timeline entry.

For the Tokyo market: a `README.ja.md`, and seed data using recognisable Japanese tech
companies rather than "Acme Corp".

Skipped deliberately: i18n and JST-aware reminders (real work, small payoff *then* — both have
since landed or been scoped); Company/Platform/Tag models (more CRUD, no new patterns);
Kubernetes and Terraform (overkill).

### Phase 8 — API maturity and portfolio polish

- **Cursor pagination on `GET /applications`** — the index previously loaded every record with
  no limit. `?after=<base64_cursor>&limit=20`, response wrapped as
  `{ data, meta: { next_cursor, has_more } }`. ~20 lines, no gem.
- **Error-envelope consistency** — `create` and `update` returned `{ errors: [...] }` while
  everything else returned `{ error: "..." }`. Standardised on the single string, which
  simplified error extraction in `web/app/lib/api.ts` to `body.error ?? text`.
- **Demo account + "Try demo" shortcut** — idempotent seeds, 12 applications spread across all
  FSM states using mock Tokyo companies (Marcari, Vine Corp, Rokuton, BeNA Games, CyberFactor,
  Cansan, greeo, Funds Forward, SlickHR, Cybozo, Wantfully, Cogpal). Seed timeline entries are
  written directly with `idempotency_key: "seed-<slug>-<n>"`, bypassing `TransitionService` —
  safe, because historical seed data is not a user action.
- Playwright E2E promoted into `web.yml` as a second job, push-to-`main` only, to keep
  free-tier minutes low.

### Phase 9 — Product depth

Four features scoped to make the app genuinely useful for a real job search. Two shipped.

**Email delivery (shipped).** ActionMailer re-enabled (the `--api` default disables the
railtie). The scheduling gap found here is the interesting part: `sidekiq-cron` was in the
Gemfile but **no schedule was loaded anywhere**, so the reminder job never fired in production —
and `config/recurring.yml` was sitting there as a dead Solid Queue artifact. It was added back
properly, and by v1.0.0 the wheel had turned full circle: Solid Queue returned and `recurring.yml`
became load-bearing again. Resend over SMTP, on port `2587` because Railway blocks 587 and 465.

**AI job URL pre-fill (shipped).** `Applications::UrlPrefillService` — Claude Haiku 4.5 via the
official `anthropic` gem, structured output through a tool/JSON schema. Claude specifically
because it reads Japanese postings natively, so one flow covers Wantedly, Greenhouse, and a
company careers page with no parser per site. SSRF guard on the outbound fetch; typed errors
mapped to 422 / 502 / 503. Later hardened in v1.0.0 (IP pinning, per-account rate caps).

**Analytics dashboard (not built).** A funnel, a response rate, a ghosting rate, and mean days
from applied to first response and to offer. All SQL aggregation over data already stored — no
new models, no migration. Carried into `TODO.md`.

**AI cover-letter assist (not built).** "Draft with AI" on the detail page, streaming into a
panel the user copies from; nothing saved automatically. Carried into `TODO.md`.

Deferred on purpose: email on *every* status change — too noisy for personal use.
