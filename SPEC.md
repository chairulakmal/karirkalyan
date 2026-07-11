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

Last synced against the code: **2026-07-11**, post-`v1.2.0` (API error codes + the
transition-table endpoint; `web/` error catalog keyed on those codes; the `/board` Kanban view;
variable font builds for Fraunces and Manrope).

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

`valid_next_states` is serialised by `show` and `transition` only — **not by `index`**, which
stays lean. A board view gets the whole effective table in one request from
`GET /api/v1/transitions` instead — see § API contract.

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

All routes are JSON. Every error response is:

```json
{ "error": "<English sentence>", "code": "<stable_code>" }
```

`error` is a single human-readable string — never an array; validation failures join their
messages into it. `code` is the machine-readable half of the contract: a stable snake_case
identifier that `web/` can key its message catalog on, so localization never has to parse
English prose. The full code table is below. `validation_failed` responses additionally carry
the failing fields:

```json
{
  "error": "Company can't be blank. Role can't be blank",
  "code": "validation_failed",
  "details": [
    { "field": "company", "code": "blank" },
    { "field": "role", "code": "blank" }
  ]
}
```

`details[].code` is the ActiveModel error type (`blank`, `inclusion`, `too_long`, …), so a
catalog can localize per field without string-matching the sentence.

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
GET    /api/v1/transitions                        the FSM's effective transition table
GET    /api/v1/dashboard                          SQL aggregation + facets
GET    /api/v1/me                                 authenticated user's profile

GET    /up                                        deep health check — pings Postgres
GET    /api-docs                                  Swagger UI (rswag)
GET    /api-docs/v1/swagger.yaml                  generated from request specs
```

Every record is reached through `current_user.applications`, so cross-user access returns `404`,
not `403`.

#### Error codes

Every `code` the API can return, with the status it rides on. The status is still meaningful on
its own (a `409` is retryable, a `422` is not), but the code is what clients should branch on.

| `code` | Status | When |
|---|---|---|
| `unauthenticated` | `401` | Missing, expired, or revoked JWT (Devise failure app) |
| `invalid_credentials` | `401` | Sign-in with a wrong email or password |
| `not_found` | `404` | No such record — including another user's record |
| `stale_record` | `409` | `ActiveRecord::StaleObjectError` — optimistic-locking conflict |
| `invalid_transition` | `422` | FSM `InvalidTransitionError` |
| `validation_failed` | `422` | Model validation failure (create/update, sign-up, file upload); carries `details` |
| `invalid_url` | `422` | Bad or private/internal pre-fill URL |
| `rate_limited` | `429` | Rack::Attack throttle; `Retry-After` header set |
| `prefill_failed` | `502` | AI extraction failed |
| `prefill_unavailable` | `503` | `ANTHROPIC_API_KEY` missing — the rest of the app keeps working |

Codes are append-only: renaming or removing one is a breaking change to `web/`'s message
catalog, adding one is not (unknown codes fall back to status-keyed copy). `/up` also returns
`503` when Postgres is down, but it is a health probe with its own body shape
(`{ status, checks }`), not part of this error contract.

#### The transition table — `GET /api/v1/transitions`

A Kanban board must know which drops are legal *before* the drop, and
`ApplicationFSM::TRANSITIONS` is the only source of truth — the shape cannot be guessed from
the state list (revival paths like `ghosted → applied` are legal; most forward skips are not).
So the API serves the table read-only:

```json
{
  "states":          ["wishlist", "draft", "applied", "…all 13, pipeline order first"],
  "entry_states":    ["wishlist", "draft", "applied"],
  "terminal_states": ["accepted", "declined", "archived"],
  "transitions":     { "wishlist": ["draft", "withdrawn", "archived"], "…": ["…"], "accepted": [] }
}
```

`transitions` maps **every** state through `ApplicationFSM.valid_next_states`, so the archived
rule (any non-terminal state → `archived`, an early return in `assert_transition!`, not a row
in `TRANSITIONS`) is already folded in — this is the *effective* table, not the raw constant.
Terminal states map to `[]`. The payload is static per deploy and authenticated like every
other route.

Consuming this at runtime is the sanctioned alternative to mirroring the table in TypeScript:
a fetched copy cannot drift from the server, a re-typed copy can. The server still rejects
illegal transitions regardless — the client's copy only decides what *looks* droppable.

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

### Design system — `web/app/globals.css`

`design/assets/tokens.css` is the brand book; `globals.css` is the only place those tokens enter the
app, through Tailwind v4's `@theme inline`. Ten colours — the nine brand hues plus `--color-danger`,
a warm madder (`#96291D`) for destructive actions, error text, and terminal-negative statuses, always
applied through opacity modifiers (`text-danger`, `bg-danger/10`, `ring-danger/30`) and never stock
Tailwind `red-*` — three typefaces (Fraunces display, Manrope body, IBM Plex Mono labels), and
**radius `0`** — the sharp corners are the editorial voice, not an oversight.

