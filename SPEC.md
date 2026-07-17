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

Last synced against the code: **2026-07-17**, `v1.6.0` (in flight) — § `UrlPrefillService` gains a
**second entry point**: the posting text can arrive pasted instead of fetched. Only `fetch` ever
failed, and `extract` never knew where its text came from, so the paste enters the existing
`to_text → extract` tail rather than forking a second pipeline. The failure codes `v1.4.3` typed
are what make it targetable — `prefill_blocked` and `prefill_failed` are the two the paste box
cures, and § Server-side error messages now records that `web/` reads the `code` rather than
inferring recoverability from prose. § Installable app is new, and describes the manifest for the
first time: `start_url` stops launching the app onto the marketing page, `id` is pinned before a
WebAPK exists to be orphaned by it, and the icon purposes split because `any` wants the drawn
rounded corners and `maskable` wants none.
Every **FSM rule the UI applies** is now fetched. The sets `web/` still names for itself decide
presentation and affordance rather than what the FSM permits — `COLUMN_ORDER` ranks the board's
columns whose *membership* is fetched, `CONFIRM_REQUIRED` and `REVIVAL_STATES` choose which moves
get a prompt and which offer a way back. Stale, those could misjudge how a move is *offered*
(`REVIVAL_STATES` most of all — see its own header, which admits it reads an FSM edge the fetched
`transitions[status]` also answers); none could authorise one, which the server validates
regardless. The
homepage's `pipeline-diagram.tsx` remains the one declared exception, an illustration nothing
reads. A missing `terminal_states` degrades to **silence** — neither "permanent" nor "reopenable" — since
the FSM always has terminal states and an empty list can therefore only mean the table did not
arrive. A missing `entry_states` degrades the same way, to the **absence of a picker**: the form
sends no `status` and the API applies its own default, because an empty entry set likewise cannot
be real, and guessing one risks offering a state the API would `422`. § API contract's
`GET /applications` now documents its query parameters, which it never had — a swagger-only gap,
so no prose here moved. Before that, `v1.5.0` — § API contract's
`status` filter became a **list**: `GET /applications?status=applied,offer` ORs within the filter
and still ANDs against `company` / `source`, with an empty or all-unknown list treated as
unfiltered rather than as `where(status: [])`'s silent zero rows — the reading that would have
contradicted § `Applications::ListQuery`'s promise that junk falls back to the unfiltered first
page. `status=applied` still parses as a one-element list, so the wire is backward-compatible.
§ The transition table gained `active_states`, and `ApplicationFSM::ACTIVE_STATES` now owns the
definition the frontend used to hardcode: promoting "active" from a display detail to a
user-facing filter contract would otherwise have left FSM vocabulary living in two languages.
§ Board data re-argued its rejection of per-column pagination, which had leaned partly on the
`status` parameter not existing — the parameter exists now, and the surviving reasons carry it
alone. Before that, `v1.4.4` — § i18n gained
§ Catalog parity is checked in CI: `en`/`ja` key parity was a convention held by review, and this
document said so; it is now a script in the `web` job, counting every path with array elements
counted individually so a missing FSM reason chip cannot hide inside an array. § Security gained a
per-account write throttle on the application endpoints and `Application::MAX_PER_USER`, a hard
ceiling of 200 applications per account: the throttle bounds the rate of the upload path, and the
ceiling is what bounds total storage, which no throttle can — and every path guard in
`rack_attack.rb` now keys off `Rack::Attack.normalized_path` rather than raw `req.path`, because
Rails routes `/api/v1/auth/sign_in.json` to the same action while an `==` guard misses it and
fails open. § API contract gained
§ Download filenames, and § Exports now defers to it: both download surfaces name their PDFs
through one `Application#download_basename`, where the controller previously sent a hardcoded
`resume.pdf` for every application and the archive built a different name from `parameterize`
that emptied out on Japanese company names. The slugger preserves Unicode rather than
transliterating it. Before that, `v1.4.3` — § Query layer gained
`Applications::ListQuery`, an extraction rather than a behaviour change: it moves
`GET /api/v1/applications`'s filtering and cursor decoding out of the controller and writes down
the contract that action already had. § Error codes split pre-fill failure into `invalid_url` /
`prefill_blocked` / `prefill_unreachable` / `prefill_failed`: the `invalid_url` scope the
`v1.4.1` audit recorded as "corrected to match the code" was correct about the code and wrong
about the world — the code was conflating four outcomes, and it is the code that has now moved.
After the tag, § `UrlPrefillService` **retracted a factual claim**: no board is currently known to
block us, and the TokyoDev challenge this spec asserted as standing policy did not survive
re-probing. The retraction changed no code — only what the spec claims to know.

---

## Contents

