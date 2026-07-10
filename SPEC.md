# KarirKalyan — Technical Specification

> A full-stack job application tracker: Rails 8 API (`api/`) + Next.js 16 frontend (`web/`).
>
> I work mostly in TypeScript and Next.js. I built KarirKalyan to learn Rails the way I'd
> actually use it in production, so this document records the decisions and the reasoning
> behind each one — not just the feature list.

---

## How to use this file

**SPEC.md is the technical source of truth. Change it before you change code.**

The workflow is spec-first, in this order:

1. **Write the change here.** Amend the data model, the API contract, the state machine —
   whatever the change actually touches. If you cannot describe it here, you do not yet
   understand it well enough to build it.
2. **Get the spec right.** A spec that disagrees with itself produces code that disagrees
   with itself.
3. **Then write the code**, and make it match.

Two consequences worth stating plainly:

- **If code and SPEC.md disagree, that is a bug in one of them** — not a documentation chore
  to sweep up later. Decide which is wrong and fix that one. Silence is the failure mode:
  this file spent an entire release describing Sidekiq and Redis after both had been removed,
  which is exactly why it now carries this rule.
- **SPEC.md describes the system as it is**, in the present tense. It is not a plan and not a
  history. Open work lives in [`TODO.md`](TODO.md); shipped work lives in
  [`CHANGELOG.md`](CHANGELOG.md), including the pre-1.0.0 build phases that used to sit at the
  top of this file.

Last synced against the code: **2026-07-10**, at `v1.0.1`.

---

## System overview

```
karirkalyan/
  api/    ← Rails 8 API-only. Owns data, auth, the FSM, background jobs.
    docker-compose.yml   ← postgres 16 for local dev (no Redis)
  web/    ← Next.js 16 App Router. Owns the UI and the browser session.
  design/ ← design tokens and icon assets
  notes/  ← working notes; not authoritative
```

### Why an API plus a separate frontend

The Rails backend is the portfolio piece. The Next.js frontend exists so the app is genuinely
usable day-to-day for tracking a real job search. Separating them also demonstrates knowing when
Rails is the right tool (data integrity, background jobs, API) and when it isn't (rich
interactive UI).

There is one hard rule at the boundary: **the JWT never reaches client-side JavaScript.**
Everything in the frontend auth design follows from that.

---

## Backend (`api/`)

### Tech stack

| Technology | Alternative considered | Reason |
|---|---|---|
| Rails 8 API-only | Full-stack Rails | No HTML views needed; clean API contract |
| Ruby 3.4.9 (via mise) | System Ruby | Reproducible across machines |
| PostgreSQL 16 | SQLite | Foreign keys, `EXTRACT()` for date math, production-grade |
| Devise + devise-jwt | Roll own JWT | Proven auth layer; JTI revocation solves logout |
| Custom PORO FSM | `state_machines` gem | Visible logic — the transitions table is the documentation |
| Service objects | Fat models / callbacks | Explicit call sites; easy to test in isolation |
| **Solid Queue + Solid Cache** | Sidekiq + Redis | Postgres-backed; no Redis, no extra Railway service |
| PostgreSQL `bytea` for files | Active Storage + S3 | Files are ≤ 1 MB; no object-storage overhead at this scale |
| RSpec + FactoryBot | Minitest | Industry standard in Tokyo Rails shops |
| rswag | Hand-written OpenAPI | Request specs and docs share one source of truth |
| `anthropic` gem | HTTP by hand | Typed tool/JSON-schema responses for URL pre-fill |

**Why `--skip-test` on `rails new`?** Rails generates a `test/` folder for Minitest. This project
uses RSpec, so that folder would be dead weight. `--skip-test` signals the choice.

### Data model

#### `users`

Managed by Devise. `jti` stores the current token ID — rotated on sign-out to invalidate existing
tokens. `User#as_json` strips `encrypted_password` and `jti`.

```
users
  id
  email              string, not null, unique
  encrypted_password string, not null
  jti                string, not null, unique   ← JWT revocation
  created_at, updated_at
```

#### `applications`

The core entity. `status` is FSM-controlled: it changes only through
`Applications::TransitionService`, never a direct attribute write, and it is never
mass-assignable. `resume` and `cover_letter` are `bytea` columns capped at 1 MB in the model and
excluded from JSON serialisation — dedicated download endpoints serve them via `send_data`.

```
applications
  id
  user_id                 FK → users, not null
  company                 string, not null
  role                    string, not null
  url                     string             ← job board derived from this; there is no `source` column
  status                  string, not null, default: "draft"   ← FSM-controlled
  follow_up_at            datetime           ← user-set reminder
  applied_at              datetime           ← set by the service on transition to `applied`
  notes                   text
  resume                  bytea              ← raw bytes, ≤ 1 MB, PDF magic-byte checked
  cover_letter            bytea              ← raw bytes, ≤ 1 MB, PDF magic-byte checked
  resume_updated_at       datetime
  cover_letter_updated_at datetime
  lock_version            integer, default: 0   ← optimistic locking
  created_at, updated_at

  index (user_id, created_at DESC)   ← composite; serves the cursor-paginated list
  index (status)
  index (follow_up_at)
```

#### `timeline_entries`

Append-only audit log. Every status change writes one row atomically with the status update —
they succeed or fail together.