The typefaces load through `next/font/google` in `web/app/[locale]/layout.tsx` (and
`global-not-found.tsx`, whose two families use the same variable form so its files are
content-hash-shared with the layout's). Fraunces and Manrope are **variable builds** — Fraunces
with `axes: ["opsz"]` in normal + italic, Manrope with
the default `wght` axis — while IBM Plex Mono has no variable build and stays static at 400/500.
That is five base `woff2` files instead of the fifteen static instances loaded before, and it is
also what makes the `font-variation-settings` rules below actually bind: `opsz`/`wght` variation
settings are no-ops on a static instance, so the heading and wordmark cuts *require* the variable
builds — don't "optimize" back to enumerated weights.

Three things there are easy to get wrong:

- **Motion is set through Tailwind's own variables**, `--default-transition-duration` and
  `--default-transition-timing-function`. Overriding those means every bare `transition` utility
  already in the codebase inherits the brand's `cubic-bezier(.2,.6,.2,1)` — no one has to remember a
  custom `ease-brand` class. A `prefers-reduced-motion` block flattens all of it.
- **Fraunces is an optical-size variable font, and `opsz` is not a size** — it is how the letterforms
  are drawn *for* a size. The `h1, h2, h3` rule sets `opsz 36`, a heading cut whose thin joins go
  weak past ~60px. The homepage hero therefore uses `.kk-display` (`opsz 144`, the wordmark's cut,
  with tracking pulled in). It is the only display-scale type on the site.
- **`:focus-visible` is declared once, globally**, as a cobalt ring. Before that each interactive
  element re-declared its own and anything that forgot fell back to the UA outline, which is
  invisible against sand.

`.kk-wordmark` (upright "karir" + italic cobalt "kalyan"), `.kk-label` (mono eyebrow), and
`.kk-num` (mono ordinal, tabular figures) are the only other custom classes; everything else is
Tailwind utilities.

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

### Public pages — `/`, `/about`, `/docs`

The homepage argues one claim: this is a job tracker **built on a finite state machine** — thirteen
states, an explicit transition table, an immutable audit trail, the stack named outright. Its primary
call to action is "How it's built" (→ `/about`; 設計を読む in Japanese); the demo is second. It is
aimed at a reviewer reading the code, not at a jobseeker shopping for a tracker.

On viewports below `sm` (640px) the headers **declutter rather than collapse into a menu**, because a
hamburger would hide the locale switcher — and the marketing and auth headers are where a Japanese
visitor meets the app before any session exists to remember a preference. Each header drops only what
is redundant at that width: the homepage hides its "About" nav link (the hero's primary CTA is the
same destination, immediately below), and the signed-in app shell hides its "Dashboard" link and the
wordmark text (the mark beside it already links to `/dashboard`). Everything that remains — sign-in /
new / sign-out and the locale switcher — stays visible and one tap away, and fits a 375px viewport in
Japanese, the wider locale, without wrapping.

Below the hero it draws the machine it claims to be built on:
`web/app/components/pipeline-diagram.tsx` draws the happy path as a vertical rail of status chips —
the register of a git log, which is the audit trail's own aesthetic, and a layout that never wraps
on a phone — with the three closed states below it rejoining the rail at `applied` along a dashed
cobalt return trace, so "it is not a line" is drawn rather than only stated. **It is an
illustration, not a second copy of the transition table.** The real table has thirty-three edges and lives only in
`api/app/lib/application_fsm.rb`; the diagram names that file in its caption, nothing in the app
reads the diagram, and no behaviour depends on it — a stale arrow there is a wrong drawing, never a
wrong transition. Mirroring the full table in TypeScript is precisely what deferred the Kanban board
to v1.2.0; the board answers that by *fetching* the table (§ Board view), and this diagram answers it
by not needing one. Chip labels come from the `status` catalog and chip colours from
`statusBadgeClass`, so the FSM's vocabulary still has one home.

Below the diagram, four numbered cards state the four claims the code has to back: the explicit
transition table, the append-only audit trail, Solid Queue on Postgres, and the Kanban board that
reads its legal moves from the API instead of copying them. They sit in one hairline grid — two
across at `md`, four at `lg`.

`/about` therefore carries the visit. It states four decisions, each as the cheaper alternative it
rejected: Rails for a TypeScript developer, a PORO FSM over a state-machine gem, Solid Queue over
Sidekiq and Redis, `bytea` over object storage. Those arguments are the ones in the decisions log
below, written for someone who has not read this file.

`/docs` frames the API — auth, per-user scoping, the `{ error, code, details? }` failure envelope,
cursor pagination, and the endpoint table — and then links out to the rswag Swagger UI. Deep-linking raw Swagger on a
`*.up.railway.app` domain drops the visitor out of the design system; the reference stays reachable,
one click further in. The endpoint table's methods and paths are code and are not translated; only
the sentence beside each one is.

### Route guard — `web/proxy.ts`

Next.js 16 renamed `middleware.ts` → `proxy.ts`; a `middleware.ts` file is **ignored**. Export a
function named `proxy`.

Authorization is presence of the `session` cookie — there are no roles. Paths fall into three
categories, checked in this order:

| Category | Paths | Without a cookie | With a cookie |
| --- | --- | --- | --- |
| `OPEN_PATHS` | `/about`, `/docs` | renders | renders |
| `PUBLIC_PATHS` | `/`, `/sign-in`, `/sign-up` | renders | `307` → `/dashboard` |
| everything else | `/dashboard`, `/applications/*`, … | `307` → `/sign-in` | renders |

`OPEN_PATHS` is checked first and skips both redirects. `/about` and `/docs` explain how the system
is built rather than selling it, so bouncing a signed-in reader to the dashboard would hide them
from the people most likely to read them — which is why they are not more `PUBLIC_PATHS` entries.
The signed-in app shell's "For reviewers" footer links to both, and that link only resolves because
of this. Matching is by segment: `/about` also covers `/about/anything`, but never `/aboutish`.

`config.matcher` **must** exclude `/robots.txt`, `/sitemap.xml`, and `/llms.txt`, or crawlers get a
`307` to sign-in and the whole SEO surface becomes unreachable.

It also resolves the locale and applies next-intl's rewrite/redirect before the auth check, so the
guard always sees a locale-stripped pathname. See the i18n section below.

`proxy.ts` also sets the CSP. The policy is per-request nonce-based
(`script-src 'self' 'nonce-…' 'strict-dynamic'`), with no `'unsafe-inline'`; development keeps
`'unsafe-eval'` for HMR. **Because nonces are applied only during SSR, `await connection()` in the
root layout opts the whole app into dynamic rendering**, so every page's scripts get the nonce.
There is consequently no static optimization left to lose — which is why locale-prefixed routing in
v1.1.0 costs nothing.

### Board view — `/board`

A Kanban view of the same applications the dashboard lists: one column per active status, cards
moved by drag or by menu, each move a real FSM transition. It lives under the `(app)` route group,
so the route guard's "everything else" row already protects it — no `proxy.ts` change. The header
gains a `nav.board` link beside Dashboard; unlike the Dashboard link it stays visible below `sm`,
because there is no second way to reach the board.

The **route is `/board`; the label is "Kanban"** (カンバン) — in the nav (`nav.board`) and as the
page title (`board.title`). "Board" names the thing generically and could be any of the app's
views; "Kanban" names the one pattern the page actually is, and it is the word both audiences
already have. The path stays `/board` because a URL that moves is a URL that breaks, and the
message namespace stays `board.*` for the same reason.

#### Data — one bounded fetch-all, plus the transition table

The server page makes two fetches in parallel:

- **Applications** — the cursor-paginated `GET /applications` followed to exhaustion at
  `limit=100`, capped at 10 pages. A board is a view of *everything*, so pagination is the wrong
  UI; but "fetch all" against a cursor API must be bounded or one pathological account hangs the
  page. Past ~1,000 applications the board renders what it fetched plus a `board.truncated`
  notice. Per-column cursors ("load more" inside each column) were rejected — see the decisions
  log.
- **The transition table** — `GET /api/v1/transitions`. The board *fetches* the table; it never
  mirrors it. `ApplicationFSM::TRANSITIONS` stays the only copy (§ State machine), which is the
  invariant that deferred this feature to v1.2.0 in the first place.

#### Columns — seven active, one closed rail

The seven columns are exactly `ACTIVE_STATUSES` (`format.ts`), laid out as a wrapping grid rather
than a horizontal scroller — four columns per row on large screens, two per row on small screens,
one on the narrowest — keeping every column on screen without sideways scrolling. Display order is
board-local and grouped by engagement, not funnel order: the four-column row break puts the
interview loop (applied, phone_screen, technical, final_round) on the first row and everything
outside it (wishlist, draft, offer) on the second. Membership still derives from
`ACTIVE_STATUSES`, so the order list can never hide a column. The six closed
states — accepted, declined, rejected, ghosted, withdrawn, archived — do not get columns; thirteen
columns is unreadable at any width. They collapse into a **closed rail** below the board, one
toggleable group per status showing a count, expanding to the same cards.

Cards keep the server's order within a column. There is no intra-column reordering: position is
not API data, and inventing a client-side order would be a second source of truth.

#### Moving cards — native drag-and-drop, card menu as the accessible path

Drag-and-drop is native HTML5 (`draggable`, `dragover`, `drop`) — no dependency; what it can't do
(touch, animation polish) is not worth a library at this scale (see decisions log). Drag is
card → column only. While a card is dragged, columns that are legal targets *per the fetched
table* highlight; dropping anywhere else is a silent no-op. The closed rail is **not** a drop
target: moves into closed states carry intent — an offer accepted, a process abandoned — that a
flick of the wrist shouldn't express.

Every card carries a focusable menu button listing **all** legal next states, including the
closed ones drag refuses. The menu is the accessible path and the only complete one; drag is a
convenience layered on top. The confirm/revival semantics (`CONFIRM_REQUIRED`, `REVIVAL_STATES`,
`HARD_TERMINAL`) move out of `transition-buttons.tsx` into a shared module so the detail page and
the board cannot drift.

The table only decides what *looks* droppable. The server re-validates every transition through
`Applications::TransitionService` regardless — a stale table degrades the highlighting, never the
data.

#### Optimistic moves, 409 reverts

A move applies optimistically via `useOptimistic` and calls the existing `transitionStatus`
server action. On failure the card snaps back to its source column and a board-level localized
notice shows the resolved error (§ Server-side error messages). A `409` / `stale_record`
additionally triggers `router.refresh()`, since the board's copy of that application is stale by
definition. `revalidateApplication()` in `actions.ts` revalidates `/board` alongside
`/applications/[id]` and `/dashboard`, so moves made elsewhere reach the board on next render.

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
2. The auth guard runs against that **locale-stripped** path, so `PUBLIC_PATHS` and `OPEN_PATHS`
   stay lists of a few entries rather than one per locale, and `/ja/dashboard` is protected exactly
   as `/dashboard` is. Its redirects re-apply the prefix, so a signed-out `/ja/dashboard` visitor
   lands on `/ja/sign-in`.
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

#### Locale switcher

`app/components/locale-switcher.tsx` is a two-locale **toggle**, not a list: it renders only the
language the visitor is *not* reading, named in that language (`日本語` on an English page,
`English` on a Japanese one). Showing the active locale as well would restate what the page
already says in every other word on it. A third locale makes this a menu — the component picks a
single `target` and that stops being well-defined.

The visible label is a bare language name, which can be read as a statement rather than an
action, so the accessible name supplies the verb via `locale.switchTo` (`Switch to {language}`).

It switches with `router.replace`, not `push` — changing language corrects the current page
rather than advancing through the site — and passes the **locale-stripped** `usePathname()`, so
`/ja/applications/7` and `/applications/7` map onto each other with no string surgery.

It is mounted in the app shell (`(app)/layout.tsx`), the marketing header (`[locale]/page.tsx`),
and the auth layout (`(auth)/layout.tsx`). The last two matter because a Japanese visitor meets
the app there, before any session exists to remember a preference.

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

Its `ROUTES` list holds only what a signed-out crawler can reach: `/`, `/about`, `/docs`,
`/sign-up`, `/sign-in`. Everything behind the session cookie is a `307` and has no business being
advertised.

#### Metadata description comes from the catalog

`generateMetadata` in `app/[locale]/layout.tsx` reads its description from `home.tagline` rather than
holding a second copy as a constant. A Japanese search result should say what the Japanese homepage
says. `/about` and `/docs` each override `title` and `description` from their own catalog namespace,
which the layout's `title.template` renders as `… — KarirKalyan`.

#### Server-side error messages — keyed on the error code, HTTP status as fallback

**Rails stays English-only, and `web/` localizes by the machine-readable `code`** the API
returns on every failure (see § API contract), falling back to the HTTP status when the code
has no catalog entry.

An upstream failure resolves to localized copy in this order — first hit wins:

1. **Per-field validation details.** When the failure is `validation_failed`, each
   `details[]` entry is looked up as `errors.field.<field>_<code>`
   (`errors.field.email_taken`, `errors.field.resume_too_long`); every entry with catalog
   copy is rendered, joined into one message. Fields or inner codes without an entry are
   skipped rather than guessed at.
2. **The code.** `errors.code.<code>` — `invalid_credentials`, `stale_record`,
   `invalid_transition`, `invalid_url`, `prefill_failed`, and the rest of the § Error codes
   taxonomy each have an entry.
3. **The status.** The v1.1.0 map survives as the fallback: `401`, `403`, `404`, `409`,
   `422`, `429`, `502`, `503` under the `errors` namespace. It catches non-JSON failures,
   codes added to the API before the catalog learns them, and route-handler-synthesized
   errors that carry no code.
4. `errors.unknown`.

Nothing ever string-matches the English `error` sentence — the codes exist precisely so no
one has to parse prose. Codes are append-only on the API side, and step 3 means an unknown
code degrades to the v1.1.0 behaviour rather than breaking.

Two places do this resolution, because a failure reaches the UI by two paths:

- `apiFailure()` in `app/lib/actions.ts` — takes the whole failed `ApiResult` (which
  `apiFetch` now decorates with `code` and `details` alongside `error` and `status`); every
  server action localizes before it returns, so the client components that render
  `result.error` need no translation logic of their own. Failures the action catches *before*
  the request (empty company/role, no file chosen, no URL to pre-fill) name a catalog key
  directly through `localFailure()`, since they have neither code nor status to key on.
- `errorMessage()` in `(auth)/sign-in/sign-in-form.tsx` — the auth form talks to the
  `/api/auth/*` route handlers over `fetch`, not through a server action, so it parses the
  response body itself and runs the same resolution. The route handlers pass the upstream
  `code`/`details` through (the register handler forwards the Rails envelope unchanged; the
  session handler substitutes its own copy for security-sensitive statuses but keeps the
  code). Per-call status overrides remain as the fallback layer — a `401` there means bad
  credentials, not a dead session.

Catalog presence is tested with next-intl's `t.has()`, so steps 1–2 need no hardcoded list of
known codes in TypeScript — the catalogs themselves are the list, and `en`/`ja` key parity is
already enforced.

Localizing *in Rails* was rejected for the original reason: it would mean an i18n dependency,
locale negotiation on every request, and a second message catalog to keep in sync, for strings
only the frontend ever displays.

#### Locale-sensitive formatting

`Intl.RelativeTimeFormat` and `toLocaleDateString` in `app/lib/format.ts` take the active locale
rather than the hardcoded `"en"`. `<html lang>` and OpenGraph `locale` follow the active locale too.

`formatDate()` pins `timeZone: "Asia/Tokyo"`. The API serialises in app time, and a date-only field
like `follow_up_at` parses as UTC midnight, so without the pin a viewer west of UTC would see the
previous day — and `isOverdue()`, which compares date strings, would disagree with what is on screen.

`format.ts` holds no copy. Status labels and descriptions live in the `status` namespace of the
catalogs, keyed by status (`status.label.applied`, `status.description.applied`); an English copy in
`format.ts` would give the FSM's vocabulary two sources of truth. What stays in the module is what
cannot be translated: the badge palette, the status sets, and `BOARD_LABELS`. `jobBoardLabel()` takes
the localized `(none)` label as an argument rather than reaching into a catalog from a pure module.

#### What is not translated

Job-board brand names (`BOARD_LABELS`), schema.org enum values in the `jsonLd` blob, the
`KarirKalyan` wordmark, and the HTTP methods and paths in the `/docs` endpoint table.

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

*(Addendum, v1.2.0: both halves landed — every API error carries a stable `code`
(`validation_failed` with per-field `details`), and `web/` now keys its catalog on the code,
with the status map demoted to the fallback layer. See § Server-side error messages for the
resolution order.)*

The general lesson is the one this file exists to enforce: a spec that describes a mechanism nobody
verified is a bug in the spec, not a requirement on the code.

### Board data — bounded fetch-all over per-column cursors

The board follows the existing cursor-paginated index to exhaustion (`limit=100`, capped at 10
pages) rather than giving each column its own cursor with a "load more". Per-column pagination
looks more scalable but is fake precision here: it needs a new `status` filter parameter on the
API, seven initial requests instead of a handful, and it breaks the board's one job — showing the
whole pipeline at a glance. The cap keeps the pathological case (thousands of rows) from hanging
the page; a personal tracker that hits it has outgrown a personal tracker. The truncation is
stated on screen, not silent.

### Board drag-and-drop — native HTML5, no library

`dnd-kit` and friends buy touch support, keyboard dragging, and animation polish. The board
doesn't need them: the card menu is already the keyboard path and the only complete one (drag
can't reach the closed rail), which demotes drag to a pointer convenience — and a pointer
convenience doesn't justify a dependency. Native `draggable`/`drop` events are ~30 lines. If
touch dragging ever matters, the menu already works on touch today, and a library can replace the
listeners without touching the data flow.

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