- [How to use this file](#how-to-use-this-file)
- [System overview](#system-overview) — [Registration is closed](#registration-is-closed)
- [Backend (`api/`)](#backend-api) — [Tech stack](#backend-tech-stack) · [Data model](#data-model) · [State machine](#state-machine) · [Service layer](#service-layer) · [Query layer](#query-layer) · [API contract](#api-contract) · [Background jobs](#background-jobs) · [Mail](#mail) · [Security](#security) · [Observability](#observability)
- [Frontend (`web/`)](#frontend-web) — [Tech stack](#frontend-tech-stack) · [Design system](#design-system) · [Auth flow](#auth-flow) · [Public pages](#public-pages) · [Legal pages](#legal-pages) · [Route guard](#route-guard) · [Board view](#board-view) · [i18n](#i18n)
- [Testing strategy](#testing-strategy)
- [Deployment (Railway)](#deployment-railway)
- [Local development](#local-development)
- [Versioning & releases](#versioning--releases)
- [Decisions log](#decisions-log)
- [What this project is demonstrating](#what-this-project-is-demonstrating)

---

## System overview

> **At a glance** · Two deployables. `api/` (Rails 8) owns data, auth, the FSM, and background
> jobs; `web/` (Next.js 16) owns the UI and the browser session. The one hard rule at the
> boundary: **the JWT never reaches client-side JavaScript.**

```
karirkalyan/
  api/    ← Rails 8 API-only. Owns data, auth, the FSM, background jobs.
    docker-compose.yml   ← postgres 18 for local dev (no Redis)
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

### Registration is closed

> **At a glance** · No public sign-up — no endpoint, no page, no invite. Visitors use the shared
> demo account; real accounts are created by the operator, server-side. The trade is deliberate:
> it avoids a custodial promise over strangers' resumes this deployment cannot keep. Account
> *deletion* stays (`DELETE /api/v1/auth/account`).

**There is no way for a stranger to create an account.** No `POST /api/v1/auth/sign_up`, no
`/sign-up` page, no invite flow. Visitors sign in to the shared read-write demo account through the
**`Try demo account` button on `/sign-in`**, which fills the form for them; the credentials are also
published in both READMEs and in `llms.txt`, and they ship in the sign-in page's own JavaScript
bundle — so treat them as world-readable, which is the assumption § Legal pages already makes when
it calls the demo account world-writable. New accounts are created by the operator, on the server,
with `bin/rails users:create EMAIL=… PASSWORD=…` — the one surviving caller of `WelcomeMailer`.

<details>
<summary><strong>Why registration is closed — the full argument</strong></summary>

This is deliberate, and it is the single most surprising thing about the system, so the reasoning
is here rather than in a commit message:

- **Open registration means strangers' resumes.** A resume is close to the most PII-dense document
  a person owns — legal name, address, phone, employment history, sometimes a photo and a date of
  birth. This app stores it as `bytea` in a single Railway Postgres, whose only backup is a nightly
  `pg_dump`. That is an honest arrangement for *my* resume. Accepting yours would make it a
  custodial promise I have not built the machinery to keep.
- **No legal entity is not an exemption.** Under Japan's APPI a natural person handling personal
  information can be a 個人情報取扱事業者 in their own right; the small-handler carve-out for under
  5,000 records was repealed in 2017. "It's just a portfolio project" is not a defence, and neither
  is "I'm not a company."
- **Nothing is lost.** The portfolio story is told by the demo account, which is *better* than an
  empty new account: it opens with 12 pre-loaded Tokyo tech applications, a populated board, real
  timeline history and a working ghost-risk prediction. A recruiter who signs up gets an empty
  dashboard and no reason to stay.
- **It deletes a whole surface.** Closing the door removes the sign-up endpoint, its Rack::Attack
  throttle, its spam-account and outbound-mail vectors, its CSRF-able route handler, and the
  self-service account-deletion button an open service would owe its users — because there are no
  such users. What it does *not* remove is the deletion capability itself: `DELETE
  /api/v1/auth/account` stays, and cascades (§ API contract). The operator can honour an erasure
  request; nobody can trip over the button.

</details>

<details>
<summary><strong>The <code>routes.rb</code> trap, and why <code>RegistrationsController</code> is not a Devise subclass</strong></summary>

The trap to know before touching `config/routes.rb`: Devise's `:registerable` module generates the
sign-up `POST` **and** the account-destroy `DELETE` from the same `registrations` controller, so
reaching for `skip: [:registrations]` alone would silently take the deletion endpoint with it.
`devise_for` therefore skips `:registrations`, and the destroy half is re-declared as an ordinary
route — no `devise_scope` — on a path that says what it does:

```ruby
devise_for :users, path: "/api/v1/auth", skip: [ :registrations ], …

namespace :api do
  namespace :v1 do
    namespace :auth do
      delete "account", to: "registrations#destroy"
    end
```

`Api::V1::Auth::RegistrationsController` is deliberately **not** a `Devise::RegistrationsController`
subclass: inheriting it would drag `new`, `create`, `edit`, `update` and `cancel` in as live
methods — unroutable, but a loaded gun in a drawer, in the one release whose point is that the gun
is gone. It subclasses `ApplicationController` instead, which is where `authenticate_user!`,
`current_user` and `render_error` come from anyway; nothing was lost. `bin/rails routes` shows
exactly four auth routes: sign-in (new + create), sign-out, and account-destroy.

</details>

The demo account is exempt from destruction (`403 forbidden`). Its credentials are published, this
endpoint is in Swagger, and `DemoResetJob` only rebuilds on the hour — without the guard, any
visitor could make "Try demo account" 401 for the next fifty-nine minutes.

Reopening registration is a product decision, not a config change: it would owe users a privacy
policy that promises more than "the operator's own data" (§ Legal pages), a self-service delete
button, and a backup story that is not one `pg_dump`. The upload throttle and the per-account
application cap this list used to name are no longer owed — `v1.4.4` built both (§ Security),
because the shared demo login is a multi-tenant abuse surface whether or not registration is
open.

---

## Backend (`api/`)

### Backend tech stack

| Technology | Alternative considered | Reason |
|---|---|---|
| Rails 8 API-only | Full-stack Rails | No HTML views needed; clean API contract |
| Ruby 3.4.9 (via mise) | System Ruby | Reproducible across machines |
| PostgreSQL 18 | SQLite | Foreign keys, `EXTRACT()` for date math, production-grade |
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

> **At a glance** · Three tables. `users` (Devise auth, `jti` for JWT revocation), `applications`
> (the core FSM entity — `status`, plus `resume`/`cover_letter` as `bytea`), and `timeline_entries`
> (append-only audit log, one row per status change).

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
excluded from JSON serialisation — dedicated download endpoints serve them via `send_data`, under
the name `#download_basename` gives them (§ Download filenames).

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

  index (application_id, created_at)   ← composite; serves the ghost-risk window function
  index (actor_id)
  index (idempotency_key) unique
```

The `(application_id, created_at)` composite **replaces** a bare `application_id` index, which it
covers as a prefix — so it is a widening, not an extra index. It exists because every read of this
table is per-application in time order: the detail page's timeline, and the `LAG(created_at) OVER
(PARTITION BY application_id ORDER BY created_at)` in the ghost-risk query, which is now the
heaviest thing the dashboard does.

There is still deliberately **no index on `to_status`**, though the dashboard's offer-lookup
subquery filters on it. Add `(to_status, application_id, created_at)` if the table grows; see
`TODO.md`.

**Creation writes no timeline entry.** A row lands here only on a *transition*; an application
created directly in an entry state (`wishlist`, `draft`, `applied`) has no `to_status` row naming
that state. Anything deriving stage history from this table has to account for it — see the
ghost-risk query, which does.

### State machine

> **At a glance** · `api/app/lib/application_fsm.rb` — a hand-written PORO, not a gem. 13 states;
> `TRANSITIONS` is the single source of truth for legal moves. Three states are terminal
> (`accepted`, `declined`, `archived`); three *look* terminal but revive to `applied` (`rejected`,
> `withdrawn`, `ghosted`). Creation is not a transition — it sets one of three `ENTRY_STATES`.

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
ApplicationFSM::VALID_STATES                 # 13 states — TRANSITIONS ∪ TERMINAL_STATES
                                             #   (archived appears in no TRANSITIONS row)
ApplicationFSM::TERMINAL_STATES              # accepted, declined, archived
ApplicationFSM::ENTRY_STATES                 # wishlist, draft, applied
ApplicationFSM::ACTIVE_STATES                # the 7 still in play — VALID_STATES minus
                                             #   TERMINAL_STATES, rejected, ghosted, withdrawn
```

`valid_next_states` is serialised by `show` and `transition` only — **not by `index`**, which
stays lean. A board view gets the whole effective table in one request from
`GET /api/v1/transitions` instead — see § API contract.

### Service layer

> **At a glance** · Writes go through explicit service objects, never model callbacks.
> `TransitionService` is the only path for a status change (FSM check + timeline row in one
> transaction). Also here: `UrlPrefillService` (AI pre-fill over an SSRF-guarded fetch),
> `Demo::ResetService`, and the two `Exports::*` artefact builders.

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
text to be parsed.

**Two entry points, one pipeline.** The pipeline is `fetch → to_text → extract`, and `POST
/applications/prefill` accepts either `url` or `text`:

- **`url`** — the whole pipeline. This is the path that can be refused.
- **`text`** — the user pasted the posting themselves, so the fetch is skipped and the *same*
  `to_text → extract` tail runs on what they pasted. `extract` takes text and knows nothing about
  where it came from, which is why this is a second entry point and not a second pipeline: no new
  infrastructure, no per-source branching past the front door, and no circumvention of a site that
  refused us — the user fetched the page themselves, in their own browser, as themselves.

`text` wins if both arrive, because the user only pastes after the URL has already failed. Neither
one present is still `invalid_url` ("Paste a job posting URL first") — the request supplied nothing
to work with. **Pasted text goes through `to_text` rather than around it**: it inherits the same
byte-cap-then-`scrub`, the same tag-strip (a paste from *view-source* works), and the same
whitespace collapse — one text-conditioning rule, not one per source. What it does not inherit is
`MAX_TEXT_CHARS`, which `to_text` no longer applies: the fetch's truncation lives in `#capped`,
and the paste refuses instead. That is the one divergence, and it is spelled out below.

**The paste box is not offered on every failure, and that is the point of the taxonomy.** It is
shown on exactly the two codes it cures — `prefill_blocked` (the site refuses automated readers)
and `prefill_failed` (we reached the page and it yielded no posting: a login wall, an SPA shell, a
challenge interstitial). A `prefill_unreachable` gets a **Retry** instead, because a paste would be
manual work for a URL that may well answer on a second try, and `invalid_url` gets neither —
nothing is wrong except the URL. Before `v1.4.3` typed these, every failure arrived as
`invalid_url` and a paste box shown on all of them would have been noise on three failures out of
four.

The **near-zero-manual-entry test** in `TODO.md` § Standing rules is not in tension with this. That
test refuses a paste field *replacing* free capture at prefill time; this one competes with **no
capture at all**, because the fetch is impossible rather than merely unattempted. Same widget,
opposite question. **Model: Claude Haiku 4.5.** Extraction is a small, well-defined job; the
cheapest fast model is the right tool, and a typical posting costs a fraction of a cent. Claude
specifically because it reads Japanese postings natively — the same flow works on a Wantedly
listing, a Greenhouse page, or a company careers page without a parser per site. For a Tokyo job
search that is the whole point.

Because the server fetches a user-supplied URL, the SSRF guard is load-bearing:

- Resolves the host and validates **every** resolved address against loopback, private, and
  link-local ranges — including the cloud metadata endpoint `169.254.169.254`.
- **Pins the connection to the validated IP** (`http.ipaddr`), so a DNS rebind between check and
  connect cannot redirect the fetch. Restricts to ports 80/443.
- **The pin prefers an IPv4 address** when the host resolves to both. Outbound IPv6 is disabled on
  the `api` service, so dialling a AAAA record dies with `ENETUNREACH` before a packet leaves the
  container — and Cloudflare-fronted hosts resolve IPv6-first, which makes that the common case
  rather than the edge. This does not weaken the guard: every resolved address is still validated
  and a single internal one still rejects the whole URL. The preference only decides which
  *already-validated* address gets dialled, never whether validation ran.
- **The connection never proxies** (`Net::HTTP.new(host, port, nil)`). The default `p_addr` is
  `:ENV`, under which an `http_proxy` variable makes Net::HTTP dial the proxy and ignore `ipaddr`
  entirely — the proxy re-resolves the hostname and the rebinding defence above becomes
  decoration. Passing `nil` means a future env change cannot silently switch the guard off.
- Re-validates **scheme, port, and every resolved address on every redirect hop**. Scheme matters
  per hop because `fetch` recurses into itself and never passes back through `validated_uri`, and
  `URI.join` will produce `ftp://host:80/x` from a `Location` header — which clears a port-only
  check.
- **A guard rejection past hop 0 is a `FetchError`, not an `InvalidUrlError`.** The user chose
  hop 0; the site chose the rest. Blaming a pasted URL for where the site redirected is the same
  lie this taxonomy exists to end, one hop later.
- **Every guard rejection returns one message** — "That URL can't be fetched." — whether the host
  failed to resolve or resolved somewhere internal. Distinct copy would turn a blind SSRF into an
  internal-hostname oracle: probe `redis.railway.internal`, read which names exist off the
  wording. The demo account's credentials are published, so authentication is not a barrier here.
  The specific reason is logged server-side.
- Body-size cap on the fetch; character cap on the text sent to Claude. The body is `scrub`bed
  after the byte-cap: `byteslice` is byte-indexed, Japanese text is three bytes a character, and a
  cut landing mid-character makes every later `gsub` raise `ArgumentError` — an untyped `500` on
  exactly the postings this service exists to read. **A paste is byte-capped and `scrub`bed the
  same way before `to_text`**, for the same reason and with the same constant: it bounds the
  regex work on a body the user chose the size of.

**The fetch truncates at `MAX_TEXT_CHARS` (12,000); the paste refuses.** That is the one place the
two entry points diverge past the front door, and the difference is whether the user watched us
read it. A fetched page over the cap is cut by `#capped` in silence — nobody saw its length, and a
posting has said what it needs to well before 12k of stripped text. A paste is something the user
assembled and can see, so cutting it silently would tell them their whole posting reached Claude
when a third of it did. `PasteTooLongError` → `prefill_paste_too_long` instead, naming the real
figure.

**The cap is measured server-side, and the browser deliberately does not mirror it.** The ceiling
applies to *stripped* text, and only the server has stripped it: a view-source paste is routinely
3× its own stripped length, so a form counting the raw paste would refuse postings that sail
through whole. `MAX_FILE_BYTES`' spare-the-round-trip logic does not transfer, because a file's
size is a number the browser can actually compute and this one is not. The paste box therefore
shows an **informational** character count with no limit attached and blocks nothing; the server
owns the decision, because it is the only party that can make it correctly.

Two consequences worth stating, since both look like oversights:

- **The counter counts codepoints** (`[...posting].length`), not `.length`'s UTF-16 code units.
  Ruby's cap counts codepoints, an emoji scores 2 under `.length`, and this app is full of
  Japanese — a code-unit count would match neither what the user sees nor what the server does.
- **`errors.code.prefill_paste_too_long` does not name the number**, following
  `base_too_many_applications` (§ Server-side error messages) rather than `resume_too_long`. Here
  it is not only the drift argument: the count the user can see is the *raw* paste, and the limit
  applies to the stripped text, so quoting "12,000" beside a counter reading 16,800 would invite
  exactly the wrong comparison. The English sentence from the API names both real figures; the
  localized copy says it is too long and to trim it.

Rate limits are enforced per-IP *and* per-account — see Security.

Errors are typed so that each one tells the user a different true thing, and the mapping is the
whole point of the taxonomy: `InvalidUrlError` → `invalid_url` (your URL is the problem — fix it),
`BlockedError` → `prefill_blocked` (the site refuses automated readers; nothing to fix),
`PasteTooLongError` → `prefill_paste_too_long` (the paste is over the cap once stripped — trim it),
`FetchError` → `prefill_unreachable` (check the page is live, then retry), `UnreadableError` and
`ExtractionError` → `prefill_failed` (we read the page, it yielded no posting), `ConfigError` →
`prefill_unavailable`. Statuses are in § Error codes. The user can always fill the form in by hand.

**`prefill_failed`'s copy names no source**, because both entry points reach it: a fetched page
that yielded no posting and a paste with no readable text in it raise the same `UnreadableError`.
Copy that said "that page couldn't be read" would be telling someone who had just pasted a posting
about a page nobody fetched.

Two edges of that mapping are deliberate. **An extraction where every field comes back empty is an
`ExtractionError`, not a `200`** — Claude read the page and found no posting in it, so rendering a
blank form as success would be the same class of lie as the status codes above. And **`ConfigError`
fires before the fetch**, not after: a server with no `ANTHROPIC_API_KEY` would otherwise spend the
full guarded round trip, up to 13s of timeouts, on a result it cannot use.

**A blocked fetch is expected degradation, not a bug to engineer around.** A site may refuse an
automated reader outright — `401`/`403`, or a `cf-mitigated` header on any status — and
`prefill_blocked` reports that as what it is: the URL is fine, a retry fetches the same wall, and
telling the user their URL was malformed instead would be a lie. Defeating a challenge is out of
scope by choice; rotating User-Agents or proxying to get around one is not a fix, it is a lie told
to the site instead of the user.

**No board is currently known to block us.** `prefill_blocked` guards a state that is real and
cheap to report, but as of 2026-07-17 nothing in production is observed to be in it.

<details>
<summary><strong>Why this section named TokyoDev until 2026-07-17, and why it no longer does</strong></summary>

It claimed TokyoDev answered any non-browser client with `403` + `cf-mitigated: challenge`, "with
our User-Agent and with a stock Chrome one alike". That claim did not survive scrutiny, and the way
it failed is worth keeping.

**Every `403` behind it was seen from a laptop, and none from this service** — confirmed with the
author, who ran the probes locally and never from inside the container. That alone sinks the claim:
until `v1.4.3` the IPv6-first bug killed every connect to a Cloudflare-fronted host with
`ENETUNREACH` before a packet left the box, and TokyoDev is one, so the `api` service had **never
reached TokyoDev at all**. A statement about how a site answers *us* had been assembled entirely
from observations of how it answers *something else*.

What that something else was doing matters too: **fetching many TokyoDev URLs at once**, during the
debugging session that produced this release. Bot mitigation scores the client it answers, so a
burst is itself a known way to be challenged — the observation may well have been the site reacting
to the probe rather than stating a policy. That much is inference, not proof; the site could equally
have been in a defensive mode that hour. But it does not need proving, because the claim was never
tested against the path it described.

Re-probed on 2026-07-17, TokyoDev answered `200` — six of six to this service's exact
`User-Agent`, and to a stock Chrome one likewise. **Those probes were from a laptop as well**, and
by the second rule below they cannot speak for the container either; what they establish is only
that the block was neither standing nor UA-based, which is enough to sink the claim as written.
The evidence that actually speaks for this service is production: pre-fill against a TokyoDev
posting works.

Two rules this leaves behind. **A self-inflicted block is indistinguishable from a real one at the
moment you observe it** — probe a third-party site one request at a time, or the finding is about
you rather than about the site. And **a claim about how a site treats this service has to be
measured from this service**: a laptop and the `api` container differ in IP, in reputation, and —
as this very release proves — in whether they can reach the host at all. Nothing here is fixed by
probing more politely from the wrong machine.

</details>

#### `Demo::ResetService`

Wipes the shared "Try demo" account back to a clean seed. Invoked hourly by `DemoResetJob`, scoped
to the demo user only. Without it, the shared account accumulates every visitor's data
indefinitely.

#### `Exports::ApplicationsCsv` and `Exports::AccountArchive`

Signature: `new(user).call` → a `String` of bytes, ready for `send_data`. Each also exposes
`#filename`, so the date-stamped download name (`karirkalyan-applications-2026-07-12.csv`) is
decided next to the bytes it names rather than in the controller.

They are services, not queries: a query answers a question about the data, and these two *produce
an artefact* from it. What they share is the read — `user.applications` with `timeline_entries`
preloaded — and that is deliberately not extracted into a common parent. Two subclasses of an
`Export` base class, to share one `includes`, would be inheritance used as a hiding place.

`ApplicationsCsv` is `CSV.generate` over the columns a spreadsheet can hold, blobs excluded and
replaced with `has_resume` / `has_cover_letter` booleans. It **quotes every field
(`force_quotes: true`)** and prefixes any cell that opens with `=`, `+`, `-`, or `@` with a
single quote: a company literally named `=cmd|...` is a CSV-injection payload the moment the file
is opened in Excel, and this is a file we hand a user and expect them to open in Excel. The escape
is the [OWASP-recommended](https://owasp.org/www-community/attacks/CSV_Injection) one.

`AccountArchive` builds the zip described under § API contract → Exports.

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

### Query layer

> **At a glance** · `api/app/queries/` — the read-side counterpart to services: non-trivial read
> models that mutate nothing. Two live here: `ListQuery`, which turns the application index's
> filter and cursor params into a page of records, and `GhostRiskQuery`, which flags applications
> the user has probably been ghosted on.

Services exist for *writes*: an explicit user action changes state (§ Service layer). Query objects
are the read-side counterpart — a non-trivial read model that mutates nothing. `app/queries/` holds
them.

A read model earns a query object when it is **more than a scope**: `GhostRiskQuery` composes a
window function with a percentile aggregate, and `ListQuery` composes four filters with cursor
decoding and a lookahead. A one-line `where` does not qualify and belongs on the model.

#### `Applications::ListQuery`

Signature: `new(user:, status:, company:, source:, after:, limit:).call` — every filter keyword is
optional and nil-tolerant. Backs `GET /api/v1/applications` and nothing else. Returns
`{ records:, next_cursor:, has_more: }`; the controller renders that into the `{ data, meta }`
envelope of § Cursor pagination and does nothing else.

> **At a glance** · Applies the `status` / `company` / `source` filters, decodes the `after` cursor,
> clamps `limit` to 1–100, and fetches `limit + 1` rows to learn whether a next page exists. All
> filtering is server-side and composes with pagination.

**Why it is a query object at all**, given it wraps no exotic SQL: the filters are the growth axis.
`ApplicationsController#index` previously inlined filtering, cursor decoding, and the lookahead in
one method, and the planned market-layer filters (channel, compensation, Japanese level) all land on
this exact read path — each one thickening a controller action rather than composing into an object
built to hold them. Extracting first is what stops that.

**Ignoring bad input rather than rejecting it** is the deliberate contract, inherited from the
pre-extraction behaviour and now stated in one place. An unknown `status` (not in
`ApplicationFSM::VALID_STATES`), a malformed `after` cursor, and a non-numeric `limit` are each
dropped, and the request returns the first page rather than a `422`. These params come from
navigation — a stale bookmark, an edited URL — not from a form, and a browsable list that 422s on a
typo'd query string is worse than one that shows the unfiltered page.

The `source` filter is a host substring match (`ILIKE`), not a column: § `JobBoard` explains why
there is no `source` column, and `JobBoard::NONE` selects applications with no link at all.
`sanitize_sql_like` escapes the pattern, so a `%` in the param is a literal `%`.

#### `Applications::GhostRiskQuery`

Signature: `new(user:).call`. Answers one question: **which applications has the user probably been
ghosted on?**

> **At a glance** · It reads each `timeline_entries` row as an *exit* from a stage, derives how
> long every stage took, and flags an application still sitting in a monitored stage (`applied`,
> `phone_screen`) past the user's own p90 response time. No new column, no new table — the audit
> log already holds everything it needs.

<details>
<summary><strong>How time-in-stage is derived from the audit log (and why the obvious reading is wrong)</strong></summary>

The `ghosted` state has always existed in the FSM, but nothing ever *suggested* it — the user had to
notice the silence themselves, which is precisely the thing a person in the middle of a job search
is bad at. This query turns the audit trail the app already keeps into the suggestion. It needs no
new column and no new table: `timeline_entries` already records `from_status`, `to_status`, and
`created_at` for every move, which is enough to reconstruct how long every application sat in every
stage.

**Deriving time-in-stage.** The obvious reading — "an application entered stage `S` at the
`created_at` of its `to_status = S` row" — is wrong here, and wrong in a way that silently discards
most of the data. Creation writes no timeline entry (§ `timeline_entries`), so an application added
directly as `applied` — the common case, since people add jobs they have already applied to — has no
`to_status = 'applied'` row to anchor on.

So read each row as an **exit**, not an entry. Every timeline entry is an exit from its
`from_status`; the moment that stage was *entered* is the previous entry's `created_at`, or, when
there is no previous entry, the application's own start:

```sql
COALESCE(
  LAG(created_at) OVER (PARTITION BY application_id ORDER BY created_at),
  applications.applied_at,
  applications.created_at
)
```

That single expression covers every case. A backdated `applied_at` (the create form accepts one)
correctly dates the first stage from the real application date rather than the day the row was
typed in. A revival (`ghosted → applied`) has a preceding entry, so `LAG` wins and the reset
`applied_at` — the known sharp edge in § `Applications::TransitionService` — never gets a chance to
corrupt the interval. And a `wishlist` application whose `applied_at` is null falls through to
`created_at`.

**What counts as a response.** The sample must measure *how long the company took to reply when it
replied at all* — so exits to `ghosted`, `withdrawn`, and `archived` are excluded. Including
`ghosted` in particular would be self-defeating: every application the user marks ghosted after a
long silence would push their own threshold up, and the predictor would grow steadily more reluctant
to predict. Everything else is a response — an advance up the pipeline, or a rejection.

</details>

**The threshold.** Per stage in `RISK_STAGES = %w[applied phone_screen]` — the two stages where the
next move is the company's and silence therefore means something — take
`percentile_cont(0.9)` over the user's own completed response times. An application currently
sitting in that stage past its threshold is *likely ghosted*. p90, not the median: the claim is "you
are outside the range where replies normally arrive", and being wrong here is expensive in both
directions — a false flag invites the user to close a live application.

Cold start is the real design problem, and it is handled in three parts:

| Guard | Value | Why |
|---|---|---|
| `MIN_SAMPLE` | `5` responses in that stage | Below this a p90 is one lucky outlier. Falls back to the default. |
| `DEFAULT_P90` | `applied: 21`, `phone_screen: 14` days | Ordinary hiring-timeline heuristics, used until the user has their own history. |
| clamp | `7 … 90` days | A user whose few replies all landed same-day would otherwise get a 2-day threshold and see every application flagged. The floor is a guard against confident nonsense; the ceiling stops one 200-day outlier from disabling the feature. |

The payload names which of the two applied (`basis: "personal" | "default"`) and the sample size
behind it, and the UI says so. A number this consequential should not arrive unexplained.

<details>
<summary><strong>Why two stages, and why the defaults are what they are</strong></summary>

Ghosting is the mainstream case, not
an edge case: [53% of job seekers were ghosted by an employer in the past
year](https://www.ihire.com/resourcecenter/employer/pages/53-percent-of-job-seekers-have-been-ghosted-by-a-potential-employer)
(up from 38% in 2024), and [61% report being ghosted *after* an
interview](https://blog.theinterviewguys.com/the-2025-ghosting-index/) — which is why the flag
covers `phone_screen` and not just `applied`. The same research breaks it down by stage — 28%
after application, 16% after a phone screen, 12% after multiple interviews — a distribution the
`DEFAULT_P90` pair is sanity-checked against: silence after an application is both commoner and
tolerated longer than silence after someone has spoken to you.

</details>

### API contract

> **At a glance** · All routes are JSON, all under `/api/v1`, all authenticated and scoped
> per-user (cross-user access → `404`, never `403`). Errors share one envelope:
> `{ error, code, details? }` — clients branch on the stable `code`, never the English `error`.
> Endpoint list, error-code table, and payload shapes below.

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
POST   /api/v1/auth/sign_in                       200, JWT in Authorization header
DELETE /api/v1/auth/sign_out                      rotates jti — revokes all devices
DELETE /api/v1/auth/account                       204, erases the account and everything under it

(there is no sign-up endpoint — see § Registration is closed)

GET    /api/v1/applications                       cursor-paginated
POST   /api/v1/applications                       status must be in ENTRY_STATES
POST   /api/v1/applications/prefill               AI pre-fill (Claude Haiku 4.5); `url` or `text`
GET    /api/v1/applications/:id                   + valid_next_states, + timeline_entries
PATCH  /api/v1/applications/:id
DELETE /api/v1/applications/:id
PATCH  /api/v1/applications/:id/transition        FSM transition; + valid_next_states
GET    /api/v1/applications/:id/resume            send_data, PDF, nosniff
GET    /api/v1/applications/:id/cover_letter      send_data, PDF, nosniff
GET    /api/v1/transitions                        the FSM's effective transition table
GET    /api/v1/dashboard                          SQL aggregation + facets + ghost risk + user
GET    /api/v1/me                                 authenticated user's profile

GET    /api/v1/exports/applications               CSV of every application — text/csv
GET    /api/v1/exports/account                    full account archive — application/zip

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
| `forbidden` | `403` | Deleting the shared demo account — it is exempt from destruction (§ Registration is closed) |
| `not_found` | `404` | No such record — including another user's record |
| `stale_record` | `409` | `ActiveRecord::StaleObjectError` — optimistic-locking conflict |
| `invalid_transition` | `422` | FSM `InvalidTransitionError` |
| `validation_failed` | `422` | Model validation failure (create/update, file upload, or the `MAX_PER_USER` ceiling — detail code `too_many_applications` on field `base`); carries `details` |
| `invalid_url` | `422` | The pre-fill URL itself is the problem — malformed, a port other than 80/443, or a private/internal address. Never fetched (`InvalidUrlError`) |
| `prefill_blocked` | `422` | The site refused an automated reader — `401`/`403`, or a `cf-mitigated` header on any status. The URL is fine and retrying will not help (`BlockedError`). An upstream `429` is deliberately *not* this: it is the one refusal that lifts, so it resolves to `prefill_unreachable` and the user is told to retry |
| `rate_limited` | `429` | Rack::Attack throttle; `Retry-After` header set |
| `prefill_paste_too_long` | `422` | A pasted posting exceeds `MAX_TEXT_CHARS` (12,000) **once stripped to text** (`PasteTooLongError`). Only the paste path raises it — a fetched page over the cap is truncated in silence, because the user never saw its length. Measured server-side on purpose: the browser cannot know the stripped length without a second copy of `to_text` |
| `prefill_unreachable` | `502` | The pre-fill page could not be fetched — DNS, connect, TLS, timeout, redirect loop, or an HTTP error the site did not refuse us with (`FetchError`) |
| `prefill_failed` | `502` | The page was fetched but yielded nothing usable — no readable text (`UnreadableError`), or the Claude call failed or came back empty (`ExtractionError`) |
| `prefill_unavailable` | `503` | `ANTHROPIC_API_KEY` missing — the rest of the app keeps working |

Codes are append-only: renaming or removing one is a breaking change to `web/`'s message
catalog, adding one is not (unknown codes fall back to status-keyed copy). `/up` also returns
`503` when Postgres is down, but it is a health probe with its own body shape
(`{ status, checks }`), not part of this error contract — and for the same reason it carries no
OpenAPI path. It is infrastructure, not API; its absence from `swagger.yaml` is deliberate, not a
missing rswag spec.

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
  "active_states":   ["wishlist", "draft", "applied", "phone_screen", "technical",
                      "final_round", "offer"],
  "transitions":     { "wishlist": ["draft", "withdrawn", "archived"], "…": ["…"], "accepted": [] }
}
```

`active_states` is the seven stages where the application is **still in play** — where a pending
follow-up is actionable, and chasing it could still change the outcome. It is **not derivable
from the rest of the payload**: it is the thirteen states minus `TERMINAL_STATES` *and* minus
`rejected`, `ghosted`, `withdrawn`, which are non-terminal (each revives to `applied` — see
§ State machine) yet are not stages you are waiting on anyone in. Only `ApplicationFSM` knows
that distinction, so `ApplicationFSM::ACTIVE_STATES` owns it and this endpoint serves it.

It is **served rather than mirrored in TypeScript** because it is now a filter contract. As a
display detail — dimming an overdue-follow-up warning on a dead row — a hardcoded frontend set
was survivable. As the definition of what the stage filter's "Active" preset selects and what
the board gives columns to, it is FSM vocabulary that the user acts on, and a re-typed copy in
a second language is the one thing this codebase does not permit (§ State machine). The rule
here is the same one that governs `transitions` itself: a fetched copy cannot drift, a re-typed
copy can.

`terminal_states` is consumed the same way and for the same reason. It decides whether the status
help calls a state permanent, and whether the confirm shown before a move — on the board's card
menu and the detail page's transition buttons alike — warns that the move is irreversible. Those
are user-facing claims about the FSM, so a state promoted to terminal in Ruby would leave all
three lying. It is fetched, never re-typed.

**A missing `terminal_states` degrades to silence, not to a claim.** `apiFetch` casts rather than
parses and `web/` and `api/` are separate Railway services, so a payload predating a field can
still arrive with `ok: true` mid-deploy. An empty list therefore reads as *unknown*, and the
permanent badge and the permanent/reopenable line render as **neither** — the FSM always has three
terminal states, so empty is never a real answer. Defaulting to "reopenable" would swap one lie
for another: the point is not to withhold the scary half, it is to make silence unclaimable in
either direction.

`entry_states` is consumed by the one screen that needs it: the new-application form builds its
status picker from it, rather than hardcoding the three options `ApplicationFSM::ENTRY_STATES`
lists. This is the create path, not a display detail — `Api::V1::ApplicationsController` rejects a
create outside the entry set with a `422`, so a copy gone stale would either hide a state the API
accepts or offer one it refuses. Only the *set* is fetched; which member is pre-selected is a
form default (`draft`, matching the API's own fallback when no `status` is sent) and falls back to
the first offered state if `draft` ever leaves the set.

**A missing `entry_states` drops the picker rather than guessing one.** The reasoning is
`terminal_states`' above: an empty entry set cannot be real, so it reads as *unknown*. With no
picker the form sends no `status` and the API applies its own default — the created application
is still correct, and the user can move it afterwards through the FSM, which is the one path that
was ever authoritative. Rendering a guessed set would be the "reopenable" mistake in create's
clothing: an invented claim about the FSM that the API may answer with a `422`.

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

Filters compose with pagination server-side: `status` (comma-separated list of states),
`company` (exact), `source` (host substring, `ILIKE`). The mechanism — filters, cursor decoding,
the `limit + 1` lookahead behind `has_more`, and the rule that bad input is ignored rather than
rejected — lives in § `Applications::ListQuery`; the controller only renders what it returns.

`status` takes a **list**: `status=applied,phone_screen,offer` matches a row in *any* of them.
The list ORs within itself and still ANDs against `company` and `source`. It is intersected with
`ApplicationFSM::VALID_STATES` and unknown members are dropped, which is what keeps the change
invisible on the wire to a client that only ever sends one: `status=applied` is a one-element
list and behaves exactly as it always has.

**An empty or all-unknown list is `UNFILTERED`, the same as `nil`** — not an empty result.
`where(status: [])` matches zero rows *silently*, so the literal reading would make junk input
return a blank page, contradicting § `Applications::ListQuery`'s contract that bad input falls
back to the unfiltered first page. A list with nothing left after the intersection has therefore
told the server nothing, and is treated as nothing. This is the defence for a hand-edited URL,
not an interface: a client that wants to show no rows must not ask the server for them —
"show nothing" is a client-side state, because there is no query that means it.

#### The dashboard payload — `GET /api/v1/dashboard`

```json
{
  "by_status":         { "applied": 6, "phone_screen": 2, "rejected": 3 },
  "facets":            [["Mercari", "linkedin.com"], ["Cookpad", "(none)"]],
  "total":             11,
  "avg_days_to_offer": 24.5,
  "ghost_risk": {
    "thresholds":   { "applied": 21.0, "phone_screen": 14.0 },
    "basis":        { "applied": "personal", "phone_screen": "default" },
    "sample_sizes": { "applied": 9, "phone_screen": 2 },
    "at_risk": [
      { "id": 7, "company": "Mercari", "role": "Backend Engineer", "status": "applied",
        "lock_version": 1, "days_in_stage": 34.2, "threshold": 21.0 }
    ]
  },
  "user": { "id": 1, "email": "a@b.com", "created_at": "…", "updated_at": "…" }
}
```

`at_risk` is sorted longest-silence first and carries `lock_version`, so the UI can offer the
`ghosted` transition inline without a second fetch — the whole point of the feature is that seeing
the problem and resolving it are one click apart.

**`user` is the former `GET /api/v1/me` payload, folded in.** The dashboard is the only page that
wanted it, and it was fetching both endpoints in parallel anyway — one wasted request per load.
`/me` still exists (it is a documented endpoint and costs nothing), but `web/` no longer calls it.

**Caching.** The aggregation is the heaviest work in the app and runs on every dashboard load, so it
is memoized in Solid Cache under a self-expiring key: the user id, their application count, and
`MAX(updated_at)`. Every status change goes through `TransitionService`, which bumps
`updated_at` — so the key changes exactly when the numbers could have changed, and no manual
invalidation is needed. `expires_in: 12.hours` is a safety net, not the mechanism.

Two things the key has to carry beyond the data:

- **`STATS_CACHE_VERSION`** — bump it whenever the payload *shape* changes. A data-derived key
  cannot see a deploy: unchanged rows would keep serving the old shape to new code.
- **`Date.current`** — ghost risk is a function of *elapsed time*, and elapsed time is invisible to
  a key built from rows. Without the date, an application could cross its threshold and stay
  unflagged for up to twelve hours, because nothing about it changed — that is exactly the point.
  Including the date recomputes the payload once a day per user, which is the right granularity for
  a threshold measured in days.

`user` is merged in *outside* the cached block. It is a cheap read, and keying application stats on
a user record would be a category error.

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

The **stage chips** are a third filter type beside these two dropdowns, and the boundary between
them is load-bearing. Chips OR within themselves and AND against company and board, so the presets
above them ("All", "Active", "None") rewrite only the chip selection — clicking "All" restores every
stage and **keeps** the chosen company. Resetting all three is what "Clear filters" is for; a
control inside the stage group that also cleared a dropdown would drop a filter the user never
asked to lose. One chip renders per status that *has* rows (`by_status` is `group(:status).count`),
so the row is however many stages the user has actually used, not all thirteen — and it is sorted
against `states` from the transition table, because `GROUP BY` without `ORDER BY` returns plan
order and the chips would otherwise reshuffle between reloads.

#### Exports — two endpoints, two different jobs

Both live on `Api::V1::ExportsController`, both stream through `send_data`, and both are scoped to
`current_user`. They look like one feature and are not:

| | `GET /exports/applications` | `GET /exports/account` |
|---|---|---|
| Media type | `text/csv` | `application/zip` |
| Contains | applications, one row each | applications, timeline, resumes, cover letters, user |
| Built by | `Exports::ApplicationsCsv` | `Exports::AccountArchive` |
| It is for | reading the data somewhere else | **getting the data back** |

The CSV is a **convenience view**: a spreadsheet, one row per application, no blobs and no
timeline. It recovers a table, not an account.

The archive is the **data-safety artefact**, and the reason this exists at all: the real
job-search history lives in one Railway Postgres, and the Hobby plan has no managed backups.
Scheduled `pg_dump`s cover that from the outside (§ Deployment); this covers it from the inside,
and is the leg the user can pull without a provider, a cron runner, or a shell. It contains
`account.json` — user, every application with every column, every timeline entry — plus the PDFs
under `resumes/` and `cover-letters/`, named by `Application#download_basename` (§ Download
filenames) — the same method the per-application download endpoints use, so a file means the same
thing whichever door it left by. `account.json` carries a `schema_version` so a future importer
can tell what it is reading, and each application row names its own files, so the mapping survives
even when a segment is unhelpful — the id in the name is what makes it unique, the company and
role are only there to be readable.

**One archive-only detail:** rubyzip writes UTF-8 entry names but leaves the EFS flag
(general-purpose bit 11) unset by default, which is mojibake in strict extractors the moment a
name is Japanese. `config/initializers/zip.rb` sets `Zip.unicode_names = true` once at boot.

**The archive is built in memory** (`Zip::OutputStream.write_buffer`), which is a deliberate cap,
not an oversight: blobs are capped at 1 MB each, so the peak is bounded by `applications × 2 MB`
— and since `v1.4.4` that multiplicand has a ceiling of its own, `Application::MAX_PER_USER`
(§ Security), which puts the worst case at 400 MB. That is the honest number, not the expected
one: a real account of a few dozen applications is a few dozen megabytes. A worst-case account is
where this stops fitting in memory, and the fix then is streaming — the throttle below is what
buys the time to notice.

**The download surface** is the export half of `app/components/profile-card.tsx`, rendered on
`/dashboard`, its two links proxied to Rails by `app/api/exports/{applications,account}/route.ts`
— the same `apiProxy` the resume and cover-letter downloads use, so the JWT stays server-side
(§ Auth flow). Three rules that look like slips and are not:

- **The links render even when the card has no user to show.** The card's profile half is
  conditional on `stats.user`; its export half is not, and the gate must never be lifted to wrap
  the whole card. `/privacy` promises the user can get their data out, and this is the only
  surface in the app that honours it — gating it on a successful `/dashboard` fetch would remove
  it precisely when the data looks like it is in trouble, and remove it silently.

- They are **plain `<a>` tags**, not the `Link` from `i18n/navigation.ts`. These are API routes,
  not localized pages: a client-side navigation would fetch the route and do nothing visible. The
  ESLint rule `@next/next/no-html-link-for-pages` cannot tell the difference and is disabled on
  those two lines.
- There is **no `download` attribute**. Rails already sends `Content-Disposition: attachment` with
  the filename it chose (`karirkalyan-applications-2026-07-12.csv`), so the browser downloads
  rather than navigates, and the server stays the one place that names the file. Note this is the
  one disposition § Download filenames did **not** move to `inline`: an export is a file you are
  taking away, not a document you are reading.

`ProfileCard` **takes the user as a prop and never fetches one.** `/dashboard`'s own payload
carries `user`, which is why the page makes no second `/me` request — that fold is what `v1.3.0`
shipped, and a component that fetched its own user would quietly re-introduce the request on
every page that imported it. It is a component rather than markup inlined in the page so an
account or settings page can import it instead of copying it.

#### Download filenames

Every PDF this API hands out is named by **`Application#download_basename(kind:)`**, where `kind`
is `:resume` or `:cover_letter`:

```
{company}-{role}-{MMDD}-{id}-{kind}.pdf     株式会社メルカリ-バックエンドエンジニア-0712-12-resume.pdf
```

Two callers, one method: `Api::V1::ApplicationsController#resume` / `#cover_letter`, and
`Exports::AccountArchive#blob_path`. It lives on the model because the alternative is two
implementations that drift — which is exactly the state `v1.4.4` found it in, the controller
sending a hardcoded `resume.pdf` for every application while the archive built a different name
from `parameterize`.

**Why each part is there.** The **id** is the uniqueness guarantee: same company, same role, same
day is a real collision, and `company`/`role` are readable rather than load-bearing. The **`MMDD`
stamp is the upload date** — `resume_updated_at` / `cover_letter_updated_at`, falling back to
`created_at` for a legacy row with a blob but no stamp — and it earns its place *in the user's
downloads folder*, not in the app: the app stores exactly one resume per application
(`applications.resume` is a single `bytea`, and an upload overwrites it), so the stamp is what
stops a re-uploaded resume's download from silently overwriting the copy of the old one already
saved. It **disambiguates rather than guarantees**.

**The slugger preserves Unicode; it does not transliterate.** `parameterize` sends a Japanese
company name to the empty string, but transliteration is the wrong cure: kanji→reading needs a
morphological analyzer (日本 is *nihon* or *nippon* by context, and a wrong reading is worse than
the kanji), a kana-only romaji gem strips kanji straight back to empty, and the ASCII fold is a
constraint nothing here imposes. So the slugger **sanitizes and keeps**: Unicode letters and
digits survive, display case is preserved (「Google」 beats 「google」, and case is a no-op for
Japanese), everything else collapses to a single `-`, edges are trimmed, and each segment is
capped at **20 codepoints** — per segment, with the stamp, id and suffix outside the count, since
a single 20-char budget for the whole name does not close (`-cover-letter.pdf` alone is 17).

This needs **no gem and no encoding work in the controller**: `send_data` with a UTF-8 filename
makes Rails emit both a legacy `filename="%3F%3F…"` (`I18n.transliterate`d, ignored by every
browser since ~2011) and `filename*=UTF-8''…` (RFC 5987), which is what browsers actually read.

**A segment that sanitizes to empty is dropped, not placeheld** — `unknown`/`untitled` adds fake
meaning where the id already carries the truth. Since `company` and `role` are both `null: false`,
a segment only empties on an all-punctuation or emoji-only name, whose degenerate worst case is
`0712-12-resume.pdf`. Still unique, still honest.

### Background jobs

> **At a glance** · Solid Queue on the primary Postgres — no Redis, no separate worker service.
> Workers run inside Puma (`SOLID_QUEUE_IN_PUMA`). Three recurring tasks: the follow-up reminder
> digest (08:15 JST, skipped on Japanese dead zones), finished-job cleanup, and the hourly demo
> reset.

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

#### `FollowUpReminderJob` — one digest per user, deferred out of dead zones

The job runs every morning at 08:15 JST and does three things in order.

**1. It stops on a dead zone.** If today is not a business day in Japan (`JapanCalendar`, below),
the job returns immediately — no timeline entries, no mail. A reminder that fires on 1 January is
noise: nobody is reading it and no company is answering it.

**2. It collects what is due, including what is overdue.** The scope is `follow_up_at <= end of
today` (JST), non-terminal, and no further back than `LOOKBACK` (30 days). Not "due exactly
today" — that would make step 1 a *deletion*: a reminder falling inside Golden Week would be
skipped on its day and never looked at again. Because the scope reaches backwards, a held reminder
is simply picked up by the next business day's run, which is what "defer" means here.

The lookback is the other half of that: it bounds how far back "overdue" reaches, so a follow-up
date set eight months ago and forgotten does not resurrect itself as a nudge. Past 30 days it is
not a reminder, it is archaeology.

**3. It sends one email per user, not one per application.** Applications are grouped by user and
handed to `FollowUpMailer#digest` as a batch. Three follow-ups due on the same morning are one
email with three entries — the inbox cost of the feature scales with *days*, not with how well the
search is going, which is the point. Timeline entries are still written per application: the
timeline is the application's history, and "you were reminded" belongs on each one.

#### Idempotency — keyed on the follow-up date, not the day it fires

Solid Queue guarantees at-least-once delivery. `FollowUpReminderJob` writes a `TimelineEntry` with
`idempotency_key = "reminder-{application_id}-{follow_up_at as a JST date}"`. The check is **not**
`exists?`-then-`create!` — that race is real — it relies on the unique index and rescues
`ActiveRecord::RecordNotUnique` for true exactly-once. Same pattern as Stripe idempotency keys.

**The key is derived from `follow_up_at`, not from `Date.current`**, and that is what makes
deferral safe. A reminder held through Golden Week and delivered on 7 May still carries the key of
the date it was *set for*, so:

- the deferred send cannot double up with the run that held it, and
- an overdue application, which now sits in the scope every day until it is answered, is reminded
  **once** rather than every morning until the user gives up on us.

It also buys a property worth having on purpose: **moving `follow_up_at` re-arms the reminder.**
A new date is a new key, so rescheduling a follow-up produces a new nudge, which is exactly what a
user who moved the date meant.

(The old key was `reminder-{id}-{Date.current}`. Under the old "due exactly today" scope those two
are the same string for every entry ever written, so the change is backward-compatible: no
historical reminder re-fires.)

The `TimelineEntry` is written first, as the exactly-once anchor; the email is then decoupled via
`deliver_later` onto the `mailers` queue, so a transient SMTP failure retries the email without
duplicating the entry. Only applications whose entry this run actually *won* go into the digest.

#### `JapanCalendar` — `app/lib/japan_calendar.rb`

The dead zones, and the single place that knows what a business day in Japan is:

| Dead zone | Dates |
|---|---|
| Weekends | Saturday, Sunday |
| National holidays | via the `holidays` gem, region `:jp`, `:observed` |
| New Year (年末年始) | 29 December – 3 January |
| Golden Week | 29 April – 5 May |
| Obon (お盆) | 13 – 16 August |

`holidays` is a dependency rather than a hardcoded list because two of Japan's holidays are
**astronomical** — 春分の日 and 秋分の日 move with the equinoxes and are fixed by cabinet
proclamation each February — and because 振替休日 (a holiday falling on a Sunday displaces the
following Monday) is a rule, not a date. Both are exactly the kind of thing a hand-maintained
array gets quietly wrong in a year nobody is looking. The `:observed` region is what turns
substitute holidays on.

The last three rows are *not* public holidays and the gem does not know them. Golden Week's span
is a run of real holidays with working days wedged between; Obon has no legal status at all. They
are in the table anyway because the question this job asks is not "is the post office open" but
**"will a company answer a nudge sent today"** — and in mid-August, it will not.

**Annual refresh cost: one `bundle update holidays`.** That is the whole maintenance surface, and
it is why the gem earns its place under the perishable-facts rule in `TODO.md`.

#### Time zone

`config.time_zone = "Tokyo"`. `active_record.default_timezone` is deliberately **not** set, so
timestamps are still stored in UTC — only presentation and `Time.zone`-based queries (such as the
reminder job's "today", and the JST date inside its idempotency key) are JST. Comparing
`DATE(follow_up_at)` in UTC gave JST users reminders a day early; the job uses zone-aware day
boundaries throughout.

### Mail

> **At a glance** · Two mailers — `WelcomeMailer` (on account creation) and `FollowUpMailer#digest`
> (one per user per business day). Production sends via Resend over STARTTLS port `2587`, because
> Railway blocks 587/465.

`ActionMailer` is re-enabled in `config/application.rb` (the `--api` default disables it).
Production sends via SMTP (Resend); development previews only; test collects in
`ActionMailer::Base.deliveries`.

- `WelcomeMailer` — sent when an account is created, via `deliver_later`. Its only caller is the
  `users:create` Rake task (§ Registration is closed); it used to be the sign-up endpoint.
  `deliver_later` rather than `deliver_now` because with `raise_delivery_errors = true` a mail
  failure would take the account creation down with it.
- `FollowUpMailer#digest(user, applications)` — from `FollowUpReminderJob`, one per user per
  business day. The subject names the company when there is exactly one application
  (*"Follow up on your Mercari application"* — the single case is the common case and deserves to
  read like a sentence) and counts them when there are several (*"3 follow-ups due today"*).

**Railway blocks outbound SMTP on ports 587 and 465**, so production uses Resend's alternate
STARTTLS port `2587`. The `From:` domain must be verified in Resend first.

### Security

> **At a glance** · JWT auth with one JTI per user (sign-out revokes all devices). Rack::Attack
> throttles keyed per-IP *and* per-account/email through Solid Cache, plus a hard 200-application
> ceiling per account, which is the only thing that bounds storage. Optimistic locking on writes,
> magic-byte-checked uploads, `nosniff` downloads, credentials filtered from logs.

- **Auth** — Devise + devise-jwt. The JWT is issued in the `Authorization` response header. **One
  JTI per user**, via `JTIMatcher`: sign-out rotates it and therefore revokes *all* devices.
  1-day expiry, no refresh flow. This is intended, not a bug.
- **Rack::Attack** — throttle counters go through `Rails.cache` (Solid Cache), so they are shared
  across Puma workers rather than counted per worker.
  - **Every path guard keys off `Rack::Attack.normalized_path`, never `req.path`.** This is the
    one rule in this section that is load-bearing rather than descriptive. Rack::Attack runs
    *above* the router, so `req.path` is the raw `PATH_INFO` — the string the client typed. Rails
    normalises it afterwards, and routes far more strings to a controller than a naive `==` will
    match: `resources :applications` generates `(.:format)`, and Journey tolerates trailing and
    duplicate slashes. `POST /api/v1/auth/sign_in.json`, `.../sign_in/`, and
    `/api/v1/applications//12` all reach their action. A guard written as
    `req.path == "/api/v1/auth/sign_in"` returns `nil` for all three, and a `nil` key means *no
    counter and no limit* — so the guard fails **open**, and the throttle becomes opt-out by
    suffix. `normalized_path` collapses duplicate slashes, strips a format extension and a
    trailing slash, and memoises on the Rack env like `account_id`. **The general rule, which
    outlives this file: anything above the router sees the string the client sent; anything below
    sees the string the framework decided it meant. Never key a security control off the former.**
  - `sign_in`: per-IP, plus **email-keyed** throttles (`10/5min`, `50/hour`) capping guesses
    against a single account across all IPs. IP-only throttling is defeated by a botnet or a
    shared NAT egress.
    `sign_in` is now the **only** unauthenticated write there is to throttle — the sign-up
    endpoint it used to sit beside is gone (§ Registration is closed), and with it the
    spam-account and outbound-mail vector that its 3/hour cap existed to close.
  - `prefill`: per-IP, plus **per-account** caps (10/min, 50/hour, 100/day) keyed on the JWT
    `sub`. The endpoint costs money (a Claude call plus an outbound fetch), so an uncapped
    per-account path is a cost and abuse vector — most sharply through the shared demo login.
  - `exports`: **per-account** caps (10/min, 60/hour) keyed on the JWT `sub`, same decoder as
    prefill. Not a money vector — a *work* vector: `/exports/account` reads every blob the user
    owns and assembles the zip in memory, so a signed-in client looping it is the cheapest way to
    push this app over its memory ceiling. The cap is per-account rather than per-IP because the
    cost is a function of whose data is being assembled, not of where the request came from.
  - `applications/write`: **per-account** caps (30/min, 300/hour) on `POST /applications` and
    `PATCH|PUT /applications/:id` — the two requests that carry a blob. Per-account for the same
    reason as exports. The throttle covers every write to those paths rather than only the ones
    with a file attached, because deciding *inside Rack middleware* whether a multipart body
    contains a PDF means parsing the body Rails has not parsed yet, to save a counter increment
    on a request that is cheap either way. `DELETE` is deliberately not throttled: it is the one
    write that gives storage back. `POST /applications/prefill` and `.../transition` do not match
    these patterns — prefill has its own caps above, and the path regex is anchored on `/\d+\z`.
- **The application ceiling** — `Application::MAX_PER_USER` (200), validated on create, is what
  actually bounds storage. **A throttle cannot do this job**: it bounds a rate over a window and
  every window resets, so any positive rate integrates to unbounded total. The exposure is real
  because an upload *overwrites* — `applications.resume` is a single `bytea` with no version
  history and a 1 MB cap — so a client looping `PATCH` holds its storage footprint flat at 2 MB
  per application, while `POST` buys another 2 MB of allowance each time, on a database whose
  whole backup story is a nightly `pg_dump` (§ Backups). 200 × 2 MB bounds the worst case at
  ~400 MB. It sits well above a real job search (100–300 applications is a long one) and the
  breach is recoverable by deleting a row, which is why the number is allowed to be this close to
  real use.
  - It reports through the **existing** envelope, not a new code: the validation adds to `:base`,
    so `create` renders `validation_failed` with `details: [{ field: "base", code:
    "too_many_applications" }]` — the same shape the 1 MB upload cap uses for `too_long`.
  - The **shared demo** is the account most likely to reach it, and it heals itself: `DemoReset`
    destroys the demo *user* before re-running the seed (§ `Demo::ResetService`), so the ceiling
    cannot deadlock the reset that clears it — worst case the demo is full until the top of the
    hour.
  - **It is a bound, not an invariant.** The check is a `count` in the same transaction as the
    insert with no lock, so N concurrent creates at 199 can all pass and overshoot by N-1. That
    is accepted: the cap exists to stop unbounded growth, not to make 200 exact, and a real
    guarantee costs a counter column and an advisory lock to defend a number chosen by judgement.
- **Optimistic locking** — a `lock_version` column activates Rails' built-in optimistic locking.
  Two concurrent writers: the second gets `StaleObjectError` → `409`. One column, one
  `rescue_from`, no library.
- **Uploads** — size is checked from multipart metadata *before* `.read`, so an oversized file
  never enters memory. Then the 1 MB model cap, then PDF magic-byte validation (`%PDF`), which
  cannot be spoofed by renaming a file. The frontend's `accept=".pdf"` is UX only.
- **Downloads** — `current_user`-scoped, `X-Content-Type-Options: nosniff`. PDF for the per-
  application files; the two export endpoints add `text/csv` and `application/zip`, and carry the
  same `nosniff` header for the same reason (a CSV that a browser decides to sniff as HTML is a
  stored-XSS delivery mechanism, and its cells contain user-supplied company names).
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

### Frontend tech stack

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

### Design system

> **At a glance** · `web/app/globals.css` is the single entry point where `design/assets/tokens.css`
> reaches the app, via Tailwind v4's `@theme inline`. Ten colours, three typefaces (Fraunces /
> Manrope / IBM Plex Mono), **radius 0** — sharp corners are the editorial voice. No UI kit, no form
> library, no state library.

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

### Auth flow

> **At a glance** · The JWT never reaches client JS. A Next route handler proxies sign-in to Rails,
> lifts the token from the `Authorization` header, and stores it in an `httpOnly` `session` cookie;
> server-side `apiFetch` re-attaches it as a Bearer. Origin checks guard the auth handlers — Next's
> built-in CSRF defence covers Server Actions, not route handlers.

1. The sign-in form POSTs plain credentials to a Next route handler
   (`app/api/auth/session/route.ts`). It is the only such handler — registration is closed, so
   there is no second credential-accepting entry point.
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
can drive a login (classic login-CSRF). `web/app/lib/csrf.ts` enforces same-origin by default, with
`ALLOWED_ORIGIN` to pin; cross-origin → `403`. It guards the session `POST` and the session
`DELETE`.

**Expired sessions** bounce through `/api/auth/expired`, which clears the cookie and redirects to
`/sign-in?expired=1` with a notice. A `401` must never dead-end on an error box.

A `401` from upstream is the *only* thing that may surface as a `401`. Collapsing every non-OK
upstream status into `401` once turned a total API outage into "Invalid email or password" for
every user — see CHANGELOG v1.0.1.

### Public pages

> **At a glance** · `/` argues one claim — a job tracker built on a finite state machine — with a
> pipeline diagram that is an *illustration*, never a second copy of the transition table. `/about`
> states four build decisions as the cheaper alternative each one rejected; `/docs` frames the API
> and links out to Swagger.

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
illustration, not a second copy of the transition table.** The real table lives only in
`api/app/lib/application_fsm.rb` — deliberately not restated here, not even as an edge count, because
a hand-copied number is the same failure as a hand-copied table and this paragraph once carried a
wrong one; the diagram names that file in its caption, nothing in the app
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

### Legal pages

> **At a glance** · `/privacy` and `/terms`, both locales, reachable while signed in (`OPEN_PATHS`).
> They exist because the app holds resumes, and are written to be *true about the system as built*:
> five named sub-processors (Railway, GitHub, Anthropic, Resend, Honeybadger), two functional
> cookies, no self-service delete. Never a promise the code does not keep.

Two prose pages in both locales, linked from the site footer, `OPEN_PATHS` so a signed-in user can
still read them. They exist because the app holds resumes, and a service that holds resumes without
saying what it does with them is not defensible whether or not anyone made it fill in a form.

There is no legal entity behind this app and the pages say so: the operator is a natural person
(§ Registration is closed explains why that is not an exemption). They are written to be **true
about the system as built**, not to imitate a company's boilerplate, and every claim in them is
checkable against this file:

- what is collected — an email address, application records, and one resume plus one cover letter
  per application; **plus, incidentally, IP addresses**, which are not a feature but are
  unavoidable: Rack::Attack keys its throttle counters on them (Solid Cache, so they land in
  Postgres rows), and Honeybadger attaches them to an error report's `cgi_data`. The **request log
  does not** carry them: lograge replaces Rails' default request line (the one with `for <ip>`) and
  its `custom_options` emit `time`, `request_id` and `params` — nothing else. Do not restore the
  IP to that lambda without changing the legal pages in the same commit;
- where it lives — `bytea` in a single Railway-managed Postgres, with a daily `pg_dump` run by the
  private `karirkalyan-backups` repository, whose artifacts expire after 60 days;
- who else touches it — **five** parties, and the pages name all five, because a sub-processor you
  decline to name is the one the policy exists to disclose:
  - **Railway** — hosting and the database, so everything;
  - **GitHub** — the nightly `pg_dump` runs on a GitHub-hosted runner and is stored as a GitHub
    Actions artifact, which means **GitHub holds a copy of every resume**. It is easy to forget
    because the backup repository is private and the workflow is boring, and it is precisely the
    kind of omission that makes a policy false;
  - **Anthropic** — the **text of the page** pasted into AI pre-fill, and nothing else. The server
    fetches the URL itself and sends Claude the stripped text (≤12k chars); the URL string never
    leaves the box, and neither does a resume, a cover letter, or anything else from the account.
    An earlier version of this list said "only the URL, never a document", which named the one
    thing that is *not* sent and denied the one that is;
  - **Resend** — outbound mail, so email addresses;
  - **Honeybadger** — error reports, which carry the request context above, and **only** error
    reports: `insights: enabled: false` in `honeybadger.yml`. With Insights on, honeybadger's Rails
    plugin ships an event per request, per SQL query and per mailer send — a stream of telemetry
    from healthy traffic, not just from failures. It is off so that the sentence on `/privacy`
    ("Honeybadger receives error reports") is true as written. Turning it on is a change to what a
    sub-processor sees, and the legal pages move in the same PR.
- one outbound request that is *not* a sub-processor — AI pre-fill makes the **server** fetch the
  job posting, so the site hosting it (LinkedIn, a company careers page) sees a request from
  Railway's IP, not from the user's browser. No personal data goes with it, so it does not join the
  list of five; the pages say it anyway, because it is the only case of the app talking to a host
  the *user* chose, and because the answer is a good one — the job board never learns who looked;
- what is *not* there — no analytics, no tracking pixels, no advertising, no third-party JavaScript.
  Two cookies, both functional: the `session` cookie that holds the JWT, and next-intl's
  `NEXT_LOCALE`, which remembers the chosen language. Neither is a tracker, and the pages say
  "two functional cookies", not "no cookies" — see below;
- how to get it out, and how to get it erased — the two export endpoints (§ API contract) and an
  email to the operator, who runs `DELETE /api/v1/auth/account`.

**Do not write a promise the code does not keep.** The page must not offer a self-service delete
button (there isn't one — that is the deliberate trade in § Registration is closed), must not claim
encryption at rest beyond what Railway actually provides, must not name a retention period the
backup script does not enforce, must not say "nothing is shared with anyone else" while a nightly
job ships the whole database to GitHub, and must not promise erasure is immediate when it is a human
reading mail. The failure mode of a privacy policy is not being too short; it is saying something
untrue.

`/terms` is correspondingly small: the service is a portfolio demo, provided as-is with no warranty
and no uptime commitment, the demo account is shared and world-writable so nothing private belongs
in it, and the operator may reset or delete it at any time.

### Route guard

> **At a glance** · `web/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`; a `middleware.ts`
> is silently ignored). Auth is the presence of the `session` cookie, across three path classes:
> `OPEN_PATHS` always render, `PUBLIC_PATHS` bounce to `/dashboard` when signed in, everything else
> bounces to `/sign-in` when not. It also resolves the locale and sets the per-request CSP nonce.

Next.js 16 renamed `middleware.ts` → `proxy.ts`; a `middleware.ts` file is **ignored**. Export a
function named `proxy`.

Authorization is presence of the `session` cookie — there are no roles. Paths fall into three
categories, checked in this order:

| Category | Paths | Without a cookie | With a cookie |
| --- | --- | --- | --- |
| `OPEN_PATHS` | `/about`, `/docs`, `/privacy`, `/terms` | renders | renders |
| `PUBLIC_PATHS` | `/`, `/sign-in` | renders | `307` → `/dashboard` |
| everything else | `/dashboard`, `/applications/*`, … | `307` → `/sign-in` | renders |

`OPEN_PATHS` is checked first and skips both redirects. `/about` and `/docs` explain how the system
is built rather than selling it, so bouncing a signed-in reader to the dashboard would hide them
from the people most likely to read them — which is why they are not more `PUBLIC_PATHS` entries.
`/privacy` and `/terms` are there for a sharper reason: the people they most concern are the ones
already signed in and holding data in the system, and a privacy policy a user cannot reach while
logged in is not a privacy policy. The signed-in app shell's "For reviewers" footer links to
`/about` and `/docs`, and the site footer links to the two legal pages; those links only resolve
because of this. Matching is by segment: `/about` also covers `/about/anything`, but never
`/aboutish`.

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

### Board view

> **At a glance** · `/board` (labelled "Kanban") — one column per active status, cards moved by drag
> or menu, each move a real FSM transition. It *fetches* the legal-move table from
> `GET /api/v1/transitions` rather than mirroring it. Bounded fetch-all, native HTML5 drag,
> optimistic moves that revert on `409`.

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

The seven columns are exactly the fetched `active_states` (§ API contract), laid out as a wrapping
grid rather than a horizontal scroller — four per row on large screens, two per row on small screens,
one on the narrowest — keeping every column on screen without sideways scrolling. Display order is
board-local and grouped by engagement, not funnel order: the four-column row break puts the
interview loop (applied, phone_screen, technical, final_round) on the first row and everything
outside it (wishlist, draft, offer) on the second. Membership still derives from
`active_states`, so the board-local order list can never hide a column. The six closed
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
convenience layered on top. The confirm/revival semantics (`CONFIRM_REQUIRED`, `REVIVAL_STATES`)
move out of `transition-buttons.tsx` into a shared module (`web/app/lib/transitions.ts`) so the
detail page and the board cannot drift. Those two sets are UI judgement — which moves are worth a
prompt — and stay there. Which states are *irreversible* is an FSM fact, not a judgement, so it
comes from the fetched table's `terminal_states` (§ API contract) rather than a third set beside
them.

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

### i18n

> **At a glance** · `next-intl`, `en` (default, unprefixed) and `ja` (prefixed;
> `localePrefix: "as-needed"`). Copy lives in ICU catalogs at `web/messages/{en,ja}.json`. Rails
> stays English-only; `web/` localizes failures on the machine-readable error `code`. All
> navigation goes through `i18n/navigation.ts`, never the `next/*` originals. `en`/`ja` key
> parity is enforced by a CI script, not by review.

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
English.

Two deliberate exceptions, both importing from `next/navigation` on purpose:

- `notFound()` — it carries no path, so there is no locale to preserve.
- `redirect` in `app/lib/api.ts`, which sends an expired session to `/api/auth/expired` — a route
  handler outside the `[locale]` tree. It must **not** be locale-prefixed: the wrapped `redirect`
  would rewrite it to `/ja/api/auth/expired`, which does not exist. Someone applying the rule
  mechanically will "fix" this import and silently break session expiry.

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
`/privacy`, `/terms`, `/sign-in`. Everything behind the session cookie is a `307` and has no
business being advertised.

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

   `errors.field.base_too_many_applications` is the one whose *field* is `base` rather than a
   real column — the `MAX_PER_USER` ceiling (§ Security), where no field is wrong and the
   account is simply full. It reads as a lookup like any other because `base` is what Rails
   calls a record-level error, and the resolution above never assumed the field was a form
   input. **Its copy does not name the number**, deliberately: the ceiling is a constant in
   Ruby, and a catalog that repeated it would be a second copy free to drift the day it moves.
   The API's English sentence names it; the localized copy says the account is full and to
   delete something.
2. **The code.** `errors.code.<code>` — `invalid_credentials`, `stale_record`,
   `invalid_transition`, `invalid_url`, `prefill_failed`, and the rest of the § Error codes
   taxonomy each have an entry.
3. **The status.** The v1.1.0 map survives as the fallback: `401`, `403`, `404`, `409`,
   `422`, `429`, `502`, `503` under the `errors` namespace. It catches non-JSON failures,
   codes added to the API before the catalog learns them, and route-handler-synthesized
   errors that carry no code.
4. `errors.unknown`.

**The `code` also decides what recovery is offered, not just which sentence is shown.** Two
failures can both be "the pre-fill didn't work" and still want different things from the user, so
`web/` branches on the code rather than the prose: `prefill_blocked` and `prefill_failed` open the
paste box (§ `UrlPrefillService`), `prefill_unreachable` leaves the Pre-fill button to be pressed
again, `invalid_url` offers neither. This is why the failure arms of the action types carry
`code`/`status` at all — `ActionFailure` has always returned them, and a result type that narrowed
them away would throw the signal out at the door, which is what `PrefillResult` did until
`v1.6.0`. **Never branch on the `error` sentence**: it is prose, it is translated, and the codes
exist precisely so nobody has to parse it. The same rule already governs the `409` / `stale_record`
optimistic-lock recovery.

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
  response body itself and runs the same resolution. The session route handler passes the
  upstream `code`/`details` through, substituting its own copy for security-sensitive statuses
  but keeping the code. Per-call status overrides remain as the fallback layer — a `401` there
  means bad credentials, not a dead session. (It used to be two handlers; the register one went
  with § Registration is closed.)

Catalog presence is tested with next-intl's `t.has()`, so steps 1–2 need no hardcoded list of
known codes in TypeScript — the catalogs themselves are the list. That is also why a key present
in `en` and missing in `ja` fails quietly rather than loudly: `t.has()` turns the gap into a
fallback, so a `ja` reader silently gets the status-keyed copy of step 3 instead of the sentence
written for them. Nothing about the page looks broken. § Catalog parity is checked in CI is what
catches it.

Localizing *in Rails* was rejected for the original reason: it would mean an i18n dependency,
locale negotiation on every request, and a second message catalog to keep in sync, for strings
only the frontend ever displays.

#### Catalog parity is checked in CI

`web/scripts/check-i18n-parity.mjs` diffs the two catalogs and exits non-zero on any asymmetry.
It runs as `npm run lint:i18n`, wired into the `verify` job of `web-ci` ahead of the build, so a
key landing in one catalog and not the other fails the `Lint, typecheck & build` check that
`conserve-main` requires. Before `v1.4.4` this rule was held by review alone, and a `ja` key
could go missing through lint, typecheck and build without a word (above).

**What it counts is every path, with array elements counted individually and containers counted
as well as descended into.** A path is the dotted route to a node, with array indices as `[n]`
segments — so `transitions.reasons.ghosted` contributes four paths, not one: the array itself,
plus `[0..2]`, one per FSM reason chip. Two rules follow, and the script reports each
separately:

- **A path in one catalog and not the other is drift.** This one rule does most of the work,
  because walking the whole tree collapses the other shapes of drift into it. An array of a
  different **length** is caught for free — a `ghosted` with two chips in `ja` has no `[2]`, so
  `[2]` reports missing. That is the whole reason elements are counted rather than the array
  being treated as one opaque leaf: a reason chip that exists in English and not in Japanese is
  exactly the bug this check is for, and dict-only counting cannot see it — that blindness is
  what made an earlier docs audit report a *false* drift here.
- **A path whose type differs is drift too** — most usefully a `string` in one catalog against
  an `object` in the other, meaning the two disagree about the shape of the copy and `t()` finds
  out at runtime instead of here. This rule only works because the walker records containers
  rather than only leaves: on a leaves-only walk a key that became an object would never appear
  as a path at all — only its children would — so the comparison would find `undefined` on one
  side and short-circuit, and the check would be dead code with a comment vouching for coverage
  it did not have. That is exactly what it was when first written in this release, and a review
  caught it. Recording containers also makes an empty `{}` visible, which a leaves-only walk
  drops silently. The rule additionally covers a `5` against a `"5"`; nothing in the catalogs is
  a non-string scalar today, so that half is a guard rather than a working part.

The convention matters more than which convention it is: whatever the script counts, it must
count the same thing on both sides. It walks both catalogs with one function for precisely that
reason.

It is a script rather than a test because `web/` has no unit-test runner — Playwright E2E is the
only suite, and booting a browser to compare two JSON files would be absurd. It has no
dependencies and reads nothing but the two catalogs, so it costs the CI job well under a second.

**It checks symmetry, not completeness, and the difference is not academic.** A key the API needs
and *neither* catalog has is perfectly symmetric, so the check passes — which is exactly what
happened to `errors.field.base_too_many_applications` in this release: the ceiling shipped with
SPEC, TODO and CHANGELOG all naming the detail code, and both catalogs missing it, so the one user
who hit the ceiling would have been told to check the form. The parity check ran green over that
the whole time and was right to. The gap it closes is a key in one catalog and not the other; the
gap it cannot close is a code the API emits that the catalogs have never heard of, which is
step 1's `t.has()` filter degrading exactly as designed. Adding an error code is not done when the
API renders it — it is done when both catalogs can say it.

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

### Installable app

`web/public/manifest.webmanifest` is a static file, served outside the locale tree and excluded
from the proxy matcher (§ Routing internals). It declares `display: standalone`, so the app is
installable today; what it is *not* yet is an app once installed — that is the rest of `v1.6.0`.

**`id` is `/`, and is the one field here that can never be corrected.** An absent `id` defaults to
`start_url`, which means changing `start_url` silently re-identifies the app: the browser sees a
different app, and an already-installed one is orphaned rather than updated. `/` is what the id
defaulted to while `start_url` was `/`, so pinning it preserves the identity this app has always
had. It is written down before the first WebAPK exists, because that is the last moment the choice
is free.

**`start_url` is `/dashboard`, not `/`.** `/` is a `PUBLIC_PATH`, so launching the installed app
bounced a signed-in user off the marketing page — the launch spent a redirect to reach the app.
`/dashboard` costs an English user none. A Japanese user spends exactly one, because `/dashboard`
is the *English* canonical under `localePrefix: "as-needed"` and next-intl resolves the unprefixed
path from the `NEXT_LOCALE` cookie and redirects to `/ja/dashboard`. That is still an improvement:
from `/` the same user paid two, the proxy's and next-intl's. A locale-pinned `start_url` is not
the fix — it would freeze the installed app to whichever language was current on install day.

`scope` is `/` explicitly. It would default to `start_url`'s parent directory, which is already
`/`, so this changes nothing today — it is written so that a later `start_url` cannot narrow the
scope as a side effect and drop `/applications` out of the installed app.

#### Icon purposes are split, because one icon cannot serve both

`any` and `maskable` are contradictory requirements, and `purpose: "any maskable"` on a single
icon satisfies whichever one it was drawn for:

- **`any`** is drawn as-is. `icon-primary-{192,512}.png` is a rounded-square plate with
  **transparent corners** (111px radius at 512, 4.45% of the canvas), which is exactly right here.
- **`maskable`** is full-bleed by contract: the launcher supplies the shape and crops to it, so
  transparency is not a rounded corner, it is a hole. Under a circular mask the old icon's corners
  were cropped anyway and nothing showed; under a squircle or rounded-square mask — Android's
  default varies by launcher, and Nothing OS uses its own — the mask reaches past the baked radius
  and the wallpaper shows through the corners.

So `icon-maskable-512.png` is the same artwork flattened onto the plate colour (`#1A2F6B`, which
is also `theme_color`): full bleed, zero transparent pixels, ink untouched.

**The safe zone was measured, not assumed.** A maskable icon's guaranteed-visible area is a circle
of 80% diameter — radius 204.8px at 512. The wordmark's bounding box is x 126–391, y 133–340, and
its furthest corner is **182.6px** from centre, so it clears the safe zone with ~22px to spare and
no launcher mask can clip it. That margin is real but not generous: the logo nearly fills the safe
circle, which reads as a large icon rather than a clipped one. Shrinking it is a brand decision,
not a correctness one, and is deliberately not made here.

---

## Testing strategy

Two-tier, mirroring Awano's Vitest + Playwright split.

| Layer | Tool | DB? | What it tests |
|---|---|---|---|
| Unit | RSpec, no DB | No | FSM logic, service logic in isolation |
| Request | RSpec request specs | Yes, real Postgres | Full HTTP stack — routing, auth, response shape |
| E2E | Playwright | Yes | sign in → create → transition → timeline |

Unit specs for `ApplicationFSM` have zero database setup — pure Ruby: given these inputs, does
`assert_transition!` raise? Fast, no factories. This mirrors Awano's `vi.mock`-based Vitest tests.

Request specs hit a real PostgreSQL database via `database_cleaner-active_record`. They carry
`rswag` metadata, so `rake rswag:specs:swaggerize` generates the OpenAPI spec from the same file.
Every request spec is wrapped in `prosopite` for N+1 detection.

**Do not mock the database in request specs.** Mocked tests pass while real migrations are broken.
A real DB catches migration errors, constraint violations, and N+1 queries that mocks silently
ignore.

The E2E suite used to open each run by registering a throwaway `e2e-${Date.now()}@example.com`,
which is exactly the affordance § Registration is closed removed. It now signs in as **`e2e`**, an
account `db/seeds.rb` creates alongside `demo` and leaves empty. Two accounts because they are
load-bearing in opposite directions: `demo` must stay full (it is the portfolio walkthrough), and
`e2e` must start empty (a spec that asserts on the first row of the list cannot share a fixture
with 12 pre-loaded ones). Seeding is idempotent, so the CI job runs `db:seed` after `db:migrate`;
locally the accounts survive across runs, and the specs assert on the row they just created rather
than on the list being empty.

Two things about that account are easy to get wrong:

- **It must never exist in production.** `db/seeds.rb` is not a dev fixture — `Demo::ResetService`
  calls `load_seed` and `DemoResetJob` runs hourly in production (§ Background jobs), so anything
  unguarded there is live on prod within the hour. The `e2e` block is wrapped in
  `unless Rails.env.production?`. An unguarded one would be a second real account with a password
  nobody chose — the exact door § Registration is closed shuts. Its address is `@karirkalyan.test`,
  a reserved TLD that cannot receive mail, and both halves come from `E2E_EMAIL` / `E2E_PASSWORD`
  with defaults duplicated in `web/e2e/credentials.ts`. Change one side, change the other.
- **Only the `setup` project may sign in.** Playwright drives the *development* server, and
  Rack::Attack is enabled everywhere but test (§ Security): sign-in is throttled at 5/min per IP.
  `e2e/auth.setup.ts` signs in once, saves the session, and every spec inherits it through
  `storageState` — so the throttle counter sees one attempt per run no matter how many specs there
  are, which is what keeps a growing suite from throttling itself.

Coverage: SimpleCov, branch coverage on, 80% floor.

---

## Deployment (Railway)

**Two app services and one managed datastore.** No Redis. No worker service.

| Service | Root | Start command |
|---|---|---|
| `api` | `api/` | Dockerfile `CMD` — `rails server` (Puma, with the Solid Queue plugin) |
| `web` | `web/` | `npm run start` |
| PostgreSQL 18 | managed (`ghcr.io/railwayapp-templates/postgres-ssl:18`) | — |

Environment variables: `DATABASE_URL`, `DEVISE_JWT_SECRET_KEY`, `SECRET_KEY_BASE`, `FRONTEND_URL`,
`SOLID_QUEUE_IN_PUMA` (**required** — without it no job ever runs), `HONEYBADGER_API_KEY`,
`ANTHROPIC_API_KEY`, `SMTP_HOST`, `SMTP_PORT` (`2587`), `SMTP_USER`, `SMTP_PASS`, `MAILER_FROM`.

`SECRET_KEY_BASE` is a random secret for signing cookies (`bin/rails secret`). Chosen over
`RAILS_MASTER_KEY` because this app stores no secrets in `credentials.yml.enc`; sharing the dev
master key with production is unnecessary. Without one of these, the app aborts with
`Missing secret_key_base for 'production' environment`.

**Builder:** Railpack or a Dockerfile. Never Nixpacks — it is deprecated.

### Backups

The **Railway Hobby plan has no managed backups**, so the data is defended from outside this
repository: the private [`karirkalyan-backups`](https://github.com/chairulakmal/karirkalyan-backups)
repo runs a daily `pg_dump` on a GitHub-hosted runner at 05:15 JST and keeps the gzipped result as
a GitHub Actions artifact on **60-day retention** — set explicitly in the workflow, because the
platform default is 90 days and four sentences on `/privacy`, including the erasure promise, name
the number 60. It is written here so a future reader can check the claim without cross-repo access;
if that retention ever changes, the legal pages (both locales) change with it.

Two properties worth knowing, both load-bearing for the privacy page:

- **The dump is the full database**, which means **GitHub holds a copy of every resume**. That is
  why GitHub is one of the five named sub-processors in § Legal pages — the backup repo is private
  and the workflow is boring, which is exactly what makes it the disclosure a policy forgets.
- **It only dumps when the data changed.** The job fingerprints `users` / `applications` /
  `timeline_entries` (`count @ max(updated_at)`) and skips when the fingerprint matches the one the
  previous run committed, so `solid_queue` / `solid_cache` churn never triggers a dump. The
  fingerprint commit doubles as the keep-alive against GitHub's 60-day cron auto-disable.

A restore drill passed 2026-07-11: `db-dump-7` restored into a scratch Postgres 18.4 with zero
errors, all 17 tables and every row intact. The drill steps live in the backups repo's README. The
dump is deliberately **not** a live mirror on a free Postgres tier — a second live database is HA
machinery for an app whose actual need is an undo button, and free tiers expire, pause idle
databases, and add a version-compatibility surface to maintain.

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

**Prerequisites:** Docker, Ruby 3.4.9 (via mise), Node 24

Node is pinned to 24 in **one** place — `web/.nvmrc` — and everything else reads it:
`actions/setup-node` via `node-version-file`, and Railpack when it builds the production
image. `web/package.json` restates it as `engines.node` because Railpack consults that first.
Keep them in step; a CI runtime that differs from production's is how the `npm ci` lockfile
divergence bit twice — in v1.1.0, and again in the dependency refresh after v1.3.0.

Local Postgres tracks production's major version — both are **18**. A dev database a major
version behind production is a bug waiting to be found in production, and the two drifted
apart for exactly that reason once already: Railway was moved to `postgres-ssl:18` while
`docker-compose.yml`, CI, and this file all still said 16.

The `postgres:18` image moved its data directory: `PGDATA` is now
`/var/lib/postgresql/18/docker` and the declared volume is `/var/lib/postgresql`, not
`/var/lib/postgresql/data`. `docker-compose.yml` mounts the new path — mounting the old one
against an 18 image leaves Postgres writing outside the named volume, and the database
silently empties on every `docker compose down`. Upgrading a machine that still has a 16
volume needs `docker compose down -v` and a fresh `db:setup` (dev data is disposable; the
volume cannot be read by an 18 server).

```bash
cd api && docker compose up -d    # postgres 18 only — no Redis

cd api && bundle install && bin/rails db:create db:migrate db:seed && bin/rails server  # :3001
cd web && npm install && npm run dev                                                    # :3000
```

`db:seed` is **not optional** any more. Registration is closed (§ Registration is closed), so a
freshly migrated database has no account and the app has no sign-up form to make one with: seeding
is how you get a login. It creates the demo account, its 12 sample applications, and — outside
production — the `e2e` account the Playwright suite signs in as. It is idempotent, so re-running it
is safe and CI runs it after `db:migrate`. The operator's alternative is `bin/rails users:create`.

Jobs run inline via the `:async` adapter in development — there is no worker process to start.

---

## Versioning & releases

Semantic versioning, with **major redefined against the compatibility surfaces this project
actually has**. The textbook rule — *major means you broke the API your consumers depend on* —
does not fit: `web/` is the only client of `/api/v1` and it ships in the same commit, so there is
no consumer to break and the major digit could never legitimately fire. A version scheme whose
top digit is unreachable is not a scheme.

The surface that does exist, and that a solo operator feels at 2 a.m., is **rollback**. So:

| Level | Rule | Examples |
| --- | --- | --- |
| **major** | The previous image **cannot** be redeployed against the new database. Rolling back needs a plan. | An irreversible or destructive migration; `/api/v1` → `/api/v2`; removing or renaming a state in `ApplicationFSM` (stored `status` values stop validating); dropping a required env var. |
| **minor** | New user-visible capability, and rollback is still a redeploy. | A feature (ghost prediction, the Kanban board); a new endpoint; a new optional field or additive migration. |
| **patch** | No new capability. | Bug fix, security fix, dependency refresh, performance work. |

The test for major is mechanical: **could I deploy the previous release's image against the
database this release leaves behind, and would it boot and serve?** If no, it is a major. The
`positions` entity in `TODO.md` is the first plausible `2.0.0` — it adds a table *and* changes the
state machine.

### The version number lives in exactly one place: the git tag

`git tag v1.3.0` and its GitHub Release are the source of truth. `web/package.json` carries a
static `"version": "0.0.0"`, which is deliberate: the package is `private: true`, so npm never
reads or publishes the field, and a number kept there would be a hand-copied duplicate of the
tag — the same failure that killed `PLAN.md` and that the FSM's single `TRANSITIONS` table exists
to prevent. `api/` has no version constant. There is nothing to keep in sync, so nothing can
drift.

Releasing is therefore: land the work (with `SPEC.md` already updated, per the rule at the top of
this document), move the `CHANGELOG.md` **Unreleased** block under a version heading, tag, and
`gh release create`.

---

## Decisions log

Reversed decisions keep both entries. A spec that hides its own history teaches nothing.

### Registration closed, in v1.4.1

The app shipped with open sign-up because that is what `rails generate devise` hands you, not
because anyone decided a stranger should be able to put their resume in this database. Once the
question was asked out loud the answer was not close: the demo account tells the portfolio story
better than an empty new one, and every real user the sign-up form could attract would arrive
owing them a custodial promise this deployment cannot make. Closing it removed more code than it
added. Full reasoning in § Registration is closed.

The alternatives considered and rejected: **an invite code** (the same custody problem, plus a
mechanism to build), and **leaving it open and writing a careful privacy policy** (a policy is a
promise, not a control — it does not make one `pg_dump` a backup strategy).

### No document version history

`applications.resume` is a single `bytea` column; re-uploading overwrites. Keeping the previous *n*
versions was considered in v1.4.1 and rejected. Every retained version is another megabyte in the
primary Postgres whose only backup is a daily dump, and the honest form of the feature is a
`documents` table plus object storage — a real migration in service of a file nobody reads. The
overwrite is also the *only* deletion path a user has for a document, which is worth more than an
undo.

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
looks more scalable but is fake precision here: it costs seven initial requests instead of a
handful, and it breaks the board's one job — showing the whole pipeline at a glance. A column
that says "load more" is a column whose depth you cannot read at a glance, and glancing is the
only reason to open a board instead of the list.

The `status` list filter (§ API contract) makes the per-column fetch **possible** — seven
requests, `status=<one>` each — and it is still not worth making. Nothing above depended on that
parameter's absence: one reason is a cost the parameter does not remove, the other is a fact
about what a board is for, which no API shape can move. This is an option that is now cheap and
still wrong, not an objection that was answered.

The cap keeps the pathological case (thousands of rows) from hanging the page; a personal tracker
that hits it has outgrown a personal tracker. The truncation is
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