```
timeline_entries
  id
  application_id    FK → applications, not null
  actor_id          FK → users, not null
  from_status       string, not null
  to_status         string, not null
  note              text                ← optional, supplied on transition
  idempotency_key   string, unique      ← prevents duplicate reminder entries on job retry
  created_at, updated_at
```

There is deliberately **no index on `to_status`**, though the dashboard's offer-lookup subquery
filters on it. Add `(to_status, application_id, created_at)` if the table grows; see `TODO.md`.

### State machine — `app/lib/application_fsm.rb`

#### Why a custom PORO instead of a gem

The `state_machines` gem is mature but opaque — behaviour lives in DSL macros and callbacks, not
in a file you can read top to bottom. The PORO means: open `application_fsm.rb`, read the
`TRANSITIONS` array, know exactly what is allowed. This mirrors Awano's `fsm.ts`.

**`TRANSITIONS` is the single source of truth for legal transitions.** Nothing may duplicate it —
not the frontend, not a test fixture, not this file. The diagram below renders it for human
readers; if the two disagree, the Ruby wins and this section is the bug.

#### States

13 states. The recruiter-driven stages follow industry-standard ATS pipelines (Greenhouse, Lever,
Workday); the candidate-side states (`wishlist`, `withdrawn`, `ghosted`) are common in personal
trackers like Huntr and Teal.

```
wishlist ──→ draft ──→ applied ──→ phone_screen ──→ technical ──→ final_round ──→ offer ──→ accepted
                          ↘            ↘               ↘              ↘             ↘
                       rejected      rejected       rejected       rejected      rejected
                       ghosted       ghosted        ghosted        ghosted       declined

  withdrawn ← any of: wishlist, draft, applied, phone_screen, technical, final_round
  applied   ← any of: ghosted, rejected, withdrawn        ← revival paths
```

**`TERMINAL_STATES` is exactly `accepted`, `declined`, `archived`.** Only these three are final.

`rejected`, `withdrawn`, and `ghosted` all look terminal but are **not** — each transitions back
to `applied`. A company that ghosted you can reach out again; a rejection can be reversed; a
withdrawal can be reconsidered. This is the single most misread part of the FSM, and the reason a
Kanban board cannot infer legal drops from a guessed left-to-right ordering.

Any non-terminal state may also transition to `archived` (housekeeping — remove clutter without
deleting history). That is handled by an early return in `assert_transition!`, not by rows in
`TRANSITIONS`.

**Why `rejected`, `declined`, and `withdrawn` are distinct:**

- `rejected` — company-initiated; the candidate didn't get the offer
- `declined` — candidate-initiated, *after* receiving an offer
- `withdrawn` — candidate-initiated, *before* any decision

Collapsing them into one "closed" state loses the signal cohort analytics depends on. The
breakdown matters more than the count.

#### `ENTRY_STATES` — creation is not a transition

`ENTRY_STATES` is `wishlist`, `draft`, `applied`.

A tracker's users add roles at whatever stage they are really at — saved, still preparing, or
already applied — so forcing every new application to start as `draft` was wrong, and left
`wishlist` unreachable. The mental model: **the FSM constrains *changes*; creation sets the
*initial* state**, the same way an ATS imports a candidate at a given stage.

`status` is still never mass-assignable. The controller validates the requested value against
`ENTRY_STATES` explicitly, so a client cannot POST its way to `offer` — later stages are reachable
only by transitioning, which keeps the audit trail honest. When someone adds a job they already
applied to, an optional applied date backdates `applied_at`, so dashboard timing stays accurate
for jobs added after the fact.

#### Public interface

```ruby
ApplicationFSM.assert_transition!(from, to)  # raises InvalidTransitionError → 422
ApplicationFSM.valid_next_states(from)       # [] for terminal states; appends "archived"
ApplicationFSM::TRANSITIONS                  # frozen array of { from:, to: }
ApplicationFSM::VALID_STATES                 # 13 states, derived from TRANSITIONS
ApplicationFSM::TERMINAL_STATES              # accepted, declined, archived
ApplicationFSM::ENTRY_STATES                 # wishlist, draft, applied
```

`valid_next_states` is serialised by `show` and `transition` only — **not by `index`**. A board
view needs it there, or needs the table itself exposed. See `TODO.md`, v1.2.0.

### Service layer

#### Why service objects instead of fat models or callbacks

ActiveRecord callbacks (`after_save`, `before_update`) fire on every save — including seeds,
factories, and admin imports. Logic that should run only on an explicit user action ends up
running everywhere, requiring escape hatches. Service objects have explicit call sites: the
behaviour runs when `TransitionService.new(...).call` is called, and not otherwise.

This mirrors Awano's `transitionStatus()` in `src/lib/tickets/service.ts`.

#### `Applications::TransitionService`

Signature: `new(application:, to:, actor:, note: nil).call`

1. `ApplicationFSM.assert_transition!` runs **before any DB write** — no partial state.
2. The status update and the `TimelineEntry` creation happen in one
   `ActiveRecord::Base.transaction` — the analogue of Prisma's `$transaction`. Both or neither.
3. `from_status` comes from `status_before_last_save` (ActiveRecord dirty tracking), so it is
   accurate even if callbacks run.
4. `applied_at` is set by the service, never supplied by the client.

