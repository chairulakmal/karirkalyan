# KarirKalyan: Technical Specification

> The technical source of truth for KarirKalyan, a full-stack job application tracker: Rails 8 API (`api/`) + Next.js 16 frontend (`web/`). It describes the system **as it is**, and the most important rule about it is **spec-first: change this file before you change code**; if code and spec disagree, one of them is a bug. It is a reference, not an essay: callouts, tables, schemas and invariant lists covering both apps end to end (data model, state machine, services, API contract, jobs, security, auth, i18n, the installable app), plus testing, deployment, local dev and versioning. The full table of contents is under [Contents](#contents); the reasoning behind each decision, and the release archaeology that used to sit inline here, live in [`notes/HISTORY.md`](notes/HISTORY.md).

Last synced against the code: **2026-08-21**.

---

## How to use this file

**SPEC.md is the technical source of truth. Change it before you change code.**

1. **Write the change here.** Amend the data model, the API contract, the state machine: whatever the change actually touches. If you cannot describe it here, you do not yet understand it well enough to build it.
2. **Get the spec right.** A spec that disagrees with itself produces code that disagrees with itself.
3. **Then write the code**, and make it match.

- **If code and SPEC.md disagree, that is a bug in one of them.** Decide which is wrong and fix that one. This file spent an entire release describing Sidekiq and Redis after both had been removed, which is why it carries the rule.
- **SPEC.md describes the system as it is**, present tense. Open work is [`TODO.md`](TODO.md); shipped work is [`CHANGELOG.md`](CHANGELOG.md); why a thing was decided, and what was tried first, is [`notes/HISTORY.md`](notes/HISTORY.md).
- **This file is a reference.** Prose that only explains *why* belongs in `notes/HISTORY.md`; what belongs here is what a reader must not get wrong.

## Contents

- [How to use this file](#how-to-use-this-file)
- [System overview](#system-overview) · [Registration is closed](#registration-is-closed)
- [Backend (`api/`)](#backend-api) · [Tech stack](#backend-tech-stack) · [Data model](#data-model) · [State machine](#state-machine) · [Service layer](#service-layer) · [Query layer](#query-layer) · [API contract](#api-contract) · [Background jobs](#background-jobs) · [Mail](#mail) · [Security](#security) · [Passkeys (WebAuthn)](#passkeys-webauthn) · [Push notifications](#push-notifications) · [Observability](#observability)
- [Frontend (`web/`)](#frontend-web) · [Tech stack](#frontend-tech-stack) · [Design system](#design-system) · [Auth flow](#auth-flow) · [Public pages](#public-pages) · [Legal pages](#legal-pages) · [Route guard](#route-guard) · [Caching](#caching-use-cache) · [Dashboard layout](#dashboard-layout) · [Board view](#board-view) · [Pinned applications](#pinned-applications) · [Toast feedback](#toast-feedback) · [i18n](#i18n) · [Installable app](#installable-app)
- [Testing strategy](#testing-strategy)
- [Deployment (Docker + Cloudflare Tunnel)](#deployment-docker--cloudflare-tunnel) · [Network exposure](#network-exposure-audited-2026-08-20) · [Backups](#backups)
- [Local development](#local-development)
- [Versioning & releases](#versioning--releases) · [The version number lives in the git tag](#the-version-number-lives-in-exactly-one-place-the-git-tag)
- [What this project is demonstrating](#what-this-project-is-demonstrating)

Not here, by design: the **decisions log** (including reversals) and the **production lessons** are in [`notes/HISTORY.md`](notes/HISTORY.md); the operator runbook is in [`notes/OPS.md`](notes/OPS.md).

---

## System overview

> **At a glance** · Two deployables. `api/` (Rails 8) owns data, auth, the FSM, and background jobs; `web/` (Next.js 16) owns the UI and the browser session. The one hard rule at the boundary: **the JWT never reaches client-side JavaScript.**

```
karirkalyan/
  api/    ← Rails 8 API-only. Owns data, auth, the FSM, background jobs.
    docker-compose.yml   ← postgres 18 for local dev (no Redis)
  web/    ← Next.js 16 App Router. Owns the UI and the browser session.
  notes/  ← HISTORY.md (decisions, releases) and OPS.md (runbook) are tracked; everything else is scratch
```

### Registration is closed

> **At a glance** · No public sign-up: no endpoint, no page, no invite. Visitors use the shared demo account; real accounts are created by the operator, server-side. The trade is deliberate: it avoids a custodial promise over strangers' resumes this deployment cannot keep. Account *deletion* stays (`DELETE /api/v1/auth/account`).

```ruby
devise_for :users, path: "/api/v1/auth", skip: [ :registrations ], …

namespace :api do
  namespace :v1 do
    namespace :auth do
      delete "account", to: "registrations#destroy"
```

- `skip: [ :registrations ]` removes `POST /api/v1/auth` entirely; the destroy action is re-added by hand, so deletion survives without sign-up coming back with it.
- Accounts are created by the operator with `bin/rails users:create`, which is also what `db/seeds.rb` uses.
- The **demo account is exempt from destruction**: `DELETE /api/v1/auth/account` on it answers `403 forbidden`, because it is shared and hourly-reset (§ Background jobs).

---

## Backend (`api/`)

### Backend tech stack

| Technology | Alternative considered | Reason |
|---|---|---|
| Rails 8 API-only | Full-stack Rails | No HTML views needed; clean API contract |
| Ruby 3.4.9 (via mise) | System Ruby | Reproducible across machines |
| PostgreSQL 18 | SQLite | Foreign keys, `EXTRACT()` for date math, production-grade |
| Devise + devise-jwt | Roll own JWT | Proven auth layer; JTI revocation solves logout |
| `webauthn` gem, hand-wired | `devise-passkeys` | Passkey ceremonies; the Devise extension is not mature enough to lean on (§ Passkeys) |
| Custom PORO FSM | `state_machines` gem | Visible logic; the transitions table is the documentation |
| Service objects | Fat models / callbacks | Explicit call sites; easy to test in isolation |
| **Solid Queue + Solid Cache** | Sidekiq + Redis | Postgres-backed; no Redis, no extra service |
| PostgreSQL `bytea` for files | Active Storage + S3 | Files are ≤ 1 MB; no object-storage overhead at this scale |
| RSpec + FactoryBot | Minitest | Industry standard in Tokyo Rails shops |
| rswag | Hand-written OpenAPI | Request specs and docs share one source of truth |
| `anthropic` gem | HTTP by hand | Typed tool/JSON-schema responses for URL pre-fill |

### Data model

> **At a glance** · Six tables. `users` holds Devise auth and the `jti` used for JWT revocation. `credentials` holds WebAuthn passkeys, one row per enrolled authenticator. `push_subscriptions` holds Web Push registrations, one row per subscribed browser. `agencies` holds recruitment agencies, a per-user vocabulary the recruiter channel resolves names into. `applications` is the core FSM entity: `status`, plus `resume`/`cover_letter` as `bytea`, plus the Japan-market columns. `timeline_entries` is an append-only audit log, one row per status change.

#### `users`

```
users
  id
  email                string, not null, unique
  encrypted_password   string, not null
  jti                  string, not null, unique   ← JWT revocation
  webauthn_id          string                     ← WebAuthn user handle; set on first passkey enrollment
  residence_status     string                     ← the user's own 在留資格 (User::RESIDENCE_STATUSES)
  residence_expires_on date                       ← its expiry; drives the days-remaining read
  created_at, updated_at
```

#### `credentials`

```
credentials
  id
  user_id       FK → users, not null
  external_id   string, not null, unique    ← the credential ID the authenticator minted (Base64URL)
  public_key    string, not null            ← COSE public key (Base64URL); verifies assertions
  sign_count    bigint, not null, default 0 ← authenticator signature counter; clone detection
  nickname      string                      ← optional label for the settings list
  last_used_at  datetime                    ← set on each successful assertion
  created_at, updated_at

  index (user_id)
  index (external_id) unique
```

#### `push_subscriptions`

```
push_subscriptions
  id
  user_id       FK → users, not null
  endpoint      string, not null, unique    ← the push service URL the browser minted
  p256dh        string, not null            ← client public key; encrypts the payload
  auth          string, not null            ← client auth secret; same
  created_at, updated_at

  index (user_id)
  index (endpoint) unique
```

#### `agencies`

```
agencies
  id
  user_id  FK → users, not null
  name     string, not null
  created_at, updated_at

  index (user_id, name) unique
```

Agency names are a **per-user vocabulary**: resolved case-insensitively by name on write, created on first use, never shared between users.

#### `applications`

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
  resume_updated_at       datetime           ← set by a before_save; also the MMDD in the download name
  cover_letter_updated_at datetime           ← same
  channel                 string             ← direct | agent | referral (Application::CHANNELS)
  agency_id               FK → agencies      ← which agency submitted this one; meaningful with channel = agent
  japanese_level          string             ← the posting's requirement (Application::JAPANESE_LEVELS)
  sponsorship             string, default: "unknown"  ← does the employer sponsor a work visa (Application::SPONSORSHIP)
  status_of_residence     string             ← which 在留資格 this role is under, when sponsored (Application::STATUSES_OF_RESIDENCE)
  hiring_entity           string             ← how a Japan-resident hire is employed (Application::HIRING_ENTITIES)
  company_timezone        string             ← the company's home IANA zone (Application::COMPANY_TIMEZONES)
  overlap_hours_required  float              ← required daily overlap with the company's hours, in hours
  interview_at            datetime           ← the upcoming interview instant; source for the .ics export and push reminders
  comp_annual_min_yen     bigint             ← quoted 年収, low end, in yen
  comp_annual_max_yen     bigint             ← high end; null when the posting quotes one figure
  comp_months_guaranteed  float              ← months of base guaranteed per year (12 + guaranteed bonus)
  comp_months_variable    float              ← performance-tied bonus months on top
  posting_snapshot        text               ← stripped posting text captured at prefill; ≤ MAX_TEXT_CHARS
  lock_version            integer, default: 0   ← optimistic locking
  created_at, updated_at

  index (user_id, created_at DESC)   ← composite; serves the cursor-paginated list
  index (status)
  index (follow_up_at)
  index (agency_id)
```

Rules that are not visible in the column list:

| Rule | Detail |
|---|---|
| `status` is never mass-assignable | Not in any strong-params list; validated against `ENTRY_STATES` on create and written only by `Applications::TransitionService` thereafter |
| Ceiling | `Application::MAX_PER_USER` = **200**, enforced as a model validation with detail code `too_many_applications` on field `base` |
| Free-text caps | `Application::NOTES_MAX_LENGTH`, and `posting_snapshot` ≤ `MAX_TEXT_CHARS` (12,000). These caps are the only thing bounding storage |
| Files | `resume` / `cover_letter` are raw `bytea`, ≤ 1 MB each, PDF magic-byte checked; the `*_updated_at` pair is set by a `before_save` |
| `posting_snapshot` is excluded from `as_json` | It is re-merged deliberately in `#show` and in `AccountArchive`, and nowhere else, so the list endpoint never ships 12,000 characters per row |
| There is no `source` column | The job board is derived from `url` at read time (§ `JobBoard`) |
| Enum-ish columns | `CHANNELS`, `JAPANESE_LEVELS`, `SPONSORSHIP`, `STATUSES_OF_RESIDENCE`, `HIRING_ENTITIES`, `COMPANY_TIMEZONES` are Ruby constants with inclusion validations, not Postgres enums |

#### `timeline_entries`

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

  index (application_id, created_at)   ← composite; serves every per-application read in time order
  index (application_id, created_at) where to_status = 'offer'
                                      ← partial; serves the first-offer DISTINCT ON
                                        behind avg_days_to_offer
  index (actor_id)
  index (idempotency_key) unique
```

- **Append-only.** No update path, no delete path; the only writer is `Applications::TransitionService` (plus `FollowUpReminderJob`, which writes a keyed entry).
- **Creation writes no entry.** An application created directly as `applied` has no `to_status = 'applied'` row, which is why `GhostRiskQuery` dates a stage by `MAX(created_at)` with fallbacks rather than by matching `to_status`.
- `note` is capped at `TimelineEntry::NOTE_MAX_LENGTH` = **2,000**.

### State machine

> **At a glance** · `api/app/lib/application_fsm.rb`: a hand-written PORO, not a gem. 13 states; `TRANSITIONS` is the single source of truth for legal moves. Three states are terminal (`accepted`, `declined`, `archived`); three *look* terminal but revive to `applied` (`rejected`, `withdrawn`, `ghosted`). Creation is not a transition: it sets one of three `ENTRY_STATES`.

**`TRANSITIONS` is the single source of truth for legal transitions.** Nothing may duplicate it: not the frontend, not a test fixture, not this file. The diagram below renders it for human readers; if the two disagree, the Ruby wins and this section is the bug.

#### States

```
wishlist ──→ draft ──→ applied ──→ phone_screen ──→ technical ──→ final_round ──→ offer ──→ accepted
                          ↘            ↘               ↘              ↘             ↘
                       rejected      rejected       rejected       rejected      rejected
                       ghosted       ghosted        ghosted        ghosted       declined

  withdrawn ← any of: applied, phone_screen, technical, final_round
  applied   ← any of: ghosted, rejected, withdrawn        ← revival paths
```

- **`TERMINAL_STATES` is exactly `accepted`, `declined`, `archived`.** Only these three are final.
- **`rejected`, `withdrawn`, `ghosted` look terminal but are not**: each transitions back to `applied`. This is the single most misread part of the FSM, and the reason a board cannot infer legal drops from a guessed left-to-right ordering.
- **Any non-terminal state may transition to `archived`**, via an early return in `assert_transition!`, not via rows in `TRANSITIONS`.
- **`withdrawn` starts at `applied`.** `wishlist` and `draft` exit through `archived` instead, so each pre-application stage has exactly one exit beside its forward move. Rows already sitting in `withdrawn` after a `wishlist`/`draft` exit are untouched: `assert_transition!` governs new moves only.
- The three closed-by-someone states are distinct on purpose: `rejected` is company-initiated, `declined` is candidate-initiated *after* an offer, `withdrawn` is candidate-initiated *before* any decision.

#### `ENTRY_STATES`: creation is not a transition

`ENTRY_STATES` is `wishlist`, `draft`, `applied`. **The FSM constrains *changes*; creation sets the *initial* state.** The controller validates the requested value against `ENTRY_STATES` explicitly, so a client cannot POST its way to `offer`. An optional applied date backdates `applied_at` for jobs added after the fact.

#### Public interface

```ruby
ApplicationFSM.assert_transition!(from, to)  # raises InvalidTransitionError → 422
ApplicationFSM.valid_next_states(from)       # [] for terminal states; appends "archived"
ApplicationFSM::TRANSITIONS                  # frozen array of { from:, to: }
ApplicationFSM::VALID_STATES                 # 13 states: TRANSITIONS ∪ TERMINAL_STATES
                                             #   (archived appears in no TRANSITIONS row)
ApplicationFSM::TERMINAL_STATES              # accepted, declined, archived
ApplicationFSM::ENTRY_STATES                 # wishlist, draft, applied
ApplicationFSM::ACTIVE_STATES                # the 7 still in play: VALID_STATES minus
                                             #   TERMINAL_STATES, rejected, ghosted, withdrawn
```

`valid_next_states` is serialized by `show` and `transition` only, **not by `index`**. A board gets the whole effective table in one request from `GET /api/v1/transitions`.

### Service layer

> **At a glance** · Writes go through explicit service objects, never model callbacks. `TransitionService` is the only path for a status change (FSM check + timeline row in one transaction). Also here: `UrlPrefillService` (AI pre-fill over an SSRF-guarded fetch), `TalkingPointsService`, `Demo::ResetService`, and the three `Exports::*` builders.

#### `Applications::TransitionService`

Signature: `new(application:, to:, actor:, note: nil).call`

1. `ApplicationFSM.assert_transition!` runs **before any DB write**: no partial state.
2. The status update and the `TimelineEntry` creation happen in one `ActiveRecord::Base.transaction`. Both or neither.
3. `from_status` comes from `status_before_last_save` (dirty tracking), so it is accurate even if callbacks run.
4. `applied_at` is set by the service, never supplied by the client.

**Known sharp edge:** `applied_at` is reset on *every* transition into `applied`, including the revival paths. Whether a revival should overwrite the original application date is open; settle it in this file before changing the code.

#### `Applications::UrlPrefillService`

AI pre-fill (Claude Haiku 4.5, `anthropic` gem, tool/JSON-schema for typed output) behind `POST /api/v1/applications/prefill`. Pipeline: `fetch → to_text → extract`.

| Property | Rule |
|---|---|
| Two entry points | `url` runs the whole pipeline; `text` (a paste) skips the fetch and runs the same `to_text → extract` tail. `extract` knows nothing about where the text came from |
| Extracted fields | One pass owns all of them: `company`, `role`, `notes`, plus `channel`, `agency`, `japanese_level`, `sponsorship`, `status_of_residence`, `hiring_entity`, `company_timezone`, `overlap_hours_required`, and the four `comp_*` figures |
| `posting_snapshot` | Returned in the response as `posting_text` and carried by the form into the create/update call. Prefill persists **nothing**: there is no row to write yet |
| Text cap | `MAX_TEXT_CHARS` = **12,000** codepoints of *stripped* text. A fetched page over the cap is truncated in silence; a paste over it raises `PasteTooLongError` → `prefill_paste_too_long` |
| Cap is measured server-side | The browser deliberately does not mirror it: only the server has stripped the text, and a raw paste routinely runs 3× its stripped length |
| Deadline | `FETCH_DEADLINE` = **15 s** of wall clock, shared across every redirect hop. Exceeding it raises `FetchError` (retryable) |
| Degradation | No `ANTHROPIC_API_KEY` → `503 prefill_unavailable`; the rest of the app keeps working |

The SSRF guard, which is the part most easily broken by a well-meant edit:

- **Re-validates scheme, port, and every resolved address on every redirect hop**, not just hop 0. Ports are restricted to 80/443.
- **Pins the connection to the validated IP** (`http.ipaddr`), so a DNS rebind between check and connect cannot redirect the fetch.
- **The pin prefers an IPv4 address** when the host resolves to both. Outbound IPv6 is disabled on `api`, so dialling a AAAA record dies with `ENETUNREACH`, and Cloudflare-fronted hosts resolve IPv6-first.
- **The connection never proxies** (`Net::HTTP.new(host, port, nil)`). The default `p_addr` of `:ENV` would let an `http_proxy` variable re-resolve the hostname and make the pin decoration.
- **A guard rejection past hop 0 is a `FetchError`, not an `InvalidUrlError`.** The user chose hop 0; the site chose the rest.
- **Every guard rejection returns one message** ("That URL can't be fetched."), whatever actually failed. Distinct copy would turn a blind SSRF into an internal-hostname oracle.

Failure taxonomy, and what the UI does with it: `prefill_blocked` and `prefill_failed` are the two codes that offer the paste box, because pasting is what cures them. `invalid_url`, `prefill_unreachable`, `prefill_paste_too_long` and `prefill_unavailable` do not. `prefill_failed`'s copy names no source, since both entry points reach it.

#### `Applications::TalkingPointsService`

`POST /api/v1/applications/:id/talking_points` → `{ points: [...] }`. It reuses the same gem, model and typed-output pipeline as `UrlPrefillService`. It adds one new thing: it reads **both** documents at once. The resume goes in as a base64 PDF document content block, and the posting text goes beside it (`posting_snapshot` when captured, else `notes`).

- **Bullets, not a draft, by decision.** It extracts match points and stops; the user writes the letter.
- **Nothing is persisted.** Points are generated on demand.
- Own error taxonomy: `MissingInputError` → `talking_points_missing_input` (raised before any Claude call), `ConfigError` → `talking_points_unavailable`, `ExtractionError` → `talking_points_failed`.

#### `Demo::ResetService`

Wipes the shared demo account back to a clean seed. Invoked hourly by `DemoResetJob`, scoped to the demo user only.

- **Nothing in `db/seeds.rb` carries a calendar date.** Dates are anchored to the run at a pinned hour in app time. They are placed on both sides of the 7-day agenda window: a follow-up two days overdue, an interview in two days, an offer deadline in three days, a wishlist reminder in twelve days, and the demo user's residence expiry in 80 days. A fixed-date fixture seeds cleanly, and then shows a visitor two empty panels a month later.
- `follow_up_at` and `interview_at` are rewritten on **every** run, not only the creating run; a reset destroys the account first.
- `reset_service_spec.rb` asserts the property (both sections populated), never the dates.
- That overdue follow-up is why `FollowUpReminderJob` skips this account outright.

#### `Exports::ApplicationsCsv`, `Exports::AccountArchive`, `Exports::InterviewCalendar`

Signature: `new(user).call` → a `String` of bytes ready for `send_data`; each exposes `#filename`, so the date-stamped download name is decided next to the bytes it names.

- **`ApplicationsCsv` quotes every field (`force_quotes: true`)** and prefixes any cell opening with `=`, `+`, `-`, or `@` with a single quote. This is a file we hand a user and expect them to open in Excel, so the [OWASP CSV-injection](https://owasp.org/www-community/attacks/CSV_Injection) escape is not optional. Blobs are excluded, replaced by `has_resume` / `has_cover_letter` booleans.
- **`AccountArchive`** builds the zip described under § API contract → Exports, and is one of exactly two places that re-merge `posting_snapshot`.
- **`InterviewCalendar`** hand-writes an RFC 5545 VEVENT, folded on **octet** boundaries (a fold landing mid-multibyte-character is malformed, and `company`/`role` are routinely Japanese). Its `escape` collapses `\r\n`, a bare `\n`, **and a bare `\r`** to the escaped literal. Nothing validates the format of `company`/`role`/`url`. Without that third case a planted lone CR would reach the file raw, and a lenient parser would read the text after it as real calendar properties.
- `ApplicationsCsv` and `AccountArchive` are deliberately **not** given a common `Export` base class to share one `includes`: inheritance used as a hiding place.

#### `AllowedHosts`: `app/lib/allowed_hosts.rb`

**The patterns here are deliberately un-anchored.** `HostAuthorization::Permissions#sanitize_regexp` wraps every pattern as `/\A#{pattern}(:\d+)?\z/`. Adding your own `\z` makes that port group unmatchable and 403s every internal `web → api` call. This took production down once (`v1.0.1`): **verify a framework's own normalization before "hardening" a pattern it owns.**

**Trusting the bare `api` host depends on a file this repo does not track.** Rails' anchoring makes `api` an exact-match host, not a rebinding hole. That pattern exists only to let `web`'s internal calls through, and it stays safe only because `cloudflared/config.yml` (gitignored) never routes an external request to `api` except by its one named public hostname. A future ingress rule that forwards a different or catch-all hostname to `api` would inherit that trust silently, since nothing in `AllowedHosts` itself would notice.

#### `JobBoard`: `app/lib/job_board.rb`

`JobBoard.from_url` strips a URL to a host key (`linkedin.com`). `JobBoard::NONE` is an explicit sentinel selecting applications added without a link. There is no `source` column and no per-board parser.

### Query layer

> **At a glance** · `api/app/queries/`, the read-side counterpart to services: non-trivial read models that mutate nothing. Two live here: `ListQuery`, which turns the application index's filter and cursor params into a page of records, and `GhostRiskQuery`, which flags applications the user has probably been ghosted on.

#### `Applications::ListQuery`

Signature: `new(user:, status:, company:, source:, japanese_level:, q:, after:, limit:).call`; every filter keyword is optional and nil-tolerant. Backs `GET /api/v1/applications` and nothing else. Returns `{ records:, next_cursor:, has_more: }`; the controller renders that into the `{ data, meta }` envelope of § Cursor pagination and does nothing else.

> **At a glance** · Applies the `status` / `company` / `source` / `japanese_level` / `q` filters, decodes the `after` cursor, clamps `limit` to 1–100, and fetches `limit + 1` rows to learn whether a next page exists. All filtering is server-side and composes with pagination.

| Filter | Contract |
|---|---|
| `status` | Exact match; a value outside `ApplicationFSM::VALID_STATES` is **ignored**, not rejected |
| `company` | `ILIKE` substring; blank or whitespace-only is ignored |
| `source` | Host substring match against the derived job board, not a column. `JobBoard::NONE` selects applications with no link at all |
| `japanese_level` | Comma-separated; members intersected with `Application::JAPANESE_LEVELS`, survivors OR within the filter and AND against everything else. An empty intersection is **unfiltered**, never `where(japanese_level: [])`'s silent zero rows. Matches the *recorded* value: `japanese_level=none` means "recorded as requiring none", not "unrecorded" |
| `q` | Case-insensitive `ILIKE` substring over `company`, `role` and `notes` at once. Server-side because the list paginates by cursor: a client-side scan would silently miss matches on unfetched pages |

- **`sanitize_sql_like` escapes every `ILIKE` pattern**, so `%` and `_` in a param are literals.
- **Bad input is ignored, never rejected.** An unknown `status`, a malformed `after` cursor, and a non-numeric `limit` are each dropped and the first page is returned. These params come from navigation (a stale bookmark, an edited URL), not from a form.

#### `Applications::GhostRiskQuery`

Signature: `new(user:).call`. Answers one question: **which applications has the user probably been ghosted on?**

> **At a glance** · It dates each in-flight application from the last `timeline_entries` row that moved it, falling back to `applied_at`, then to `created_at`. It counts how many **business days** of silence have passed since that date. It flags anything in a monitored stage (`applied`, `phone_screen`) past that stage's fixed threshold. No new column, no new table: the audit log already holds everything it needs.

Stage entry moment, in SQL. Matching `to_status` would be wrong: creation writes no timeline entry, so an application added directly as `applied` has no row to anchor on.

```sql
COALESCE(
  (SELECT MAX(created_at) FROM timeline_entries WHERE application_id = applications.id),
  applications.applied_at,
  applications.created_at
)
```

- **`RISK_STAGES` = `applied`, `phone_screen`**: the two stages where the next move is the company's. `THRESHOLDS` is a fixed count of business days, **`applied: 15`, `phone_screen: 10`**, and *strictly past* the threshold flags; exactly on it is still a normal wait.
- **Silence is counted in business days, against the same `JapanCalendar` `FollowUpReminderJob` uses**, so the two features cannot disagree about what a dead zone is. Counting calendar days would shrink every threshold exactly when companies are least responsive, and a false flag invites the user to close a live application.
- **The arithmetic is in Ruby, not SQL**, because the holiday rules live in the `holidays` gem. `business_days_between` batches its holiday lookup into one `Holidays.between` call: 200 applications silent for three years measured **13.7 s** naively against **0.7 s** batched. `japan_calendar_spec` pins the batched count against a day-by-day loop over a span carrying two New Years, Golden Week, Obon, both equinoxes and a 振替休日.
- **Thresholds are fixed policy, not derived from the user's history** (the `percentile_cont(0.9)` basis was removed 2026-08-03). The query no longer reads exits at all, only the latest transition, and the payload carries `thresholds` and `at_risk` with no `basis`/`sample_sizes` pair.

### API contract

> **At a glance** · All routes are JSON, all under `/api/v1`, all authenticated and scoped per-user (cross-user access → `404`, never `403`). Errors share one envelope: `{ error, code, details? }`; clients branch on the stable `code`, never the English `error`. Endpoint list, error-code table, and payload shapes below.

```json
{ "error": "<English sentence>", "code": "<stable_code>" }
```

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

**Every error leaves through the `ErrorRendering` concern, never a hand-built hash**, which is what keeps the envelope one shape. `details` appears on `validation_failed` only.

```
POST   /api/v1/auth/sign_in                       200, JWT in Authorization header
POST   /api/v1/auth/passkey/options               WebAuthn assertion options; unauthenticated
POST   /api/v1/auth/passkey                       verify assertion; 200, JWT in Authorization header
DELETE /api/v1/auth/sign_out                      rotates jti; revokes all devices
DELETE /api/v1/auth/account                       204, erases the account and everything under it

(there is no sign-up endpoint; see § Registration is closed)

GET    /api/v1/passkeys                           the user's enrolled passkeys
POST   /api/v1/passkeys/options                   WebAuthn registration options
POST   /api/v1/passkeys                           201, enrolls a passkey
DELETE /api/v1/passkeys/:id                       204; another user's → 404

GET    /api/v1/push_subscriptions/public_key      the VAPID public key the browser subscribes with
POST   /api/v1/push_subscriptions                 201, registers this browser's push subscription
DELETE /api/v1/push_subscriptions                 204, by endpoint; idempotent

GET    /api/v1/applications                       cursor-paginated
POST   /api/v1/applications                       status must be in ENTRY_STATES
POST   /api/v1/applications/prefill               AI pre-fill (Claude Haiku 4.5); `url` or `text`
GET    /api/v1/applications/ownership_check       agency-ownership (duplicate submission) warning
GET    /api/v1/applications/:id                   + valid_next_states, + timeline_entries,
                                                    + agency_name, + posting_snapshot
PATCH  /api/v1/applications/:id
DELETE /api/v1/applications/:id
PATCH  /api/v1/applications/:id/transition        FSM transition; + valid_next_states
POST   /api/v1/applications/:id/talking_points    cover-letter bullets from resume x posting
GET    /api/v1/applications/:id/interview         .ics VEVENT for interview_at; text/calendar
GET    /api/v1/applications/:id/resume            send_data, PDF, nosniff
GET    /api/v1/applications/:id/cover_letter      send_data, PDF, nosniff
GET    /api/v1/transitions                        the FSM's effective transition table
GET    /api/v1/dashboard                          SQL aggregation + facets + ghost risk + user
GET    /api/v1/me                                 authenticated user's profile
PATCH  /api/v1/me                                 residence status / expiry

GET    /api/v1/exports/applications               CSV of every application; text/csv
GET    /api/v1/exports/account                    full account archive; application/zip

GET    /up                                        deep health check; pings Postgres
GET    /api-docs                                  Swagger UI (rswag)
GET    /api-docs/v1/swagger.yaml                  generated from request specs
```

#### Error codes

| `code` | Status | When |
|---|---|---|
| `unauthenticated` | `401` | Missing, expired, or revoked JWT (Devise failure app) |
| `invalid_credentials` | `401` | Sign-in with a wrong email or password |
| `invalid_passkey` | `401` | Passkey sign-in failed: unknown credential, expired or replayed challenge, or an assertion that does not verify (§ Passkeys). One code for all four on purpose: they are indistinguishable to the user (retry or fall back to the password), and enumerating them would tell an attacker which part of a forged assertion failed |
| `passkey_verification_failed` | `422` | Passkey *enrollment* failed: the attestation does not verify, or the registration challenge expired. Distinct from `invalid_passkey` because the user is signed in and mid-setup: the cure is "try adding it again", not "use your password" |
| `forbidden` | `403` | Deleting the shared demo account: it is exempt from destruction (§ Registration is closed) |
| `not_found` | `404` | No such record, including another user's record |
| `stale_record` | `409` | `ActiveRecord::StaleObjectError`: optimistic-locking conflict |
| `invalid_transition` | `422` | FSM `InvalidTransitionError` |
| `validation_failed` | `422` | Model validation failure (create/update, file upload, or a per-user ceiling; detail code `too_many_applications`, `too_many_passkeys`, or `too_many_push_subscriptions` on field `base`); carries `details` |
| `invalid_url` | `422` | The pre-fill URL itself is the problem: malformed, a port other than 80/443, or a private/internal address. Never fetched (`InvalidUrlError`) |
| `prefill_blocked` | `422` | The site refused an automated reader: `401`/`403`, or a `cf-mitigated` header on any status. The URL is fine and retrying will not help (`BlockedError`). An upstream `429` is deliberately *not* this: it is the one refusal that lifts, so it resolves to `prefill_unreachable` and the user is told to retry |
| `rate_limited` | `429` | Rack::Attack throttle; `Retry-After` header set |
| `prefill_paste_too_long` | `422` | A pasted posting exceeds `MAX_TEXT_CHARS` (12,000) **once stripped to text** (`PasteTooLongError`). Only the paste path raises it: a fetched page over the cap is truncated in silence, because the user never saw its length |
| `prefill_unreachable` | `502` | The pre-fill page could not be fetched: DNS, connect, TLS, timeout, redirect loop, or an HTTP error the site did not refuse us with (`FetchError`) |
| `prefill_failed` | `502` | The page was fetched but yielded nothing usable: no readable text (`UnreadableError`), or the Claude call failed or came back empty (`ExtractionError`) |
| `prefill_unavailable` | `503` | `ANTHROPIC_API_KEY` missing; the rest of the app keeps working |
| `talking_points_missing_input` | `422` | No resume on the application, or no posting text to compare it against, caught before any Claude call (`MissingInputError`) |
| `talking_points_failed` | `502` | The Claude call failed or returned nothing usable (`ExtractionError`) |
| `talking_points_unavailable` | `503` | `ANTHROPIC_API_KEY` missing; the same degradation as `prefill_unavailable` (`ConfigError`) |
| `push_unavailable` | `503` | VAPID keys missing: the subscribe endpoints only; the rest of the app keeps working. The same degradation pattern as `prefill_unavailable`, and the reason the VAPID env vars are optional rather than required (§ Push notifications) |

#### The transition table: `GET /api/v1/transitions`

```json
{
  "states":          ["wishlist", "draft", "applied", "…all 13, pipeline order first"],
  "entry_states":    ["wishlist", "draft", "applied"],
  "terminal_states": ["accepted", "declined", "archived"],
  "active_states":   ["wishlist", "draft", "applied", "phone_screen", "technical",
                      "final_round", "offer"],
  "transitions":     { "wishlist": ["draft", "archived"], "…": ["…"], "accepted": [] }
}
```

#### Cursor pagination

`GET /api/v1/applications?after=<base64_cursor>&limit=20`. Limit clamped 1–100, default 10. Response: `{ data: [...], meta: { next_cursor, has_more } }`. The cursor is a Base64 `created_at` in ISO-8601 with microseconds; a malformed cursor is ignored and returns the first page. Hand-written, no gem.

`status` takes a **list** (`status=applied,phone_screen,offer`), ORing within itself and ANDing against the other filters. An empty or all-unknown list is `UNFILTERED`, the same as `nil`, never `where(status: [])`'s silent zero rows. Full filter contract: § `Applications::ListQuery`.

#### The ownership check: `GET /api/v1/applications/ownership_check`

Candidate **ownership**: the first agency to submit you to a company owns that candidacy for roughly 12 to 18 months. The placement fee follows the owner however you later reach that company. A second submission is therefore damaging, not merely wasteful.

```
GET /api/v1/applications/ownership_check?company=Mercari
```

```json
{
  "window_months": 18,
  "submissions": [
    { "id": 7, "agency_name": "Robert Half", "submitted_at": "2026-01-10T…", "window_ends_on": "2027-07-10" }
  ]
}
```

- **A submission is an application to that company with `channel = "agent"` whose `applied_at` falls within `Agency::OWNERSHIP_WINDOW_MONTHS`** (18: the conservative end, because the warning's job is to fire while the window *may* still be open). `applied_at` is the submission date, so a `wishlist` or `draft` row never counts.
- **An agent submission with no agency recorded still counts**, with `agency_name: null`. Not knowing who owns the candidacy is the more dangerous case.
- **`company` is matched exactly.** A blank `company` returns an empty list, not a `422`: the form calls this as the user types.
- **Nothing blocks.** The FSM has no opinion and create accepts the application regardless; this is a warning surface only, shown whatever channel the new application uses.

#### The dashboard payload: `GET /api/v1/dashboard`

```json
{
  "by_status":         { "applied": 6, "phone_screen": 2, "rejected": 3 },
  "facets":            [["Mercari", "linkedin.com"], ["Cookpad", "(none)"]],
  "total":             11,
  "avg_days_to_offer": 24.5,
  "ghost_risk": {
    "thresholds": { "applied": 15, "phone_screen": 10 },
    "at_risk": [
      { "id": 7, "company": "Mercari", "role": "Backend Engineer", "status": "applied",
        "lock_version": 1, "business_days_in_stage": 22, "threshold": 15 }
    ]
  },
  "user": { "id": 1, "email": "a@b.com", "created_at": "…", "updated_at": "…" },
  "upcoming": [
    { "type": "follow_up", "at": "…", "application_id": 7, "company": "Mercari", "role": "Backend Engineer", "status": "applied" },
    { "type": "residence", "at": "…", "application_id": null, "company": null, "role": null, "status": null }
  ]
}
```

- **`facets` is a `[company, board, status, japanese_level]` tuple** (widened in `v1.10.0`), one per row. The client computes **disjunctive faceting** across all four filters: each facet's counts reflect the *other* active filters, never its own selection.
- **`user` is the former `GET /api/v1/me` payload, folded in.** `/me` still exists; `web/` no longer calls it.
- **`upcoming` is the Upcoming agenda** (`v1.11.0`): follow-ups and future interviews across `ACTIVE_STATES`, plus `residence_expires_on` when within `AGENDA_RESIDENCE_WINDOW_DAYS` (90). Each item carries a `type` (`follow_up` / `interview` / `residence`); the list is chronological and capped at `AGENDA_LIMIT` (8).
- **Stat cards ride the same payload**: `response_rate`, `screening_success_rate`, `ghost_rate` and `avg_days_in_stage`. All three rates read `timeline_entries`, so a later revival does not erase that a reply happened. **Both rates take their denominator from `applied_at`, not from the current status.** Status is a pointer that keeps moving, so archiving a `wishlist` row would otherwise change the denominator.
- **`screening_success_rate` is `response_rate` without the rejections**, counting the whole advanced set (`phone_screen`, `technical`, `final_round`, `offer`) because a company may skip the phone screen. The gap between the two rates is the point.
- **`avg_days_to_offer` scopes the user *inside* its derived table.** It reads the offer moment from `timeline_entries`, not from `updated_at`, which drifts on any edit. A `DISTINCT ON` subquery finds the first offer per application, and Postgres cannot push an outer `user_id` filter through `DISTINCT ON`.

**Caching.** The aggregation is memoized in Solid Cache under a self-expiring key: user id, application count, `MAX(updated_at)`, `STATS_CACHE_VERSION` (currently **8**), and `Date.current`.

- **Bump `STATS_CACHE_VERSION` whenever the payload's shape changes *or the way any figure in it is computed* does.** A data-derived key cannot see a deploy, so unchanged rows would keep serving the old payload to new code.
- **`Date.current` is in the key** because ghost risk is a function of elapsed time, which is invisible to a key built from rows.
- **`user` and `upcoming` are merged in outside the cached block.** `upcoming` reads the residence field, which the stats key cannot see.

#### Dashboard filters: derived from the URL, no new column

- **The job board is derived from the stored URL host**; there is no column, and a link-less row buckets under "No link". Host-substring matching is approximate, and that is the accepted trade at personal-tracker volume.
- **The dashboard defaults to the active applications**, not to every status: a bare `/dashboard` renders `ACTIVE_STATES`. This is a `web/` presentation default over `ListQuery`, whose wire contract (absent `status` means unfiltered) is unchanged.
- **`archived` is excluded from the dashboard entirely**: no chip, never inside "All", never fetched. `page.tsx` drops the bucket from `by_status` and every archived row from `facets` before they reach the client.
- **The filter state lives in the URL** (`v1.10.0`): `status`, `company`, `source`, `japanese_level`. A bare URL is the default active view, so the client omits `status` when the selection equals that default.
- **The stage-chip row shows the active stages plus `accepted` inline**; `declined`, `rejected`, `ghosted`, `withdrawn` get no chip (`v1.11.0`). Chips OR within themselves and AND against the dropdowns, so the "All" / "Active" / "None" presets rewrite only the chip selection and keep the chosen company.
- **No filter control is `disabled` while a page is in flight** (`v1.11.1`). A disabled element cannot hold focus, so the browser blurs it to `<body>` and a keyboard or screen-reader user pays a full tab back for every consecutive search.
- **The search box's Enter is gated on `isComposing`** (`v1.11.1`), read from `e.nativeEvent` because React does not surface it on the synthetic event. Enter is how an IME confirms a kanji candidate.

#### Exports: two endpoints, two different jobs

| | `GET /exports/applications` | `GET /exports/account` |
|---|---|---|
| Media type | `text/csv` | `application/zip` |
| Contains | applications, one row each | applications, timeline, resumes, cover letters, user |
| Built by | `Exports::ApplicationsCsv` | `Exports::AccountArchive` |
| It is for | reading the data somewhere else | **getting the data back** |

- The CSV's columns are a **hand-curated allow-list** (`Exports::ApplicationsCsv::COLUMNS`), not every column: the Japan-market and visa layers are deliberately absent. It recovers a table, not an account.
- The archive is the **data-safety artifact**, and the leg the user can pull without a provider or a shell. **"Every column" means every column, so `AccountArchive` merges `posting_snapshot` back in the way `#show` does.**
- **`Zip.unicode_names = true`** is set once in `config/initializers/zip.rb`: rubyzip leaves the EFS flag (bit 11) unset by default, which is mojibake in strict extractors the moment an entry name is Japanese.
- **The archive is built in memory** (`Zip::OutputStream.write_buffer`). Bounded by `MAX_PER_USER` × 2 MB = a **400 MB** worst case, which is the honest number rather than the expected one.
- **The download links render even when the card has no user to show.** `/privacy` promises the user can get their data out, and this is the only surface that honors it. They are plain `<a>` tags (API routes, not localized pages, so `@next/next/no-html-link-for-pages` is disabled on those lines) with **no `download` attribute**: Rails already sends `Content-Disposition: attachment` and stays the one place that names the file.
- **`ProfileCard` takes the user as a prop and never fetches one.** The dashboard payload already carries `user`.

#### Download filenames

Every PDF is named by **`Application#download_basename(kind:)`**, `kind` being `:resume` or `:cover_letter`, called from both `ApplicationsController` and `AccountArchive#blob_path`:

```
{company}-{role}-{MMDD}-{id}-{kind}.pdf     株式会社メルカリ-バックエンドエンジニア-0712-12-resume.pdf
```

- The **id** is the uniqueness guarantee; `company` and `role` are readable rather than load-bearing. The **`MMDD` is the upload date** (`*_updated_at`, falling back to `created_at`).
- **The slugger preserves Unicode; it does not transliterate.** `parameterize` sends a Japanese company name to the empty string, and kanji-to-reading needs a morphological analyzer to be correct.
- **No gem, no controller encoding work.** `send_data` with a UTF-8 filename makes Rails emit both the legacy `filename=` and the RFC 5987 `filename*=UTF-8''…` that browsers actually read.
- **A segment that sanitizes to empty is dropped, not placeheld.** Worst case `0712-12-resume.pdf`: still unique, still honest. Segments are capped at 20 codepoints each.
- **The two PDF endpoints send `disposition: "inline"`** (the browser's own viewer, with `nosniff`); the `.ics` and both exports send `attachment`. An export is a file you are taking away, not a document you are reading.

### Background jobs

> **At a glance** · Solid Queue on the primary Postgres: no Redis, no separate worker service. Workers run inside Puma (`SOLID_QUEUE_IN_PUMA`). Four recurring tasks: the follow-up reminder digest (08:15 JST, skipped on Japanese dead zones), the interview and residence push reminders (08:00 JST), finished-job cleanup, and the hourly demo reset.

| Property | Value |
|---|---|
| Adapter | `:solid_queue` in production, `:async` in development, `:test` in test |
| Where workers run | **Inside Puma**: `plugin :solid_queue if ENV["SOLID_QUEUE_IN_PUMA"]`. That variable must be set on the `api` container or no job ever runs |
| Database | **Single**. Queue and cache tables live in the primary Postgres via a normal migration. No `db/queue_schema.rb`, no `connects_to` |
| Connection pool | `max_connections` = `RAILS_MAX_THREADS + 6`. Solid Queue's ~5 threads share the pool and it **exits, stopping Puma with it**, if the pool is smaller than its thread count. A correctness constraint, not a tuning knob |
| Poll cadence | **1 s** (`config/queue.yml`), raised from the 0.1 s the app shipped with: between requests the poll loop is the only continuously running work in the process, and 0.1 s is ~36,000 queries an hour of pure allocation churn |

| Task | Schedule | What |
|---|---|---|
| `follow_up_reminders` | `15 8 * * * Asia/Tokyo` | `FollowUpReminderJob`, 08:15 JST |
| `interview_reminders` | `0 8 * * * Asia/Tokyo` | `InterviewReminderJob`, 08:00 JST (§ Push notifications) |
| `clear_solid_queue_finished_jobs` | hourly at :12 (no zone) | Bounds the jobs table |
| `reset_demo_account` | hourly at :42 (no zone) | `DemoResetJob` |

#### `FollowUpReminderJob`: one digest per user, deferred out of dead zones

1. **It stops on a dead zone.** Not a Japanese business day → immediate return: no timeline entries, no mail.
2. **It collects what is due, including what is overdue.** Scope: `follow_up_at <= end of today` (JST), non-terminal, no further back than `LOOKBACK` (**30 days**). "Due exactly today" would turn step 1 into a deletion; the backward reach is what makes deferral work, and the lookback stops an eight-month-old date resurrecting itself.
3. **It sends one email per user, not one per application.** Inbox cost scales with days, not with how well the search is going.

**The shared demo account is excluded from the scope.** `Demo::ResetService` destroys it hourly, taking the `TimelineEntry` that claims the reminder with it, so its deliberately overdue seeded follow-up would earn a fresh digest every morning.

#### Idempotency: keyed on the follow-up date, not the day it fires

`idempotency_key = "reminder-{application_id}-{follow_up_at as a JST date}"`, enforced by the unique index and a `rescue ActiveRecord::RecordNotUnique`, **not** `exists?`-then-`create!` (that race is real).

- A reminder held through Golden Week and delivered on 7 May carries the key of the date it was *set for*, so the deferred send cannot double up with the run that held it.
- An overdue application, which sits in the scope every day until answered, is reminded **once**.
- **Moving `follow_up_at` re-arms the reminder**: a new date is a new key, which is what a user who moved the date meant.

#### `JapanCalendar`: `app/lib/japan_calendar.rb`

| Dead zone | Dates |
|---|---|
| Weekends | Saturday, Sunday |
| National holidays | via the `holidays` gem, region `:jp`, `:observed` |
| New Year (年末年始) | 29 December – 3 January |
| Golden Week | 29 April – 5 May |
| Obon (お盆) | 13 – 16 August |

Annual maintenance surface: one `bundle update holidays`.

#### Time zone

`config.time_zone = "Tokyo"`. **`active_record.default_timezone` is deliberately not set**, so timestamps are still stored in UTC; only presentation and `Time.zone`-based queries are JST. Comparing `DATE(follow_up_at)` in UTC gave JST users reminders a day early, so the job uses zone-aware day boundaries throughout.

### Mail

> **At a glance** · Two mailers: `WelcomeMailer` (on account creation) and `FollowUpMailer#digest` (one per user per business day). Production sends via Resend over STARTTLS port `2587`, a Railway-era workaround kept unchanged after the move to self-hosting.

- `ActionMailer` is re-enabled in `config/application.rb` (the `--api` default disables it). Production sends over SMTP; development previews only; test collects in `deliveries`.
- `WelcomeMailer` is sent by the `users:create` Rake task via **`deliver_later`**: with `raise_delivery_errors = true`, a `deliver_now` failure would take account creation down with it.
- `FollowUpMailer#digest(user, applications)` names the company when there is exactly one application and counts them when there are several.
- **Port `2587`, not 587/465.** Railway blocked outbound SMTP on the standard ports; the home connection does not, but a working config stays. The `From:` domain must be verified in Resend first.

### Security

> **At a glance** · JWT auth with one JTI per user (sign-out revokes all devices). Rack::Attack throttles are keyed per-IP *and* per-account/email through Solid Cache, with `forwarded_priority` pinned so the client cannot choose its own IP. A hard 200-application ceiling per account, plus length caps on the free-text columns, are the only things that bound storage. Optimistic locking on writes, magic-byte-checked uploads, `nosniff` downloads, credentials filtered from logs.

- **Auth**: Devise + devise-jwt, token in the `Authorization` response header. **One JTI per user** via `JTIMatcher`: sign-out rotates it and therefore revokes *all* devices. 1-day expiry, no refresh flow, intended.
- **Rack::Attack**: counters go through `Rails.cache` (Solid Cache), so they are shared across Puma workers rather than counted per worker.
  - **`Rack::Request.forwarded_priority` is pinned to `[:x_forwarded]`, and every per-IP throttle depends on it.** `Rack::Attack::Request` subclasses `Rack::Request` and overrides neither `#ip` nor reads `env["action_dispatch.remote_ip"]`, so `req.ip` follows *Rack's* rules, and Rack prefers the client-settable RFC 7239 `Forwarded:` header by default.
  - **Every path guard keys off `Rack::Attack.normalized_path`, never `req.path`.** Rack::Attack runs *above* the router, so `req.path` is the raw `PATH_INFO` the client typed; Rails normalizes it afterwards. This is the one rule in this section that is load-bearing rather than descriptive.
  - **The sign-in email discriminator reads the JSON body first, then `req.params`**, so a throttle cannot be sidestepped by changing how the credentials are encoded.

| Throttle family | Key | Caps |
|---|---|---|
| `sign_in` | per-IP **and** per-email | 5/min per IP; 10/5min and 50/hour per email, capping guesses against one account across all IPs |
| `passkeys` (sign-in ceremony) | per-IP, options + verify as one family | 10/min (a ceremony costs two requests) |
| `passkeys/write` | per-account | 10/min, 30/hour; `DELETE` exempt |
| `prefill` | per-IP **and** per-account (JWT `sub`) | 10/min, 50/hour, 100/day |
| `ai/talking_points` | per-account only | 5/min, 30/hour, 60/day. The most expensive call in the app: it base64-encodes a 1 MB resume into a paid Claude request inside a Puma thread. No per-IP leg, because the endpoint requires a decodable JWT |
| `exports` | per-account | 10/min, 60/hour. A *work* vector, not a money one: `/exports/account` assembles every blob in memory |
| `applications/write` | per-account | 30/min, 300/hour on `POST /applications` and `PATCH\|PUT /applications/:id`, the two requests that carry a blob |
| `applications/transition` | per-account | 30/min, 300/hour. It matched nothing until 2026-07-28: it fails the `/\d+\z` anchor and no other guard claimed it, so the discriminator returned `nil` and the guard **failed open** |
| `push_subscriptions/write` | per-account | 10/min, 30/hour; `DELETE` exempt |

- **The per-user ceilings are what actually bound storage**, and a throttle cannot do this job: a throttle bounds a rate over a window, and every window resets, so any positive rate integrates to unbounded total. `Application::MAX_PER_USER` **200**, `Credential::MAX_PER_USER` **20**, `PushSubscription::MAX_PER_USER` **10**.
  - Reported through the **existing** envelope: the validation adds to `:base`, so `create` renders `validation_failed` with `details: [{ field: "base", code: "too_many_applications" }]`.
  - **A bound, not an invariant.** The check is a `count` in the same transaction as the insert with no lock, so N concurrent creates at 199 can overshoot by N-1. Accepted: the cap exists to stop unbounded growth, not to make 200 exact.
  - The **shared demo** is the account most likely to reach it, and it heals itself hourly.
- **Optimistic locking**: `lock_version`; the second concurrent writer gets `StaleObjectError` → `409`. One column, one `rescue_from`, no library.
- **Uploads**: size is checked from multipart metadata *before* `.read`, so an oversized file never enters memory. Then the 1 MB model cap (`MAX_FILE_BYTES`), then a PDF magic-byte check (`%PDF`), which renaming cannot spoof. The frontend's `accept=".pdf"` is UX only.
- **Downloads**: `current_user`-scoped, `X-Content-Type-Options: nosniff` on every one, exports included (a CSV a browser decides to sniff as HTML is stored XSS).
- **Param filtering**: lograge logs `request.filtered_parameters` **in full** on every production request, so `filter_parameter_logging.rb`'s list is the whole defense for anything carried in a request body. The `Authorization` header and cookies are never logged at all.
- **The pre-fill fetch caps the body while streaming**, stopping the chunked read at `MAX_BODY_BYTES`. `Net::HTTPResponse#body` buffers the whole response before any post-hoc slice sees a byte, so an unstreamed cap is decoration against an endless body; every response goes through the same capped read, redirects and error pages included.

### Passkeys (WebAuthn)

> **At a glance** · Passkey sign-in via the `webauthn` gem, hand-wired into Devise. Discoverable credentials, no attachment restriction, `attestation: "none"`: the three settings that keep third-party providers (Proton Pass) in the chain. RP ID and origin derive from `FRONTEND_URL`; challenges are single-use five-minute entries in Solid Cache; a verified assertion dispatches the same devise-jwt token password sign-in does. Password sign-in stays forever as the fallback.

The three settings that keep the provider chain open, and must not be narrowed:

- **`residentKey: "required"`**: discoverable credentials, so sign-in needs no username first and the browser's own picker lists whatever provider holds the key.
- **No `authenticatorAttachment` restriction**: a `platform` restriction on desktop would demand the machine's own authenticator and bypass the Proton Pass extension entirely.
- **`attestation: "none"`**: attestation policy is how sites accidentally block third-party providers, and this app has no fleet-management reason to know which vendor minted a key.

#### RP ID and origin: derived, never hardcoded, never widened

Both derive from `FRONTEND_URL` in `config/initializers/webauthn.rb`: the allowed origin is `FRONTEND_URL` itself, the RP ID is its **host**. **Never the registrable domain**: `chairulakmal.com` would make these passkeys assertable by every sibling subdomain, and `awano.chairulakmal.com` already exists.

#### Ceremonies and challenge lifecycle

Every challenge is a **single-use** Solid Cache entry with a **five-minute TTL**, consumed before verification so a replay finds nothing. On the authentication ceremony the consumption is **atomic**: the delete's own return value decides whether this request owns the challenge.

- **Registration** (authenticated): `POST /passkeys/options` excludes already-enrolled credential IDs and caches the challenge **keyed by user id** (one in-flight enrollment per user). The first call also generates and persists `users.webauthn_id`. Failures are `422 passkey_verification_failed`.
- **Authentication** (unauthenticated, usernameless): `POST /auth/passkey/options` generates options with an **empty allow-list** and caches the challenge **keyed by its own value**, since no user is known yet. Every failure is one `401 invalid_passkey`, deliberately not enumerated.
- **Every ceremony rescue logs before rendering its unenumerated failure.** The response is deliberately uninformative, so without the log line a systemic regression that 401s every user would be indistinguishable from hostile junk. A rescue either re-raises or logs.

#### JWT dispatch: a passkey sign-in is a password sign-in from here on

`devise.rb`'s `jwt.dispatch_requests` gains `POST /api/v1/auth/passkey`; the controller calls `sign_in(user, store: false)` and the middleware injects the same 1-day JWT. Nothing downstream can tell the difference, and **sign-out still revokes every device regardless of how each one signed in**.

### Push notifications

> **At a glance** · Web Push as a second channel for the follow-up digest, via the `web-push` gem. Per-environment VAPID keys from two **optional** env vars: absent keys degrade the subscribe endpoints to `503 push_unavailable` and the digest to email-only. `FollowUpReminderJob` fans its already-claimed `won` set into one `PushDigestJob` per user beside the mailer; expired subscriptions self-prune. The browser half (the push-only service worker and the settings toggle that owns the permission prompt) is § Installable app § The service worker.

- **The VAPID vars are optional, not required**: deliberately the `ANTHROPIC_API_KEY` pattern, not the `DEVISE_JWT_SECRET_KEY` one. With no keys the app boots and serves, the two subscribe endpoints answer `503 push_unavailable`, and the digest is email-only. Keys are per-environment, generated with `bin/rails push:vapid`, never in the repo. `VAPID_SUBJECT` is a third, genuinely optional var that defaults in code to `mailto:` plus the operator contact.
- **The browser fetches the public key from `GET /push_subscriptions/public_key`**, not from a duplicated web-side env var: two services sharing a key by copy is drift waiting to happen.
- **`POST /push_subscriptions` upserts on `endpoint`**, so a re-subscription updates keys in place and reassigns the row to whoever is signed in: the endpoint's real owner is the browser. `DELETE` takes the endpoint in the body and is idempotent.
- **Push adds no second exactly-once claim.** The digest's `won` set (already claimed through the `timeline_entries` idempotency key) enqueues one `PushDigestJob` per user beside the mailer, gated on `PushVapid.configured?`. TTL **24 hours**.
- **`Push::Notifier` owns the delivery loop** (send to every subscription, prune the revoked, return the first transient error so a retry re-runs the whole job after every device got its attempt). `PushDigestJob` delegates to it, and keys its `retry_on` on `Push::Notifier::TRANSIENT_ERRORS` so the retry list and the loop cannot diverge.
- **Solid Queue has no implicit retry** (an uncaught raise parks in `solid_queue_failed_executions`), so the job declares `retry_on`: three attempts, polynomial backoff, for the network-level errors the gem does not wrap.
- **An `ExpiredSubscription` raise destroys that row and delivery continues to the user's other subscriptions.**

#### A second push channel: interview and residence reminders (`v1.10.0`)

`InterviewReminderJob`, daily at 08:00 JST, pushes two things fed by data the pages already show:

- an **interview coming up within 24 hours** (the daily cadence makes it once per interview, since each falls in exactly one run's window);
- a **residence-expiry warning** as the countdown crosses `90/60/30/14/7` days, carrying the same `Visa::COE_LEAD_TIME_DAYS` (**63**) guidance the settings page shows. The threshold set is what keeps a warning that stays true for ninety days from pushing every morning.

**The service worker's notification `tag` is payload-driven** (`payload.tag || "follow-up-digest"`). The digest sends no tag, so it keeps its historical fixed one. Each interview (`interview-:id`) and the residence warning (`residence-expiry`) carry their own. A retry therefore replaces its own notification, and two different subjects stay two notifications. The launcher badge needs no code: on Android the notification itself produces the dot.

### Observability

- **Structured JSON logging** via `lograge` in production: one line per request with `request_id`, controller, action, status, duration. It also emits `request.filtered_parameters` in full (§ Security).
- **Error tracking** via Honeybadger in production; API key from an env var, never hardcoded.
- **`/up`** pings Postgres and returns `200` / `503`, so the `api` container's Docker `HEALTHCHECK` fails fast on dependency loss. The Rails 8 default only checks that the app booted.

---

## Frontend (`web/`)

### Frontend tech stack

| Technology | Alternative considered | Reason |
|---|---|---|
| Next.js 16 (App Router) | Vite + React | Needs a server to receive the JWT |
| JWT in `httpOnly` cookie | `localStorage` | Token never touches client JS; XSS-proof |
| Tailwind CSS v4 | - | Utility-first; no UI library, no form library, no state library |
| Server components + server actions | Client-side data fetching | The token stays server-side by construction |
| `next-intl` | `react-i18next`, hand-rolled | App Router-native (RSC message catalogs, no client bundle for server copy); declares `next: ^16` |

### Design system

> **At a glance** · `web/app/globals.css` is the single entry point where the brand tokens reach the app, via Tailwind v4's `@theme inline`. Twelve colors, one typeface (Plus Jakarta Sans) with labels on the system mono stack, **radius 0**: sharp corners are the editorial voice. No UI kit, no form library, no state library. The brand book itself is no longer in this repo; `BRAND.md` says where it lives.

- **`globals.css` is a hand-kept mirror.** Nothing imports the brand book at build time, so the values there are the ones that actually ship.
- **Twelve colors**: the nine brand hues plus three that exist because the obvious choice failed a contrast requirement. `--color-danger` (`#96291D`) is for destructive actions and error text, always through opacity modifiers, never stock Tailwind `red-*`. `--color-saffron-ink` (`#7A4D10`) exists because bare `text-saffron` is about 2:1 on linen; saffron carries meaning as a fill or a ring, and any saffron *text* uses `saffron-ink`. `--color-rule-strong` (`#847D6B`) is for interactive borders, because `dune` is 1.36:1 on sand where WCAG 1.4.11 requires 3.0.
- **One typeface**, Plus Jakarta Sans, loaded through `next/font/google` in both `[locale]/layout.tsx` and `global-not-found.tsx` in the same variable form, so the emitted files are content-hash-identical. Labels use the system mono stack.
- **Radius `0`**, everywhere. The sharp corners are the editorial voice, not an oversight.
- **Motion is set through Tailwind's own variables**, `--default-transition-duration` and `--default-transition-timing-function`, so every bare `transition` utility already in the codebase inherits the brand curve.
- **Display is a class, not an element.** `.kk-display` is the homepage hero and nothing else; an `<h1>` anywhere takes the h1 role.
- **The weight ladder is not monotonic**: display at 600 is lighter than h1 at 700. Weight reads against size, and display only ever renders at `2.75rem` and up.
- **Weight comes from `font-weight`, not `font-variation-settings`.** Jakarta varies on `wght` alone.
- **Negative tracking is a Latin display device**, so a `:lang(ja)` rule resets it to `0` on plain headings. `.kk-label` and `.kk-display` are excluded because each carries its own `:lang(ja)` rule.
- **`:focus-visible` is declared once, globally**, as a cobalt ring. Anything that forgot its own fell back to the UA outline, which is invisible against sand.

### Auth flow

> **At a glance** · The JWT never reaches client JS. A Next route handler proxies sign-in to Rails, lifts the token from the `Authorization` header, and stores it in an `httpOnly` `session` cookie; server-side `apiFetch` re-attaches it as a Bearer. A companion `httpOnly` `account_email` cookie, set and cleared beside it, gives the header's account menu its email without a fetch. Origin checks guard the auth handlers: Next's built-in CSRF defense covers Server Actions, not route handlers.

1. The sign-in form POSTs plain credentials to `app/api/auth/session/route.ts`. It is the only such handler: registration is closed, so there is no second credential-accepting entry point.
2. It proxies to Rails, captures the JWT from the `Authorization` response header, and stores it in an `httpOnly` cookie named `session`.
3. `DELETE /api/auth/session` rotates the JTI upstream, then clears the cookie, and lands the visitor on **`/`, never `/sign-in`**: a deliberate sign-out is leaving, not being kicked out.
4. `app/lib/api.ts` exposes a server-side `apiFetch` that reads the cookie and attaches `Authorization: Bearer …`. Mutations are server actions calling `apiFetch` + `revalidatePath`.
5. File downloads proxy through `app/api/applications/[id]/{resume,cover_letter}/route.ts`, streaming the PDF body while passing `Content-Type` and `X-Content-Type-Options` through.

- **`apiFetch` detects `FormData` and leaves `Content-Type` to `fetch`**, so the multipart boundary is set correctly.
- **Origin checks are mandatory on the auth route handlers.** Next's built-in CSRF protection covers Server Actions, *not* route handlers, so without an `Origin` allowlist a cross-site form can drive a login. `web/app/lib/csrf.ts` enforces same-origin by default, with `ALLOWED_ORIGIN` to pin it.
- **Passkey sign-in reuses this whole shape.** The ceremony runs in browser JS, because `navigator.credentials.get` exists nowhere else. The JWT still never reaches that JS: the assertion is POSTed to a route handler, which proxies to Rails and stores the token in the same cookie. The passkey button renders only when the browser has `PublicKeyCredential.parseRequestOptionsFromJSON`.
- **Enrollment lives on `/settings`** and goes through **server actions**, not route handlers, because the user is already authenticated there.
- **The email reaches the header through a companion cookie, never a fetch.** `account_email` is set beside `session`, same attributes and one-day `maxAge`, and cleared on every path that clears `session`.
- **Expired sessions bounce through `/api/auth/expired`**, which clears the cookie and redirects to `/sign-in?expired=1`. The redirect's `Location` is **relative**, never assembled from `request.url`: behind a proxy the Host this process sees is internal, and an absolute redirect sends the browser there.
- **A `401` from upstream is the only thing that may surface as a `401`.** Collapsing every non-OK upstream status into `401` once turned a total API outage into "Invalid email or password" for every user (`v1.0.1`).

### Public pages

> **At a glance** · `/` argues one claim (a job tracker built on a finite state machine) with a pipeline diagram that is an *illustration*, never a second copy of the transition table. `/about` states four build decisions as the cheaper alternative each one rejected; `/docs` frames the API and links out to Swagger.

`/hsp-calculator` (`v1.10.0`) is a public, no-auth **高度専門職 points calculator**: an `OPEN_PATH`, in the sitemap, scored by pure TypeScript in `app/lib/hsp.ts` under the Vitest seam. It models the **technical track** only, but covers it in full, and every point value is sourced to the MOJ ポイント計算表 with a verification date in the module header (it rides the same annual perishable-facts pass as `Visa::COE_LEAD_TIME_DAYS`). All scoring is client-side: nothing entered is sent or stored. It wears `<SiteFooter minimal>` and deliberately does **not** link `/privacy` or `/terms`, which describe the account app, not this page.

### Legal pages

> **At a glance** · `/privacy` and `/terms`, both locales, reachable while signed in (`OPEN_PATHS`). They exist because the app holds resumes, and are written to be *true about the system as built*: six named recipients (Cloudflare, GitHub, Anthropic, Resend, Honeybadger, and the browser's own push service), three functional cookies, one `localStorage` key, no self-service delete. Never a promise the code does not keep.

- **Collected**: an email address, application records, one resume and one cover letter per application, and **incidentally IP addresses** (Rack::Attack keys throttle counters on them and Honeybadger carries request context).
- **Six recipients, all named**, because a recipient you decline to name is the one the policy exists to disclose. **Cloudflare**: TLS terminates at the edge, so it is a sub-processor of every request. **GitHub**: the nightly dump means it holds a copy of every resume. **Anthropic**: the stripped text of a posting, 12,000 characters at most, and nothing else. Not the URL, and not a resume. **Resend**: email addresses. **The browser's push service**: the one recipient that cannot read what it carries. **Honeybadger**: error reports only (`insights: enabled: false`).
- **Not a sub-processor**: the site hosting a job posting sees the *server's* IP during pre-fill, with no personal data attached.
- **Three cookies, all functional**: `session`, next-intl's `NEXT_LOCALE`, and `account_email`. **One `localStorage` key**, `kk.pins.v1`. No analytics, no pixels, no third-party JavaScript.
- **Do not write a promise the code does not keep.** No self-service delete button (there isn't one), no encryption-at-rest claim beyond what the deployment provides, no retention period the backups do not honor.
- `/terms` is correspondingly small: a portfolio demo, as-is, no uptime commitment, and a shared world-writable demo account that may be reset at any time.

### Route guard

> **At a glance** · `web/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`; a `middleware.ts` is silently ignored). Auth is the presence of the `session` cookie, across three path classes: `OPEN_PATHS` always render, `PUBLIC_PATHS` bounce to `/dashboard` when signed in, everything else bounces to `/sign-in` when not. It also resolves the locale and sets the per-request CSP nonce.

| Category | Paths | Without a cookie | With a cookie |
| --- | --- | --- | --- |
| `OPEN_PATHS` | `/about`, `/docs`, `/privacy`, `/terms` | renders | renders |
| `PUBLIC_PATHS` | `/`, `/sign-in` | renders | `307` → `/dashboard` |
| everything else | `/dashboard`, `/applications/*`, … | `307` → `/sign-in` | renders |

- **Export a function named `proxy`.** A `middleware.ts` file is ignored, silently.
- **Authorization is presence of the `session` cookie.** There are no roles.
- **`OPEN_PATHS` is checked first** and skips both redirects, so a signed-in reader is not bounced away from the pages that explain the build.
- **`config.matcher` must exclude `/robots.txt`, `/sitemap.xml`, `/llms.txt` and `/sw.js`.** Without the first three exclusions, the whole SEO surface becomes a `307` to sign-in. `/sw.js` fails more quietly: the browser re-fetches a registered service worker on its own schedule, sometimes with an expired session.
- **The locale is resolved before the auth check**, so the guard always sees a locale-stripped pathname.
- **`proxy.ts` sets the CSP**: per-request nonce, `script-src 'self' 'nonce-…' 'strict-dynamic'`, no `'unsafe-inline'`; development keeps `'unsafe-eval'` for HMR. Because nonces are applied only during SSR, **`await connection()` in the root layout opts the whole app into dynamic rendering**, which is why locale-prefixed routing costs nothing.
- **`worker-src 'self'` is in the CSP explicitly.** Without it, worker scripts fall back to `script-src`, which is nonce-plus-`'strict-dynamic'`, under which `'self'` is ignored. A static `/sw.js` has no nonce, so the fallback blocks the very registration § The service worker exists for.

### Caching (`use cache`)

> **At a glance** · Next.js 16's `'use cache'` directive requires `cacheComponents: true` in `next.config.ts`, which this project does not set. A stray directive fails the build loudly rather than silently doing nothing; enabling the flag is a whole-app decision, not a per-component fix.

### Dashboard layout

> **At a glance** · One rule orders `/dashboard`: this week's work, then the working list, then everything that is a read rather than a task. Upcoming, applications, stat cards, ghost risk, Your data. The Upcoming agenda shows a **7-day window** (plus anything overdue, with the residence clock exempt); both action cards cap at three rows behind a "Show more" toggle. All of it is `web/` display logic: no payload, ordering or limit on the wire changes for any of it.

- **Ghost risk sits below the list**, not above it: every row it names is already flagged inside the list itself.
- **Your data is last** because it is not part of the day's work.
- **The Upcoming agenda shows the next seven days plus anything overdue** (`AGENDA_WINDOW_DAYS`, `web/app/lib/agenda.ts`). **No lower bound**, because an overdue follow-up is the most actionable row on the page. **`residence` is exempt**: a Certificate of Eligibility takes 63 days (`Visa::COE_LEAD_TIME_DAYS`), so a clock that first appears a week before expiry appears too late to act on. **Nothing is dropped**: whatever falls outside folds behind "Show more".
- **Both action cards cap visible rows at three** and re-rank their own three for the read the section is for. `GhostRiskCard` sorts fewest `business_days_in_stage` first, which is the opposite of the server's longest-silence ordering, and the wire ordering is unchanged.

### Board view

> **At a glance** · `/board` (labeled "Kanban"): one column per active status, cards moved by drag or menu, each move a real FSM transition. It *fetches* the legal-move table from `GET /api/v1/transitions` rather than mirroring it. Bounded fetch-all, native HTML5 drag, optimistic moves that revert on `409`.

- **Applications**: the cursor-paginated list followed to exhaustion at `limit=100`, **capped at 10 pages**. A board is a view of everything, so pagination is the wrong UI, but a fetch-all against a cursor API must be bounded.
- **The transition table is fetched, never mirrored.** `ApplicationFSM::TRANSITIONS` stays the only copy, which is the invariant that deferred this feature to `v1.2.0`.
- **Seven active columns plus one closed rail.** The split comes from the fetched `active_states`, so nothing here enumerates the FSM.
- **The two candidate-side columns triage themselves** (`v1.10.0`): for `TRIAGE_COLUMNS` (`wishlist` and `draft`, where a stalled item is the user's *own* to move) the card carries an `excerpt` of `notes`, the job-board `source`, and its age, and the column sorts **stalest-first**. Past `applied` the next move is the company's, which ghost risk already watches.
- **"Can re-open to Applied" is derived, not a set.** `REVIVAL_STATES` is gone; `canRevive(status, table)` reads the fetched table, and the naive `transitions[status].includes("applied")` is not enough because `draft` has a *forward* edge to `applied`.
- **The card menu is the accessible path**, not a fallback: native HTML5 drag is unusable by keyboard, so every move is reachable from a real menu.
- **Optimistic moves revert on `409`**, with the reason surfaced through the toast primitive.
- The board's `days_in_stage` is **calendar** days, distinct from ghost risk's `business_days_in_stage`. The two must never be read as the same number, which is why the names differ.

### Pinned applications

> **At a glance** · Up to **three** applications can be pinned to the top of the dashboard list. Pins are **device-local** (`localStorage`, key `kk.pins.v1`): no column, no endpoint, no sync. A pin **reorders what is already on screen**; it never smuggles a row past a filter or fetches one the list did not.

- **Device-local on purpose.** A pin is a transient attention marker, not a fact about the application, so nothing about it is worth a column.
- **`app/lib/pins.ts` holds the pure logic and is unit-tested; `app/lib/use-pins.ts` is the React seam.** The same split `excerpt.ts` set.
- **Anything unreadable in that key reads as no pins.** `parsePins` accepts only a JSON array, keeps positive safe integers, dedupes, truncates to `MAX_PINS` (**3**), and treats every other input as empty.
- **A pin reorders; it never selects.** `sortPinnedFirst` hoists pinned rows to the front of the *already-rendered* list, so **a pin cannot defeat a filter** and **cannot see a page that was not fetched**.
- **A deleted application is the third way a pin goes missing**, and the only one that needed an escape hatch, since the per-row toggle needs a row to hang on.
- **`usePins` is a `useSyncExternalStore` subscription**, not state seeded in an effect. `getServerSnapshot` is a stable empty array.
- **Pins therefore appear a beat after first paint.** Every route renders on the server (the CSP nonce requires it), and the server cannot know this device's `localStorage`.
- **Two failures get a toast**, because in both the button appears to do nothing: a refused fourth pin, and a `setItem` that throws (private-mode Safari, a full quota).
- **The cap refuses rather than evicts.** Three is small enough that the user knows what is pinned, so an unrequested eviction reads as the app losing one.
- **Every row carries the control**, a real `<button aria-pressed>` beside the row's link (never nested inside it, which is invalid HTML), and the pinned state is shape, not color.
- **Scope: the dashboard list only.** The Board answers a different question and its cards are already grouped by the thing that orders them.

### Toast feedback

**One toast primitive for every write** (`v1.11.0`): `web/app/components/toast.tsx`, a context mounted once in the `(app)` layout plus a single `aria-live="polite"` region and a `useToast()` hook exposing `success` / `error`.

- **Polite, not assertive**: a toast is a result of the user's own action, so it waits rather than cutting in.
- Auto-dismiss at 5 s, **no entrance animation**, so there is nothing for `prefers-reduced-motion` to fight. The stack sits above the phone tab bar.
- **A delete navigates away before it could toast in place**, so its confirmation rides a one-shot `?toast=deleted` query that `ToastFromParam` reads once and strips via `replace` (no history entry).
- **Field errors stay inline.** A form-field error belongs beside its field, not in a corner toast.

### i18n

> **At a glance** · `next-intl`, `en` (default, unprefixed) and `ja` (prefixed; `localePrefix: "as-needed"`). Copy lives in ICU catalogs at `web/messages/{en,ja}.json`. Rails stays English-only; `web/` localizes failures on the machine-readable error `code`. All navigation goes through `i18n/navigation.ts`, never the `next/*` originals. `en`/`ja` key parity is enforced by a CI script, not by review. Japanese lines break at phrase boundaries: `word-break: auto-phrase` in CSS, plus server-side BudouX on the headings (§ Japanese line breaking).

#### URL shape: `ja` is prefixed, `en` is not

- `localePrefix: "as-needed"`. English keeps the bare paths; Japanese is prefixed. No existing URL moved when i18n landed, which is why this shape beat prefixing both.
- **`/en/*` is not a 404 and not a second canonical URL**: next-intl `307`s it to the unprefixed path, query string preserved, so the English page has exactly one address.
- `config.matcher` excludes by *prefix segment*, and a `/ja` prefix collides with no exclusion; the crawler paths are never locale-prefixed.
- **Pages live under `app/[locale]/`, which is therefore the root layout**: there is no `app/layout.tsx`. Route handlers (`app/api/**`), the crawler files (`robots.ts`, `sitemap.ts`, `manifest.webmanifest`) and `global-not-found.tsx` stay outside it, being locale-independent with fixed paths a locale segment would break.

#### Navigation must go through `i18n/navigation.ts`

**`Link`, `useRouter`, `usePathname`, `getPathname` and `redirect` are re-exported from `i18n/navigation.ts` and used instead of the `next/link` / `next/navigation` originals**, which drop the prefix and silently drop a `/ja` visitor back into English. Three named exceptions, and no others: `notFound()`, the `redirect` inside `app/lib/api.ts`, and `useSearchParams` in `toast-from-param.tsx`.

#### Locale switcher, 404s, sitemap, metadata

- The switcher is a two-locale **toggle**, not a list: it renders only the language the visitor is *not* reading, named in that language.
- `app/[locale]/not-found.tsx` handles a bad path inside a locale; paths matching no route at all fall to `app/global-not-found.tsx` (`experimental.globalNotFound`), which exists because a root layout under a dynamic segment leaves Next nothing to compose.
- `app/sitemap.ts` emits one `<url>` per route at the unprefixed address, with `alternates.languages` for `en`, `ja` and `x-default`. **Prefixes come from `getPathname()`, never string concatenation.**
- `generateMetadata` reads its description from `home.tagline` rather than holding a second copy: a Japanese search result should say what the Japanese homepage says.

#### Server-side error messages: keyed on the error code, HTTP status as fallback

**Rails stays English-only, and `web/` localizes by the machine-readable `code`.** First hit wins:

1. **Per-field validation details**: `errors.field.<field>_<code>` for each `details[]` entry; entries without catalog copy are skipped rather than guessed at. `errors.field.base_too_many_applications` is the one whose *field* is `base`, which is what Rails calls a record-level error.
2. **The code**: `errors.code.<code>`, one entry per § Error codes taxonomy member.
3. **The status**: `401`, `403`, `404`, `409`, `422`, `429`, `502`, `503`. This catches non-JSON failures and codes the catalog has not learned yet.
4. `errors.unknown`.

**The `code` also decides what recovery is offered**, not just which sentence is shown: `prefill_blocked` and `prefill_failed` open the paste box, the rest do not.

#### Catalog parity is checked in CI

`web/scripts/check-i18n-parity.mjs` diffs the two catalogs and exits non-zero on any asymmetry, wired into `web-ci`'s `verify` job as `npm run lint:i18n`.

- **It counts every path**, with array elements counted individually (`[n]` segments) and containers counted as well as descended into.
- **A path in one catalog and not the other is drift.** A differing array length is caught for free.
- **A path whose type differs is drift too**, most usefully a `string` against an `object`, where the two disagree about the shape of the copy.
- **It checks symmetry, not completeness.** A key the API needs and *neither* catalog has passes, which is exactly how `errors.field.base_too_many_applications` slipped through once.

#### FSM copies are checked in CI

**`web/scripts/check-fsm-copies.mjs` (`v1.11.0`) proves the "the board never mirrors the transition table" claim rather than asserting it.** A legitimate hardcoded set carries an inline `fsm-allow: <reason>` marker on or above its declaration, and the marker is the justification, read in review. The five that carry one are pure affordance or illustration: `COLUMN_ORDER`, `CONFIRM_REQUIRED`, `STAGE_NOTE_STATES`, and the homepage diagram's `HAPPY_PATH` / `REVIVABLE`. A `Record<Status, …>` map is exempt without a marker, because TypeScript already forces its keys complete.

#### Locale-sensitive formatting

- `Intl.RelativeTimeFormat` and `toLocaleDateString` in `app/lib/format.ts` take the active locale. `<html lang>` and OpenGraph `locale` follow it too.
- **`formatDate()` pins `timeZone: "Asia/Tokyo"`.** The API serializes in app time and a date-only field parses as UTC midnight, so without the pin a viewer west of UTC sees the previous day.
- **`isOverdue()` pins the same zone, and must** (`v1.11.1`). It compares date strings against a "today", and deriving that from the ambient clock made it a **hydration bug, not a display quirk**: the server and the browser disagreed about the date.
- **`format.ts` holds no copy.** Status labels and descriptions live in the catalogs' `status` namespace, keyed by status; an English copy in `format.ts` would give the FSM's vocabulary two sources of truth.

#### Japanese line breaking (文節単位の改行)

Two layers, deliberately:

- **CSS, the broad layer.** `globals.css` declares `word-break: auto-phrase` under `:lang(ja)`, keyed off the `lang` attribute the locale layout already sets. Chromium 119+ breaks at phrase boundaries; everywhere else it is a no-op.
- **Markup, the targeted layer.** `app/components/phrase.tsx` exports `<Phrase>`, a **server** component running BudouX (parser and ~15 KB model constructed once per process at module scope) over the headings that matter.

Three things are deliberately not covered. **Board and list card titles** use `truncate`, so a break annotation there is dead markup. **Client-rendered labels and buttons** are excluded because BudouX runs server-side so that the model never enters the client bundle, and importing `<Phrase>` from a client component would ship it. **Long body text** mostly self-corrects. `Intl.Segmenter` was rejected: it segments dictionary words, not phrases.

#### What is not translated

Job-board brand names (`BOARD_LABELS`), schema.org enum values in the `jsonLd` blob, the `KarirKalyan` wordmark, and the HTTP methods and paths in the `/docs` endpoint table.

### Installable app

`web/public/manifest.webmanifest` is a static file, served outside the locale tree and excluded from the proxy matcher. It declares `display: standalone`, and the shell behind the install is real.

- **`id` is `/`, and is the one field here that can never be corrected.** An absent `id` defaults to `start_url`, so changing `start_url` would silently re-identify the app and orphan every existing install.
- **`start_url` is `/dashboard`, not `/`.** `/` is a `PUBLIC_PATH`, so launching from `/` spent a redirect bouncing a signed-in user off the marketing page.
- **`scope` is `/` explicitly**, so a later `start_url` cannot narrow it as a side effect and drop `/applications` out of the installed app.

#### Share target: capture from the share sheet

The manifest declares a `share_target`: sharing a posting from any Android app sends `GET /applications/new` carrying `url`, `text` and `title`. `/applications/new` reads those params whether or not the navigation came from a share, so a bookmark or a hand-built URL hits the same contract. `web/app/lib/share.ts` owns the reading.

- **A shared URL wins, wherever it hid.** `url`, then `text`, then `title` are scanned and the first `http(s)` URL found is the capture. Nothing but `http`/`https` survives the parse.
- **A URL share auto-runs the pre-fill.** The deep link *is* "trigger `UrlPrefillService` on arrival", and failures land in the existing error taxonomy.
- **A text-only share seeds the paste box and runs nothing.** Shared text may be a fragment rather than a posting, so the button is left to the user.
- **A signed-out share survives the sign-in it bounces into.** The proxy clones the URL and rewrites only the pathname, so the query reaches `/sign-in?url=…` intact and sign-in forwards to `/applications/new` with the capture.
- **Install through Chrome, browse in Brave.** `share_target` exists only in the WebAPK Chrome mints; a Brave install is a home-screen shortcut in which the feature silently does not exist.

#### The installed shell: a bottom tab bar below `sm`

- **The bar is `sticky bottom-0`, not `position: fixed`.** The body is already a flex column, so a sticky bar participates in layout and nothing needs a compensating bottom padding that would drift.
- **`padding-bottom: env(safe-area-inset-bottom)`, with `viewportFit: "cover"` declared.** Without `viewport-fit=cover` the `env()` insets are all zero, which is how this padding silently does nothing.
- **The header below `sm` shrinks to mark, sign-out and locale switcher**, since the tab bar now carries Board and New.

#### Shortcuts: static file, English labels, by decision

**The labels ship English-only in a bilingual app, decided with eyes open.** Serving the manifest from a route handler that reads the locale cookie was rejected. A manifest is fetched at install time and at WebAPK-update time, so a cookie-derived manifest freezes whatever language was active at install.

#### Icon purposes are split, because one icon cannot serve both

`any` and `maskable` are contradictory requirements, and `purpose: "any maskable"` on one icon satisfies only whichever it was drawn for.

- **`any`** is drawn as-is: a rounded-square plate with transparent corners.
- **`maskable`** is full-bleed by contract: the launcher supplies the shape and crops to it, so transparency is a hole, not a rounded corner.
- **The safe zone was measured, not assumed.** The guaranteed-visible area is a circle of 80% diameter (radius 204.8px at 512); the wordmark's furthest corner is **182.6px** from center, so it clears.
- **`monochrome` is a third purpose with a third contract: shape only.** Android themed icons tint a mask to the wallpaper, and a launcher given no monochrome icon dims the full-color plate instead.

#### The service worker: push-only, never a fetch handler

`web/public/sw.js` exists for exactly two events: `push` and `notificationclick`.

- **It must never gain a `fetch` handler.** Every route renders dynamically, so its scripts carry a per-request nonce. A caching worker would serve a stale document whose nonce no longer matches the response header, and the page's own scripts would then be blocked by its own CSP.
- **`worker-src 'self'` is in the CSP explicitly** (§ Route guard).
- **`/sw.js` is excluded from the proxy matcher.** The browser re-fetches a registered worker's script on its own schedule, including after the session cookie has expired, and a fetch answering `307 /sign-in` is a failed update.
- **Registration lives in a tiny client component in the `(app)` shell**, so a worker is never installed for visitors who only read the marketing pages.
- **The permission prompt fires only from `/settings`, never on load.** A denied notification permission is sticky, so the first ask has to be one the user invited.

---

## Testing strategy

| Layer | Tool | DB? | What it tests |
|---|---|---|---|
| Unit (`api/`) | RSpec, no DB | No | FSM logic, service logic in isolation |
| Request (`api/`) | RSpec request specs | Yes, real Postgres | Full HTTP stack: routing, auth, response shape |
| Unit (`web/`) | Vitest, no DOM | No | pure client logic (timezone survivability, excerpts) |
| E2E (`web/`) | Playwright | Yes | sign in → create → transition → timeline |

- **Do not mock the database in request specs.** Mocked tests pass while real migrations are broken. Request specs use `database_cleaner-active_record` (transaction strategy), carry `rswag` metadata so `rake rswag:specs:swaggerize` generates the OpenAPI spec from the same file, and run inside `prosopite` for N+1 detection.
- **`web/`'s unit seam is Vitest** (`vitest.config.ts`): `node` environment, the `@/*` alias mirrored from `tsconfig`, `include` scoped to co-located `app/**/*.test.ts` so it never picks up Playwright's `./e2e` specs. It runs in the `web` CI job's `verify` step beside `tsc`, so a PR sees it. What belongs here is client logic a request spec cannot reach; anything needing a real API stays a request spec, anything needing a browser stays Playwright.
- **Push is mocked at the delivery boundary and nowhere before it.** The seam is `WebPush.payload_send`, the one call that leaves the process. The subscription endpoints need no mocking at all.
- **WebAuthn ceremonies use `WebAuthn::FakeClient`, in request specs, against the real database.** The fake client does real key generation and signing, so register-then-authenticate runs end to end with no browser. Two requirements: its origin must match `WebAuthn.configuration.allowed_origins` (`http://localhost:3000`), and the challenge must survive between requests, so passkey specs swap the test env's `:null_store` for a `MemoryStore`.
- **The E2E suite signs in as `e2e`**, an account `db/seeds.rb` creates alongside `demo` and leaves empty. Two accounts, load-bearing in opposite directions: `demo` must stay full (it is the portfolio walkthrough), `e2e` must start empty (a spec asserting on the first row cannot share a fixture with 12 pre-loaded ones).
  - **`e2e` must never exist in production.** `Demo::ResetService` calls `load_seed` and `DemoResetJob` runs hourly in production, so anything unguarded in `db/seeds.rb` is live within the hour. The block is wrapped in `unless Rails.env.production?`. Its address is `@karirkalyan.test`, a reserved TLD that cannot receive mail, and both halves come from `E2E_EMAIL` / `E2E_PASSWORD` with defaults duplicated in `web/e2e/credentials.ts`: change one side, change the other.
  - **Only the `setup` project may sign in.** Playwright drives the development server, where Rack::Attack throttles sign-in at 5/min per IP. `e2e/auth.setup.ts` signs in once and every spec inherits the session through `storageState`, so the throttle sees one attempt per run however many specs there are.
- Coverage: SimpleCov, branch coverage on, **80% floor**.

---

## Deployment (Docker + Cloudflare Tunnel)

> **At a glance** · Self-hosted since 2026-08-20 on the author's own machine, moved off Railway to close a ~$10/month cost for an app with one user. Four containers (`postgres`, `api`, `web`, `cloudflared`) on one internal Docker network, driven by the root `docker-compose.prod.yml`. No container publishes a host port: `cloudflared` is the only ingress, reaching `api` and `web` by Docker service name, so the app is unreachable however the host firewall is configured. The domain (`kk.chairulakmal.com`), `FRONTEND_URL`, and every env var below are unchanged from the Railway era; only who runs the containers and how traffic reaches them moved. The Railway-era version of this section, kept for the operational lessons it recorded, is archived in `notes/HISTORY.md`.

| Service | Image | Role |
|---|---|---|
| `postgres` | `postgres:18` | Single instance, named volume (`postgres_data`, mounted at `/var/lib/postgresql`: `postgres:18` moved `PGDATA`, see § Local development) |
| `api` | built from `api/Dockerfile` | Puma, with the Solid Queue plugin (no worker service) |
| `web` | built from `web/Dockerfile` | `next start`, `output: "standalone"` in `next.config.ts` |
| `cloudflared` | `cloudflare/cloudflared:2026.8.2` | The only ingress point; holds the tunnel credentials and the ingress rules |

- **`cloudflared` is pinned to a real tag, the same convention `postgres:18` uses, not `:latest`.** `docker compose build` only rebuilds services with a `build:` key, so an unpinned `cloudflared` survives ordinary redeploys unchanged. It would then silently pull whatever `latest` resolves to after a `docker system prune`, after disk pressure, or after a move to new hardware, with no version recorded and no changelog read. Raise the tag deliberately, when there is a reason to.
- **Both app images are non-root, multi-stage, and self-check.** Each runs under a uid-1000 user (`rails`; `web/Dockerfile` reuses the `node` user the base image ships rather than creating a second one at the same uid, which collides). `api`'s `HEALTHCHECK` hits `/up` (the deep check); `web` has no health route, so its check is a `200` on `/`, which still proves the Next process, locale routing and `proxy.ts` are working. Both are wired into `depends_on: condition: service_healthy`.
- **The health windows are sized for the slowest legitimate boot, not the typical one.** `api`'s `HEALTHCHECK` allows a **300 s start period**, probed every 5 s. `bin/docker-entrypoint` runs `db:prepare` to completion *before* Puma binds, so every probe fails until migrations finish, and both other services gate on `api`. Under the original 30 s window a first boot against an empty volume would have been marked unhealthy and started neither of the other two: a delay turned into an outage.
- **`postgres`'s healthcheck authenticates rather than pings.** `POSTGRES_PASSWORD` is read only while initializing an *empty* data directory. Editing `DB_PASSWORD` against an existing volume therefore leaves the old password authoritative, while `api` rebuilds its credentials on every boot. `pg_isready` reports healthy either way. The check runs a real `psql SELECT 1` with the configured credentials over **`-h postgres`, not `127.0.0.1`**: initdb's generated `pg_hba` **trusts loopback**, so a loopback check passes with any password at all. Rotating is two ordered steps, `ALTER USER … PASSWORD` first, then the `.env` edit.

**Memory limits.** All four containers carry a `mem_limit` of **1g**, set uniformly rather than tuned per-service.

| Container | `mem_limit` | Observed |
|---|---|---|
| `api` | 1g | Was 512m and pinned against it (`memory.current` 510 MiB, `anon` 493 MiB of unreclaimable Ruby heap, `file`/`inactive_file` both **zero**, `memory.events` `max` at 92: the kernel had evicted every cached page and re-entered reclaim 92 times, so Rails went back to disk on every miss), then 768m, then raised to the current uniform 1g |
| `web` | 1g | ~102 MiB observed under 512m; headroom raised with the rest |
| `postgres` | 1g | Previously left uncapped deliberately, since a hard cap on Postgres caps the page cache it depends on, making the database slow rather than making it fail. Capped anyway to keep all four containers under one uniform, host-enforced ceiling; if Postgres shows cache-pressure symptoms (slow queries with `file`/`inactive_file` near zero in `memory.current`), that tradeoff is the first thing to revisit |
| `cloudflared` | 1g | ~28 MiB observed; far under the limit, capped only for uniformity |

- **A memory limit can be changed without recreating the container**: `docker update --memory 1g --memory-swap 2g <container>`. The swap figure is not decoration, since Compose sets `MemorySwap` to twice `mem_limit` and passing only `--memory` leaves the live container disagreeing with what the next `bin/deploy` builds. `docker-compose.prod.yml` stays the source of truth.
- **`memory.events` is cumulative and never resets**, so its `max` answers "has this ever happened", not "is this happening". The diagnostic is whether it climbs from a noted baseline, which was **98** at the api container's prior 768m sizing.

**Environment variables**, split by which container needs them:

- `api` reads the root `.env` (gitignored; `.env.prod.example` is the template): `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` (the same three that configure the `postgres` service, so the halves cannot drift; `DB_HOST` is set by compose, being a property of the topology), `DEVISE_JWT_SECRET_KEY`, `SECRET_KEY_BASE`, `FRONTEND_URL`, `SOLID_QUEUE_IN_PUMA` (**required**: without it no job ever runs), `HONEYBADGER_API_KEY`, `ANTHROPIC_API_KEY`, `SMTP_*`, `MAILER_FROM`, and `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (**optional**).
- `web` reads its own `.env.web` for `ALLOWED_ORIGIN` alone. It has no code path touching Postgres, Devise, or any of `api`'s secrets, so it is no longer `env_file:`'d the whole root `.env`, which let a `web`-side compromise reach every backend secret.
- Compose still reads the root `.env` automatically to resolve `${DB_*}` inside `docker-compose.prod.yml`, independent of any `env_file:`.
- **`config/database.yml`'s `production` block takes the four keys discretely, not a `DATABASE_URL`.** Interpolating credentials into a connection string means a password containing `:`, `@` or `/` either fails to parse or parses into a URL aimed somewhere else. The two credentials use `ENV.fetch` with no default, so a missing one stops the boot.

**Ingress and deploys.**

- **The tunnel is outbound-only**, so there is no port to forward and no residential IP exposed. `cloudflared/config.yml` (gitignored; `.example` committed) carries two ingress rules: `kk.chairulakmal.com` → `web:3000` and `kk-api.chairulakmal.com` → `api:8080`.
- **`kk-api`, not `api.kk`.** Cloudflare's default edge certificate covers the apex plus one wildcard level, and the two-level shape failed the TLS handshake outright.
- **The domain is orange-clouded** (proxied), which Railway's ACME HTTP-01 challenge used to forbid. DNS cutover was 2026-08-20.
- **Deploys are manual: `bin/deploy`** (`git pull --ff-only`, `build`, `up -d`). A merge to `main` is no longer itself a deploy. Migrations need no separate step, since `bin/docker-entrypoint` runs `db:prepare` on every boot of a `rails server` command.

### Network exposure, audited 2026-08-20

**The origin's reachable surface is exactly the two ingress hostnames above, and that holds at three independent layers.** They are listed in order of how much weight they carry. The first carries nearly all of it, because it is a property of `docker-compose.prod.yml`: it survives any firewall mistake, on any host.

- **No service publishes a host port.** All four containers sit on the single `internal` bridge, `cloudflared` dials *out*, and the backups runner reaches Postgres through `docker exec` rather than TCP. Measured, not assumed: `ss -tlpn` filtered to non-loopback addresses returns **nothing at all**.
- **`ufw` is active**: default deny incoming, allow outgoing, routed disabled. `openssh-server` is not installed.
- **The usual "Docker punches a hole through `ufw`" caveat does not apply here, and the reason is a property of the runtime, not of this app.** Stock Docker Engine inserts DNAT rules that bypass the `INPUT` chain `ufw` filters on. This machine runs Docker Desktop for Linux, whose engine lives in a VM: `iptables -t nat -L DOCKER` reports no such chain, there is no `/var/run/docker.sock` on the host, and a published port surfaces as an ordinary userspace bind. **Moving to stock Docker Engine reintroduces the bypass**, and only the no-published-ports rule above would still hold.
- **Containers run unprivileged**: `api` and `web` as uid 1000, `cloudflared` as 65532, `postgres`'s postmaster as `postgres`. None is `privileged`, none adds a capability.
- **Every file holding a production secret is mode 600.** Four were **664** until this audit, and all four were created during the move to self-hosting. The older secrets already followed the convention. The new deploy files did not inherit it, because nothing enforces the mode. **The mode defends against other host users, not against the container**: Docker Desktop's file-sharing layer does not enforce DAC on a bind mount, verified directly rather than inferred.
- **The self-hosted runner's blast radius is bounded by one fact**: `karirkalyan-backups` is private and this repo's own workflows all run on `ubuntu-latest`. A self-hosted runner attached to a *public* repo is the classic RCE hole, because a fork's PR can propose the workflow that runs on it. What remains is not a network attack: push access to the private backups repo is code execution on this machine, which is GitHub account hygiene, and why the runner is registered to that one repo rather than to the account.

**What the audit did not cover**, recorded so the gap is not mistaken for a clean result: Cloudflare's own edge configuration, meaning WAF rules, rate limiting and Bot Fight Mode. That is the one layer in front of the origin that lives entirely outside this repo. `TODO.md` holds it.

### Backups

**Backups stay on GitHub Actions; only where the job runs and how it reaches Postgres changed.** A home Postgres behind a Tunnel has no route a GitHub-hosted runner can reach, and it should not be given one. So `check.yml` and `backup.yml` run on a **self-hosted runner**. That runner is installed as a systemd service on this machine, and registered to the private [`karirkalyan-backups`](https://github.com/chairulakmal/karirkalyan-backups) repo alone.

- Same cron (05:15 JST), same `scripts/fingerprint.sql`, same `actions/upload-artifact` with **60-day retention**, same `state/fingerprint` / `state/last-backup` commit.
- `psql` / `pg_dump` run via **`docker exec`** into the `postgres` container, which drops the per-run `apt-get` that installed a version-matched client and the `DATABASE_URL` secret itself (a local `docker exec` authenticates over the container's Unix socket).
- **The dump is the full database, which means GitHub holds a copy of every resume.** That is why GitHub is one of the six named sub-processors in § Legal pages.
- **It only dumps when the data changed.** The job fingerprints `users` / `applications` / `timeline_entries` (`count @ max(updated_at)`) and skips when it matches the previous run, so `solid_queue` / `solid_cache` churn never triggers a dump.
- The dump is never git-committed: it is the workflow's own artifact, and the repo tracks only the two small state files.
- A restore drill passed 2026-07-11: `db-dump-7` restored into a scratch Postgres 18.4 with zero errors, all 17 tables intact. **Deliberately not a live mirror on a second database**: HA machinery for an app whose actual need is an undo button.

Operator runbook (destroying a user, resetting the demo account): [`notes/OPS.md`](notes/OPS.md). Production lessons from the Railway era, kept so they are not relearned: [`notes/HISTORY.md`](notes/HISTORY.md).

---

## Local development

**Prerequisites:** Docker, Ruby 3.4.9 (via mise), Node 24

```bash
cd api && docker compose up -d    # postgres 18 only; no Redis

cd api && bundle install && bin/rails db:create db:migrate db:seed && bin/rails server  # :3001
cd web && npm install && npm run dev                                                    # :3000
```

- **Node 24 lives in three places, not one.** `actions/setup-node` reads `web/.nvmrc`. `web/package.json`'s `engines.node` restates it (a Railpack holdover). `web/Dockerfile`'s `ARG NODE_VERSION` default restates it again, and that Dockerfile is what builds production now. Nothing connects the three, so a version change needs all three edited by hand. A CI runtime that differs from production's is how the `npm ci` lockfile divergence broke the build twice.
- **Local Postgres tracks production's major version: both are 18.** They drifted apart once already, and a dev database a major version behind production is a bug waiting to be found in production.
- **The `postgres:18` image moved its data directory**: `PGDATA` is `/var/lib/postgresql/18/docker` and the declared volume is `/var/lib/postgresql`. Mounting the old `/var/lib/postgresql/data` against an 18 image leaves Postgres writing outside the named volume, and the database silently empties on every `docker compose down`. Upgrading a machine with a 16 volume needs `docker compose down -v` and a fresh `db:setup`.
- **`db:seed` is not optional.** Registration is closed, so a freshly migrated database has no account and no sign-up form to make one with. It is idempotent, and CI runs it after `db:migrate`. The operator's alternative is `bin/rails users:create`.
- Jobs run inline via the `:async` adapter in development: there is no worker process to start.

---

## Versioning & releases

Semantic versioning, with **major redefined against the compatibility surfaces this project actually has**. The textbook rule (*major means you broke the API your consumers depend on*) cannot fire here: `web/` is the only client of `/api/v1` and it ships in the same commit. The surface that does exist, and that a solo operator feels at 2 a.m., is **rollback**.

| Level | Rule | Examples |
| --- | --- | --- |
| **major** | The previous image **cannot** be redeployed against the new database. Rolling back needs a plan. | An irreversible or destructive migration; `/api/v1` → `/api/v2`; removing or renaming a state in `ApplicationFSM` (stored `status` values stop validating); dropping a required env var. |
| **minor** | New user-visible capability, and rollback is still a redeploy. | A feature (ghost risk, the Kanban board); a new endpoint; a new optional field or additive migration. |
| **patch** | No new capability. | Bug fix, security fix, dependency refresh, performance work. |

**The test for major is mechanical**: could the previous release's image be deployed against the database this release leaves behind, and would it boot and serve? If no, it is a major. The `positions` entity in `TODO.md` is the first plausible `2.0.0`: it adds a table *and* changes the state machine.

### The version number lives in exactly one place: the git tag

`web/package.json` carries a static `"version": "0.0.0"` on purpose: the package is `private: true`, so npm never reads the field, and a number kept there would be a hand-copied duplicate of the tag. `api/` has no version constant. There is nothing to keep in sync, so nothing can drift.

#### `v1` has stopped being tagged, and `v1.11.1` is its last tag

**Decided 2026-08-03. There is no `v1.11.2` and there will not be one; the next tag this repo cuts is `2.0.0`.** Under the feature freeze every remaining `v1` release would be a patch, and a patch tag gains nothing. Nobody installs a package, `web/` is the only client, and the deploy has already happened.

What it costs, stated plainly so it is a known trade: **the deployed app has no version number at all.** The rule above still holds, so the honest description of production is `v1.11.1` plus however many commits. Nothing in the app displays a version and no client negotiates one, so nothing breaks.

**The mechanical test is not retired with the tags.** It still decides whether a change is allowed under the freeze, and it is what `2.0.0` will be measured against. `CHANGELOG.md`'s newest section holds untagged deployed work rather than pretending to a version.

---

## What this project is demonstrating

| Concern | Approach | Why it matters |
|---|---|---|
| State machine | Custom PORO, no gem | Keeps logic visible; understanding over convenience |
| Audit trail | Transactional `TimelineEntry` on every status change | Data integrity, not just logging |
| Auth | Devise + devise-jwt with JTI revocation | Stateless JWT with a real logout mechanism |
| Concurrency | Optimistic locking (`lock_version`) | Awareness of concurrent writes |
| Background jobs | Solid Queue + idempotency key | Defensive job design under at-least-once delivery |
| File storage | PostgreSQL `bytea`, 1 MB limit | Right-sized; no object-storage overhead |
| Query design | SQL aggregation for dashboard stats | No N+1; no loading records into Ruby needlessly |
| API docs | rswag: specs double as OpenAPI source | Tests and docs cannot drift |
| Testing | Unit specs (no DB) + request specs (real DB) | Two-tier strategy matching Awano's Vitest + Playwright |

This project intentionally mirrors [Awano](https://github.com/chairulakmal/awano), a Next.js multi-tenant support desk. A reviewer can compare both and see the same engineering thinking (FSM, transactional audit trail, service layer, two-tier testing) expressed in two stacks.