**Known sharp edge:** `applied_at` is reset on *every* transition into `applied`, including the
revival paths (`ghosted → applied`, `rejected → applied`, `withdrawn → applied`). Whether a
revival should overwrite the original application date or preserve it is an open question — it
changes what the dashboard's apply→offer timing means. Settle it in this file before changing the
code.

#### `Applications::UrlPrefillService`

Paste a job-posting URL on the new-application form; it returns `{ company, role, notes }` for the
user to review and edit. Nothing is persisted. The AI fills the form; it does not save.

The service fetches the page, strips HTML to text, and asks Claude — via the official `anthropic`
gem — for structured fields through a tool/JSON schema, so the result is typed rather than free
text to be parsed. **Model: Claude Haiku 4.5.** Extraction is a small, well-defined job; the
cheapest fast model is the right tool, and a typical posting costs a fraction of a cent. Claude
specifically because it reads Japanese postings natively — the same flow works on a Wantedly
listing, a Greenhouse page, or a company careers page without a parser per site. For a Tokyo job
search that is the whole point.

Because the server fetches a user-supplied URL, the SSRF guard is load-bearing:

- Resolves the host and validates **every** resolved address against loopback, private, and
  link-local ranges — including the cloud metadata endpoint `169.254.169.254`.
- **Pins the connection to the validated IP** (`http.ipaddr`), so a DNS rebind between check and
  connect cannot redirect the fetch. Restricts to ports 80/443.
- Re-validates on **every redirect hop**.
- Body-size cap on the fetch; character cap on the text sent to Claude.

Rate limits are enforced per-IP *and* per-account — see Security.

Errors are typed and mapped: bad or private URL → `422`, missing `ANTHROPIC_API_KEY` → `503` (the
rest of the app keeps working without it), AI failure → `502`. The user can always fill the form
in by hand.

#### `Demo::ResetService`

Wipes the shared "Try demo" account back to a clean seed. Invoked hourly by `DemoResetJob`, scoped
to the demo user only. Without it, the shared account accumulates every visitor's data
indefinitely.

#### `AllowedHosts` — `app/lib/allowed_hosts.rb`

Host-authorization patterns for Rails' `HostAuthorization`. **The patterns here are deliberately
un-anchored.** `HostAuthorization::Permissions#sanitize_regexp` wraps every pattern as
`/\A#{pattern}(:\d+)?\z/` — Rails anchors it for you and appends an optional port group. Adding
your own `\z` makes that port group unmatchable and blocks `api.railway.internal:3001`, the `Host`
on every internal web→api call, which 403s the entire API.

This is documented because it already happened once and took production down (CHANGELOG v1.0.1).
**Verify a framework's own normalization before "hardening" a pattern it owns.**

#### `JobBoard` — `app/lib/job_board.rb`

`JobBoard.from_url` strips a URL to a host key (`linkedin.com`). The `JobBoard::NONE` sentinel
selects applications added without a link. There is no `source` column and no per-board parser.

### API contract

All routes are JSON. Every error response is `{ error: "message" }` — a single string, never an
array. Validation failures join their messages into that one string.

```
POST   /api/v1/auth/sign_up                       201, JWT in Authorization header
POST   /api/v1/auth/sign_in                       200, JWT in Authorization header
DELETE /api/v1/auth/sign_out                      rotates jti — revokes all devices

GET    /api/v1/applications                       cursor-paginated
POST   /api/v1/applications                       status must be in ENTRY_STATES
POST   /api/v1/applications/prefill               AI URL pre-fill (Claude Haiku 4.5)
GET    /api/v1/applications/:id                   + valid_next_states, + timeline_entries
PATCH  /api/v1/applications/:id
DELETE /api/v1/applications/:id
PATCH  /api/v1/applications/:id/transition        FSM transition; + valid_next_states
GET    /api/v1/applications/:id/resume            send_data, PDF, nosniff
GET    /api/v1/applications/:id/cover_letter      send_data, PDF, nosniff
GET    /api/v1/dashboard                          SQL aggregation + facets
GET    /api/v1/me                                 authenticated user's profile

GET    /up                                        deep health check — pings Postgres
GET    /api-docs                                  Swagger UI (rswag)
GET    /api-docs/v1/swagger.yaml                  generated from request specs
```

Every record is reached through `current_user.applications`, so cross-user access returns `404`,
not `403`.

#### Status codes with meaning

| Code | When |
|---|---|
| `409` | `ActiveRecord::StaleObjectError` — optimistic-locking conflict |
| `422` | FSM `InvalidTransitionError`; validation failure; bad or private pre-fill URL |
| `502` | AI extraction failed |
| `503` | `ANTHROPIC_API_KEY` missing; `/up` when Postgres is down |

#### Cursor pagination

`GET /api/v1/applications?after=<base64_cursor>&limit=20`. Limit clamped 1–100, default 10.
Response: `{ data: [...], meta: { next_cursor, has_more } }`. The cursor is a Base64 `created_at`
in ISO-8601 with microseconds; a malformed cursor is ignored and returns the first page rather
than erroring. Manual implementation, no gem — roughly 20 lines, and it shows understanding rather
than gem reach.

Filters compose with pagination server-side: `status` (exact), `company` (exact), `source` (host
substring, `ILIKE`).

#### Dashboard filters — derived from the URL, no new column

Company is a stored field; the "job board" is derived crudely from the URL host already stored.
The two dropdowns are **interdependent** (faceted): picking TokyoDev narrows the company list to
TokyoDev companies, and vice versa. Rather than re-query per selection, the cached stats endpoint
ships a compact `facets` array — one `[company, board]` pair per application — and the dropdowns
are computed from it on the client, so narrowing is instant with no round trip. If a change makes
the other selection impossible, it is cleared, so a dropdown value can never point at a hidden
option.

The tradeoff is honest: host-substring matching is approximate (a job added without a link buckets
under "No link"), and one facet pair per row does not scale forever. At personal-tracker volume it
is the right amount of effort, and deriving from data already stored beats asking the user to tag
every row.

### Background jobs — Solid Queue

**Adapter:** `:solid_queue` in production (`config/application.rb`), `:async` in development,
`:test` in test.

**Workers run inside Puma.** `config/puma.rb` has `plugin :solid_queue if
ENV["SOLID_QUEUE_IN_PUMA"]`; that variable must be set on the Railway `api` service. There is no
separate worker service.

**Single database.** Queue and cache tables live in the primary Postgres via a normal migration
(`20260710000002_create_solid_queue_and_solid_cache_tables.rb`). There are no
`db/queue_schema.rb` / `db/cache_schema.rb` files and no `connects_to` / `database:` config. Keep
it that way unless the app outgrows it.

**Connection pool.** `database.yml` sets `max_connections` to `RAILS_MAX_THREADS + 6`. Solid
Queue's ~5 threads share the pool with Puma's request threads, and it *exits — stopping Puma with
it* — if the pool is smaller than its thread count. This is not a tuning knob; it is a correctness
constraint.

**Recurring tasks** — `config/recurring.yml`:

| Task | Schedule | What |
|---|---|---|
| `follow_up_reminders` | `15 8 * * * Asia/Tokyo` | `FollowUpReminderJob` — 08:15 JST |
| `clear_solid_queue_finished_jobs` | hourly at :12 | Bounds the jobs table |
| `reset_demo_account` | hourly at :42 | `DemoResetJob` |

#### Idempotent jobs

Solid Queue guarantees at-least-once delivery. `FollowUpReminderJob` writes a `TimelineEntry` with
`idempotency_key = "reminder-{id}-{date}"`. The check is **not** `exists?`-then-`create!` — that
race is real — it relies on the unique index and rescues `ActiveRecord::RecordNotUnique` for true
exactly-once. Same pattern as Stripe idempotency keys.

The `TimelineEntry` is written first, as the exactly-once anchor; the email is then decoupled via
`deliver_later` onto the `mailers` queue, so a transient SMTP failure retries the email without
duplicating the entry.

#### Time zone

`config.time_zone = "Tokyo"`. `active_record.default_timezone` is deliberately **not** set, so
timestamps are still stored in UTC — only presentation and `Time.zone`-based queries (such as the
reminder job's "today") are JST. Comparing `DATE(follow_up_at)` in UTC gave JST users reminders a
day early; the job now uses a zone-aware day range.

### Mail

`ActionMailer` is re-enabled in `config/application.rb` (the `--api` default disables it).
Production sends via SMTP (Resend); development previews only; test collects in
`ActionMailer::Base.deliveries`.

- `WelcomeMailer` — on sign-up, via `deliver_later`. `deliver_now` with
  `raise_delivery_errors = true` meant a mail failure 500'd a successful registration, and the
  retry then said "email taken".
- `FollowUpMailer#reminder` — from `FollowUpReminderJob`.

**Railway blocks outbound SMTP on ports 587 and 465**, so production uses Resend's alternate
STARTTLS port `2587`. The `From:` domain must be verified in Resend first.

### Security

- **Auth** — Devise + devise-jwt. The JWT is issued in the `Authorization` response header. **One
  JTI per user**, via `JTIMatcher`: sign-out rotates it and therefore revokes *all* devices.
  1-day expiry, no refresh flow. This is intended, not a bug.
- **Rack::Attack** — throttle counters go through `Rails.cache` (Solid Cache), so they are shared
  across Puma workers rather than counted per worker.
  - `sign_in`: per-IP, plus **email-keyed** throttles (`10/5min`, `50/hour`) capping guesses
    against a single account across all IPs. IP-only throttling is defeated by a botnet or a
    shared NAT egress.
  - `prefill`: per-IP, plus **per-account** caps (10/min, 50/hour, 100/day) keyed on the JWT
    `sub`. The endpoint costs money (a Claude call plus an outbound fetch), so an uncapped
    per-account path is a cost and abuse vector — most sharply through the shared demo login.
- **Optimistic locking** — a `lock_version` column activates Rails' built-in optimistic locking.
  Two concurrent writers: the second gets `StaleObjectError` → `409`. One column, one
  `rescue_from`, no library.
- **Uploads** — size is checked from multipart metadata *before* `.read`, so an oversized file
  never enters memory. Then the 1 MB model cap, then PDF magic-byte validation (`%PDF`), which
  cannot be spoofed by renaming a file. The frontend's `accept=".pdf"` is UX only.
- **Downloads** — `current_user`-scoped, `X-Content-Type-Options: nosniff`, PDF only.
- **Param filtering** — `filter_parameter_logging.rb` filters `passw` and `email`; lograge logs
  `request.filtered_parameters`, so credentials do not leak into logs.

### Observability

- **Structured JSON logging** via `lograge` in production: one line per request with `request_id`,
  controller, action, status, duration.
- **Error tracking** via Honeybadger in production; API key from an env var, never hardcoded.
- **`/up`** pings Postgres and returns `200` / `503`, so Railway's healthcheck fails fast on
  dependency loss. The Rails 8 default only checks that the app booted. It no longer pings Redis —
  there is no Redis.

---

## Frontend (`web/`)

### Tech stack

| Technology | Alternative considered | Reason |
|---|---|---|
| Next.js 16 (App Router) | Vite + React | Needs a server to receive the JWT — see below |
| JWT in `httpOnly` cookie | `localStorage` | Token never touches client JS — XSS-proof |
| Tailwind CSS v4 | — | Utility-first; no UI library, no form library, no state library |
| Server components + server actions | Client-side data fetching | The token stays server-side by construction |
| `next-intl` | `react-i18next`, hand-rolled | App Router–native (RSC message catalogs, no client bundle for server copy); declares `next: ^16` |

#### Next.js 16 vs Vite

Vite is a pure client-side bundler. It has no server component, so there is nowhere to securely
receive a JWT and set an `httpOnly` cookie — you would add an Express or Hono server just for
that. Next.js route handlers do it in the same process with no extra moving part.

Second reason: Next.js 16 is already live in this portfolio at
[awano.chairulakmal.com](https://awano.chairulakmal.com). Using the same framework for both lets a
reviewer compare Rails and Next.js patterns side by side, rather than also comparing two frontend
toolchains.

Vite would be right if this were a public app where a stateless token in `localStorage` was
acceptable, or if a cookie server already existed.

### Auth flow — the token never reaches the browser

1. Sign-in and sign-up forms POST plain credentials to Next route handlers
   (`app/api/auth/session/route.ts`, `app/api/auth/register/route.ts`).
2. Those handlers proxy to Rails, capture the JWT from the `Authorization` response header, and
   store it in an `httpOnly` cookie named `session`.
3. `DELETE /api/auth/session` hits Rails to rotate the JTI, then clears the cookie.
4. `app/lib/api.ts` exposes a server-side `apiFetch` that reads the cookie and attaches
   `Authorization: Bearer …`. Mutations in `app/lib/actions.ts` are server actions calling
   `apiFetch` + `revalidatePath`.
5. File downloads proxy through `app/api/applications/[id]/{resume,cover_letter}/route.ts`,
   streaming the PDF body back while passing through `Content-Type` and `X-Content-Type-Options` —
   again, the JWT stays server-side.

`apiFetch` detects `FormData` and leaves `Content-Type` to `fetch`, so the multipart boundary is
set correctly.

**Origin checks are mandatory on the auth route handlers.** Next's built-in CSRF protection covers
Server Actions, *not* route handlers, so without an `Origin` allowlist a cross-site form or fetch
can drive a login (classic login-CSRF) or a sign-up. `web/app/lib/csrf.ts` enforces same-origin by
default, with `ALLOWED_ORIGIN` to pin; cross-origin → `403`. It guards both `POST` handlers and the
session `DELETE`.

**Expired sessions** bounce through `/api/auth/expired`, which clears the cookie and redirects to
`/sign-in?expired=1` with a notice. A `401` must never dead-end on an error box.

A `401` from upstream is the *only* thing that may surface as a `401`. Collapsing every non-OK
upstream status into `401` once turned a total API outage into "Invalid email or password" for
every user — see CHANGELOG v1.0.1.

### Route guard — `web/proxy.ts`

Next.js 16 renamed `middleware.ts` → `proxy.ts`; a `middleware.ts` file is **ignored**. Export a
function named `proxy`.

It redirects `/` to `/dashboard` or `/sign-in` on cookie presence, protects app routes, and bounces
authenticated users away from the auth pages. Authorization is presence of the `session` cookie —
there are no roles. `config.matcher` **must** exclude `/robots.txt`, `/sitemap.xml`, and
`/llms.txt`, or crawlers get a `307` to sign-in and the whole SEO surface becomes unreachable.

It also resolves the locale and applies next-intl's rewrite/redirect before the auth check, so the
guard always sees a locale-stripped pathname. See the i18n section below.

`proxy.ts` also sets the CSP. The policy is per-request nonce-based
(`script-src 'self' 'nonce-…' 'strict-dynamic'`), with no `'unsafe-inline'`; development keeps
`'unsafe-eval'` for HMR. **Because nonces are applied only during SSR, `await connection()` in the
root layout opts the whole app into dynamic rendering**, so every page's scripts get the nonce.
There is consequently no static optimization left to lose — which is why locale-prefixed routing in
v1.1.0 costs nothing.

### i18n — `next-intl`, English and Japanese

Locales are `en` (default) and `ja`. Copy lives in ICU message catalogs at `web/messages/{en,ja}.json`.

#### URL shape — `ja` is prefixed, `en` is not

`localePrefix: "as-needed"`. English keeps the bare paths (`/`, `/dashboard`, `/about`); Japanese is
prefixed (`/ja`, `/ja/dashboard`, `/ja/about`). No existing URL moved when i18n landed, which is why
this shape was chosen over prefixing both locales.

`/en/*` is not a 404 and is not a second canonical URL for the same page: next-intl redirects it to
the unprefixed path (`307`, query string preserved). So the English page has exactly one address,
which is what the sitemap and `hreflang` advertise.

Locale for an unprefixed path resolves from the `NEXT_LOCALE` cookie, then `Accept-Language`, then
the default.

#### Routing internals

Pages live under `app/[locale]/`, which is therefore the **root layout** — there is no
`app/layout.tsx`. Route handlers (`app/api/**`), the crawler files (`robots.ts`, `sitemap.ts`,
`manifest.webmanifest`), and `global-not-found.tsx` stay outside it — they are locale-independent,
and a locale segment would break their fixed paths.

`proxy.ts` composes two concerns in one pass, in this order:

1. `splitLocale()` splits the pathname into the prefix to preserve (`/ja`, or empty for English)
   and the path the guard reasons about (`/dashboard`).
2. The auth guard runs against that **locale-stripped** path, so `PUBLIC_PATHS` stays a list of
   three entries rather than six, and `/ja/dashboard` is protected exactly as `/dashboard` is. Its
   redirects re-apply the prefix, so a signed-out `/ja/dashboard` visitor lands on `/ja/sign-in`.
3. If the guard passes, next-intl's middleware resolves the locale and produces the rewrite
   (`/dashboard` → `/en/dashboard`) or redirect (`/en/dashboard` → `/dashboard`).
4. The CSP with its per-request nonce is set on whatever response comes out of 2 and 3 — including
   redirects, which must carry it too.

The guard runs *before* next-intl, not after, because it needs no locale to make its decision and
next-intl's output is a rewrite the guard would then have to un-rewrite.

The nonce reaches SSR by mutating `request.headers` in place before delegating: next-intl copies
those headers (`new Headers(request.headers)`) onto the request it forwards. It must be a mutation,
not `new NextRequest(request, { headers })` — reconstructing the request re-reads its body, and
every server action arrives as a POST with one.

`config.matcher` is unchanged: it excludes by *prefix segment* (`api`, `_next`, …) and a `/ja` prefix
does not collide with any exclusion. The crawler exclusions (`robots.txt`, `sitemap.xml`,
`llms.txt`) keep working because those paths are never locale-prefixed.

#### Navigation must go through `i18n/navigation.ts`

`Link`, `useRouter`, `usePathname`, `getPathname`, and `redirect` are re-exported from
`i18n/navigation.ts` and used **instead of** the `next/link` and `next/navigation` originals. The
originals drop the prefix, so a `/ja` visitor clicking through the app silently falls back to
English. `notFound()` still comes from `next/navigation` — it carries no path.

Two consequences worth knowing:

- `usePathname` from this module returns the **locale-stripped** path, so `NavLink`'s `href`
  comparison needs no special case.
- In a server action there is no component tree to infer the locale from, so `redirect` and
  `getPathname` take it explicitly: `actions.ts` calls `getLocale()` and passes it. `revalidatePath`
  gets the same treatment, since the visitor's router cache is keyed on the prefixed URL.

#### 404s

`app/[locale]/not-found.tsx` handles a bad path *inside* a locale. Paths matching no route at all
fall to `app/global-not-found.tsx`, enabled by `experimental.globalNotFound` in `next.config.ts`.
It exists because a root layout under a dynamic segment leaves Next nothing to compose a 404 from;
without it those paths get Next's built-in bare document — no `lang`, no stylesheet, no nonce.
It bypasses normal rendering, so it returns a full HTML document, imports its own styles and fonts,
and links out with a plain `<a>` (no client router is mounted to take a soft navigation).

#### Sitemap

`app/sitemap.ts` emits one `<url>` per route, `<loc>` being the default-locale (unprefixed) address,
with `alternates.languages` producing `hreflang` links for `en`, `ja`, and `x-default`. Prefixes come
from `getPathname()` rather than string concatenation, so the prefix rule has one source of truth.

#### Server-side error messages — keyed on HTTP status, not error code

**Rails stays English-only, and `web/` localizes by HTTP status.**

The API has no machine-readable error code. Every failure is `{ error: "<English sentence>" }` plus a
status (`application_controller.rb:10,14`, `applications_controller.rb:62,64,66,81,91`), and
`extractError` (`web/app/lib/api.ts:109`) hands that sentence to the UI verbatim. So `web/` maps
**status → localized copy**: `401`, `409`, `422`, `429`, `502`, `503` each get a catalog entry.

This is a deliberate trade, not an oversight — see the decisions log entry below. The consequence to
know: a `422` carrying a per-field `errors.full_messages` string (`"Company can't be blank"`) cannot
be localized this way, because the status alone does not say which field failed. Those remain
English. In practice the common validation paths never reach Rails — `actions.ts` rejects empty
company/role client-side first — so the English residue is the uncommon case.

Localizing *in Rails* was rejected for the original reason: it would mean an i18n dependency, locale
negotiation on every request, and a second message catalog to keep in sync, for strings only the
frontend ever displays.

#### Locale-sensitive formatting

`Intl.RelativeTimeFormat` and `toLocaleDateString` in `app/lib/format.ts` take the active locale
rather than the hardcoded `"en"`. `<html lang>` and OpenGraph `locale` follow the active locale too.

#### What is not translated

Job-board brand names (`BOARD_LABELS`), schema.org enum values in the `jsonLd` blob, and the
`KarirKalyan` wordmark.

See `TODO.md` for remaining scope.

---

## Testing strategy

Two-tier, mirroring Awano's Vitest + Playwright split.

| Layer | Tool | DB? | What it tests |
|---|---|---|---|
| Unit | RSpec, no DB | No | FSM logic, service logic in isolation |
| Request | RSpec request specs | Yes, real Postgres | Full HTTP stack — routing, auth, response shape |
| E2E | Playwright | Yes | sign up → create → transition → timeline |

Unit specs for `ApplicationFSM` have zero database setup — pure Ruby: given these inputs, does
`assert_transition!` raise? Fast, no factories. This mirrors Awano's `vi.mock`-based Vitest tests.

Request specs hit a real PostgreSQL database via `database_cleaner-active_record`. They carry
`rswag` metadata, so `rake rswag:specs:swaggerize` generates the OpenAPI spec from the same file.
Every request spec is wrapped in `prosopite` for N+1 detection.

**Do not mock the database in request specs.** Mocked tests pass while real migrations are broken.
A real DB catches migration errors, constraint violations, and N+1 queries that mocks silently
ignore.

Coverage: SimpleCov, branch coverage on, 80% floor.

---

## Deployment (Railway)

**Two app services and one managed datastore.** No Redis. No worker service.

| Service | Root | Start command |
|---|---|---|
| `api` | `api/` | Dockerfile `CMD` — `rails server` (Puma, with the Solid Queue plugin) |
| `web` | `web/` | `npm run start` |
| PostgreSQL | managed | — |

Environment variables: `DATABASE_URL`, `DEVISE_JWT_SECRET_KEY`, `SECRET_KEY_BASE`, `FRONTEND_URL`,
`SOLID_QUEUE_IN_PUMA` (**required** — without it no job ever runs), `HONEYBADGER_API_KEY`,
`ANTHROPIC_API_KEY`, `SMTP_HOST`, `SMTP_PORT` (`2587`), `SMTP_USER`, `SMTP_PASS`, `MAILER_FROM`.

`SECRET_KEY_BASE` is a random secret for signing cookies (`bin/rails secret`). Chosen over
`RAILS_MASTER_KEY` because this app stores no secrets in `credentials.yml.enc`; sharing the dev
master key with production is unnecessary. Without one of these, the app aborts with
`Missing secret_key_base for 'production' environment`.

**Builder:** Railpack or a Dockerfile. Never Nixpacks — it is deprecated.

### Production lessons, recorded so they are not relearned

- **No Thruster.** It fronted Puma on a different port, creating a double proxy
  (Railway → Thruster → Puma) that 502'd when Railway's port matched Thruster's but not Puma's.
  Railway is already the reverse proxy; the second layer was overhead, not value.
- **`Dockerfile` `CMD` overrides `Procfile`** unless Railway explicitly invokes the Procfile. Both
  must agree. This silently broke the old single-service Puma+Sidekiq setup: only Puma ran, jobs
  enqueued to Redis, nothing consumed them, and reminders never sent. Solid Queue in Puma removes
  the whole class of failure.
- **`bin/docker-entrypoint`** ran `db:prepare` only when args matched `./bin/rails server`
  literally. After switching to `bundle exec rails server -b 0.0.0.0 -p 8080` the condition stopped
  matching and migrations stopped running. Match against `*"rails server"*`.
- **Cloudflare custom domain** (`kk.chairulakmal.com`): grey cloud (DNS only) is required for
  Railway's Let's Encrypt ACME HTTP-01 challenge. Orange cloud intercepts
  `.well-known/acme-challenge/` and breaks provisioning.
- **DNSSEC** drifted after a Cloudflare key rotation — the DS record at the registrar no longer
  matched — causing SERVFAIL on validating resolvers. Disabled cleanly: remove the DS record at the
  registrar *first*, then disable DNSSEC in Cloudflare.

---

## Local development

**Prerequisites:** Docker, Ruby 3.4.9 (via mise), Node 20+

```bash
cd api && docker compose up -d    # postgres 16 only — no Redis

cd api && bundle install && bin/rails db:create db:migrate && bin/rails server  # :3001
cd web && npm install && npm run dev                                            # :3000
```

Jobs run inline via the `:async` adapter in development — there is no worker process to start.

---

## Decisions log

Reversed decisions keep both entries. A spec that hides its own history teaches nothing.

### Job queue — Solid Queue over Sidekiq *(reversal — supersedes the entry below)*

Solid Queue and Solid Cache run on the existing Postgres and add zero Railway services. That one
change closed four separate findings at once: the recurring `FollowUpReminderJob` (Solid Queue
recurring tasks), a Rack::Attack throttle store shared across Puma workers (Solid Cache), durable
`deliver_later`, and the removal of a dead-feature caveat.

The cost is honest: Solid Queue is less observable than Sidekiq's dashboard, and its threads share
Puma's connection pool, which is a real constraint (see Background jobs). At personal scale, two
services and one Postgres beats three services, a Redis, and a worker that silently was not
running.

### ~~Job queue — Sidekiq over Solid Queue~~ *(reversed in v1.0.0)*

> The original reasoning: Sidekiq is the standard in most Tokyo Rails shops and a more mature,
> observable runtime. It also *introduced* Redis, which then backed the production `Rails.cache`
> and the Rack::Attack throttle store.

What actually happened: under a Dockerfile build, Railway ignores the `Procfile`, so only Puma ran
and nothing consumed the queue. Reminders and welcome emails silently never sent. The fix was
either a dedicated `sidekiq` service — three services plus Redis — or removing Sidekiq. The second
was better at this scale. **The industry-standard choice was the wrong choice here**; "what Tokyo
shops use" is a poor tiebreaker for a single-user app's infrastructure.

### Serialiser — plain `as_json` override, no gem

Each model overrides `as_json` explicitly. Easy to read, nothing to explain, no magic.
`Application#as_json` excludes `resume` and `cover_letter`.

### File storage — PostgreSQL `bytea`, 1 MB cap

Raw bytes in `bytea`. No Active Storage, no S3. Right-sized for personal scale: files are small,
transactional consistency with the rest of the row is free, no presigned-URL complexity. The limit
is enforced in the model, not at the database level.

Thumbnail previews were considered and rejected — they need `poppler`/`ghostscript` on the server
plus extra storage, and are rarely useful in a personal tracker.

### File timestamps — `resume_updated_at` / `cover_letter_updated_at`

Two datetime columns set via `before_save` callbacks using dirty tracking
(`will_save_change_to_resume?`), so they fire only when the binary actually changes. Rendered as
"resume.pdf · uploaded 3 days ago" — no thumbnail needed.

This is the one place callbacks are used, and deliberately so: it is a property of the row, not
business logic, and it must hold for seeds and factories too.

### Reminders surface both in-app and by email

A reminder writes a `TimelineEntry` on the detail page, and the same job sends an email. It started
in-app only — for a tracker you check daily, a timeline entry avoids spam and unsubscribe handling.
Email was added once the nudge needed to reach the user when the app was *closed*, which is the
point of a reminder. The `TimelineEntry` remains the source of truth.

### AI URL pre-fill — Claude Haiku 4.5, server-side, SSRF-guarded

Runs entirely server-side in a service object, never from the browser, so the Anthropic key never
leaves the server and rate limiting and the outbound-fetch guard live in one place. A tool/JSON
schema rather than free-form text, so the fields are structured and need no parsing. Haiku 4.5
because extraction is a small job — a larger model would spend money for no benefit. Claude over
the alternatives for native Japanese comprehension, which is what makes the feature useful for a
Tokyo job search. Degrades gracefully: with no API key the endpoint returns `503` and the rest of
the app is unaffected.

### Error localization keyed on HTTP status, not on an error code

The obvious design is for Rails to return a stable machine-readable code (`stale_record`,
`invalid_credentials`) and for `web/` to look that code up in a message catalog. The API's codes stay
the single source of truth, `web/` supplies presentation, and nothing is duplicated.

**That design was specified before anyone checked the response shape, and the shape does not support
it.** Rails returns a free-text English sentence and an HTTP status — there is no code, anywhere.
Adding one is an `api/` change, and v1.1.0 is `web/`-only by design (see `TODO.md`).

Rather than break the boundary for a frontend release, or invent a code by string-matching English
sentences in `web/` — which is a parser for prose, and breaks the first time someone rewords a
validation message — v1.1.0 localizes on the status. Coarse, but every string it produces is correct,
and the two errors users actually see (`401` bad credentials, `409` stale `lock_version`) are exactly
the ones a status distinguishes cleanly.

The cost is per-field `422` text staying English. The fix is real error codes, and it belongs in
**v1.2.0**, which already opens with an `api/` change for the FSM transition table. One `api/` PR,
two reasons.

The general lesson is the one this file exists to enforce: a spec that describes a mechanism nobody
verified is a bug in the spec, not a requirement on the code.

### No Company / Platform / Tag models

These add CRUD without adding new patterns. The goal is to show FSM, transactional writes,
background jobs, and two-tier testing — not to maximise model count. The URL host already supports
the job-board filter.

### DB cleaning — `database_cleaner-active_record`, transaction strategy

Wraps each spec in a transaction and rolls back. Fastest option; truncation is only needed for
multi-connection scenarios this project does not have.

---

## What this project is demonstrating

| Concern | Approach | Why it matters |
|---|---|---|
| State machine | Custom PORO — no gem | Keeps logic visible; understanding over convenience |
| Audit trail | Transactional `TimelineEntry` on every status change | Data integrity, not just logging |
| Auth | Devise + devise-jwt with JTI revocation | Stateless JWT with a real logout mechanism |
| Concurrency | Optimistic locking (`lock_version`) | Awareness of concurrent writes |
| Background jobs | Solid Queue + idempotency key | Defensive job design under at-least-once delivery |
| File storage | PostgreSQL `bytea`, 1 MB limit | Right-sized — no object-storage overhead |
| Query design | SQL aggregation for dashboard stats | No N+1; no loading records into Ruby needlessly |
| API docs | rswag — specs double as OpenAPI source | Tests and docs cannot drift |
| Testing | Unit specs (no DB) + request specs (real DB) | Two-tier strategy matching Awano's Vitest + Playwright |

This project intentionally mirrors [Awano](https://github.com/chairulakmal/awano), a Next.js
multi-tenant support desk. A reviewer can compare both and see the same engineering thinking — FSM,
transactional audit trail, service layer, two-tier testing — expressed in two stacks.
