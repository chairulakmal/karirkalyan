# KarirKalyan: Technical Specification

> The technical source of truth for KarirKalyan, a full-stack job application tracker: Rails 8 API (`api/`) + Next.js 16 frontend (`web/`). It describes the system **as it is**, and the most important rule about it is **spec-first: change this file before you change code**; if code and spec disagree, one of them is a bug. It covers both apps end to end (data model, state machine, services, API contract, jobs, security, auth, i18n, the installable app), plus testing, deployment, local dev, versioning, and the decisions log; the full table of contents is under [Contents](#contents).
>
> I work mostly in TypeScript and Next.js. I built KarirKalyan to learn Rails the way I'd actually use it in production, so this document records the decisions and the reasoning behind each one, not just the feature list.

---

## How to use this file

**SPEC.md is the technical source of truth. Change it before you change code.**

The workflow is spec-first, in this order:

1. **Write the change here.** Amend the data model, the API contract, the state machine: whatever the change actually touches. If you cannot describe it here, you do not yet understand it well enough to build it.
2. **Get the spec right.** A spec that disagrees with itself produces code that disagrees with itself.
3. **Then write the code**, and make it match.

Two consequences worth stating plainly:

- **If code and SPEC.md disagree, that is a bug in one of them**, not a documentation chore to sweep up later. Decide which is wrong and fix that one. Silence is the failure mode: this file spent an entire release describing Sidekiq and Redis after both had been removed, which is exactly why it now carries this rule.
- **SPEC.md describes the system as it is**, in the present tense. It is not a plan and not a history. Open work lives in [`TODO.md`](TODO.md); shipped work lives in [`CHANGELOG.md`](CHANGELOG.md), including the pre-1.0.0 build phases that used to sit at the top of this file.

Last synced against the code: **2026-07-21**, `v1.9.0` and `v1.10.0` built together in one batched PR (`feat/v1.9-and-v1.10`), both unreleased pending their tags. **`v1.9.0`** ("can you actually take this job?") lands the takeability constraints: § Data model grows the per-application visa fields (`sponsorship`, the one column defaulting to a value, `unknown`, and nullable by design; `status_of_residence`), the `hiring_entity` field, the timezone fields (`company_timezone` as a curated IANA enum and `overlap_hours_required`, with the survivable-from-JST read derived in `web/app/lib/timezone.ts`), and `interview_at`; § Data model's `users` grows the global-half residence fields (`residence_status`, `residence_expires_on`, driving a days-remaining read and CoE lead-time guidance over the sourced `Visa::COE_LEAD_TIME_DAYS`); § `UrlPrefillService` extracts `sponsorship`, `hiring_entity`, `company_timezone`, and `overlap_hours_required`; § Exports gains the interview `.ics` (`GET /applications/:id/interview`, a hand-written RFC 5545 VEVENT with a UTC DTSTART); § API contract gains `PATCH /me` and `POST /applications/:id/talking_points`. Every column is additive under the standing rule. **`v1.10.0`** (the follow-through) harvests that machinery: interview stage notes on the pre-existing `timeline_entries.note` (a scope reduction, no migration); a Vitest unit-test seam in `web/`, wired into CI; § dashboard stat cards (`response_rate`/`ghost_rate`/`avg_days_in_stage`) and the `facets` payload widened to a `[company, board, status, japanese_level]` tuple for disjunctive cross-narrowing; filter state in the URL; § Board view's triage cards on the two candidate-side columns (`source` now on `as_json`, `days_in_stage` a correlated subquery in `ListQuery`) and the `canRevive` fold retiring `REVIVAL_STATES`; `Applications::TalkingPointsService` (the resume PDF plus the posting through Claude, bullets not a draft); `Push::Notifier` extracted from `PushDigestJob` to feed the daily `InterviewReminderJob`; and the public `/hsp-calculator` (pure `app/lib/hsp.ts`, its point table verified against the MOJ source PDF). No `v1.10.0` schema touch is more than a nullable column, so both releases pass the minor test. Before that, `v1.8.1`: Japanese phrase-based line breaking lands: § i18n gains § Japanese line breaking, two layers with no schema and no API surface: a `:lang(ja)` `word-break: auto-phrase` rule in `globals.css` (Chromium 119+ breaks Japanese lines at phrase boundaries; other engines drop the unknown value and keep today's behaviour), and a `<Phrase>` server component running BudouX in RSC over the server-rendered headings and CTA labels, emitting phrase segments separated by `<wbr>` inside a `keep-all` span, with the model staying out of the client bundle by construction. The board and list card titles are exempt on the record that they render with `truncate` and never wrap. Before that, `v1.8.0`: the Japan market layer lands, one release because all of it is captured in the same `UrlPrefillService` pass: § Data model grows a sixth table (`agencies`, purely additive) plus eight nullable columns on `applications` (recruiter `channel` and `agency_id`, the 年収 compensation structure as four fields, the posting's `japanese_level` requirement, and `posting_snapshot`), every one inside the additive-migration standing rule; § `UrlPrefillService` extracts the new fields in the same Claude call that already reads company/role/notes and now returns `posting_text`, the stripped text it sent, so the form can carry it into `posting_snapshot` at create time (capture at prefill, persistence on create: there is no row to write at prefill time, and the user still reviews everything before anything is saved); § `Applications::ListQuery` gains a `japanese_level` filter under the same ignore-bad-input contract as `status`; § API contract gains `GET /api/v1/applications/ownership_check`, the duplicate-submission warning built on candidate "ownership" (the first agency to submit you to a company owns that candidacy for `Agency::OWNERSHIP_WINDOW_MONTHS`, and the fee follows the owner even when you later reach the company another way), and `#show` merges `agency_name` and `posting_snapshot` (the snapshot is excluded from `as_json`, so index rows stay lean). Before that, `v1.7.0`: the prefill fetch becomes bounded in memory and time: § `UrlPrefillService` streams the response body in capped chunks instead of buffering whatever the server sends, and one 15 s wall-clock deadline covers the whole fetch across redirect hops (`read_timeout` is per-read, so a trickle stream never tripped it); § Background jobs raises the Solid Queue worker poll from 0.1 s to 1 s, retiring the idle process's main continuous allocator (a production-memory fix, not a feature). Before that, the account menu lands: § Auth flow gains the square initials chip (Settings and Sign out collapse behind it at every width, the initial derives from the email local part, and the `sm`-and-up settings link is re-recorded as this menu, a settled decision push delivery re-decided) and the companion `httpOnly` `account_email` cookie, set beside the `session` cookie by both sign-in handlers from the response body they already receive and cleared wherever the session cookie is, so the layout shows the user without a per-page `/me` fetch (`ProfileCard`'s prop-not-fetch rule applied to the layout). Before that, `v1.6.0`: push delivery for the follow-up digest lands, completing the release's planned scope. § Data model grows a fifth table (`push_subscriptions`, purely additive); § Push notifications is new: the `web-push` gem signs with per-environment VAPID keys read from two **optional** env vars (absent keys degrade the push endpoints to `503 push_unavailable`, the `ANTHROPIC_API_KEY` pattern, so the required env set does not grow and dropping the vars later is not a major); `FollowUpReminderJob` fans the same claimed `won` set into a second channel: one `PushDigestJob` per user beside the mailer's `deliver_later`, so the exactly-once anchor stays the single timeline claim and a push failure retries without re-mailing; expired subscriptions self-prune on the push service's 404/410. § Installable app gains § The service worker: **push + `notificationclick` handlers only, never `fetch`**: every route renders dynamically for the CSP nonce, so a worker that cached HTML would serve pages whose nonces no longer match the header; `worker-src 'self'` joins the CSP (a `strict-dynamic` `script-src` ignores `'self'`, so the nonce-less static worker script needs its own directive) and `/sw.js` joins the proxy-matcher exclusions (a worker update fetch that 307s to sign-in is a dead worker). The notification-permission prompt fires **only** from the explicit enable toggle on `/settings`, never on load. Before that, passkey sign-in lands. § Data model grows a fourth table: `credentials` (one row per enrolled authenticator) plus a nullable `users.webauthn_id` user handle, both additive. § Passkeys (WebAuthn) is new: the `webauthn` gem hand-wired into Devise rather than `devise-passkeys`, with the three settings that keep third-party providers in the chain: discoverable credentials (`residentKey: "required"`), no `authenticatorAttachment` restriction, `attestation: "none"`, because the real provider is Proton Pass, not the platform authenticator. The RP ID and origin derive from `FRONTEND_URL` (full host, never the registrable domain: `awano.chairulakmal.com` exists), so no new env var joins the required set; challenges are single-use five-minute entries in Solid Cache, deleted before verification so a replay finds nothing; and the assertion route joins devise-jwt's `dispatch_requests`, so a passkey sign-in mints the same 1-day, JTI-revocable JWT a password one does; sign-out still revokes every device however it signed in. § API contract gains six passkey routes and two append-only error codes (`invalid_passkey`, `passkey_verification_failed`); § Auth flow gains the browser half: two origin-checked route handlers that keep the JWT out of client JS, ceremony JSON through the native `PublicKeyCredential` parse/serialize methods (feature-detected; the button does not render without them), and enrollment on a new `/settings` page, desktop-first because Proton Pass syncs the created passkey to the phone. Password sign-in stays forever as the fallback. Before that, § Installable app gains the installed shell: below `sm` navigation moves to a bottom tab bar (`sticky`, not `fixed`, so nothing needs compensating padding; safe-area inset padded, with `viewportFit: "cover"` added because without it the `env()` insets are zero) and the header sheds the links the bar now carries, which dissolves the 375px Japanese-label squeeze; the manifest gains two `shortcuts` whose English-only labels are a recorded decision (a locale-reading manifest route would freeze labels to install-day locale anyway: the `start_url` freeze argument, reapplied); and the icon purposes gain `monochrome`, the monogram glyph unmixed to an alpha mask so Android themed icons tint it, measured to the same ~22px safe-zone margin as `maskable`. Before that, § Share target: the manifest declares `share_target`, so a posting shared from any Android app lands on `GET /applications/new` as a deep link that extracts the URL from whichever param the sharing app hid it in, auto-runs the pre-fill on arrival, seeds the paste box when the share is text with no URL at all, and survives the sign-in bounce a 1-day JWT makes the common case: the capture forwards through sign-in instead of being dropped for `/dashboard`. Before that, § Auth flow: the expired-session bounce emits a **relative** `Location`. The absolute URL it used to build from `request.url` resolved to the internal origin behind Railway's proxy and sent real browsers to `https://localhost:8080`; the unprefixed relative path also lets next-intl land a `ja` session on `/ja/sign-in` via `NEXT_LOCALE`, which the old redirect never did. Before that, § `UrlPrefillService` gains a **second entry point**: the posting text can arrive pasted instead of fetched. Only `fetch` ever failed, and `extract` never knew where its text came from, so the paste enters the existing `to_text → extract` tail rather than forking a second pipeline. The failure codes `v1.4.3` typed are what make it targetable: `prefill_blocked` and `prefill_failed` are the two the paste box cures, and § Server-side error messages now records that `web/` reads the `code` rather than inferring recoverability from prose. § Installable app is new, and describes the manifest for the first time: `start_url` stops launching the app onto the marketing page, `id` is pinned before a WebAPK exists to be orphaned by it, and the icon purposes split because `any` wants the drawn rounded corners and `maskable` wants none. Every **FSM rule the UI applies** is now fetched. The sets `web/` still names for itself decide presentation and affordance rather than what the FSM permits: `COLUMN_ORDER` ranks the board's columns whose *membership* is fetched, `CONFIRM_REQUIRED` and `REVIVAL_STATES` choose which moves get a prompt and which offer a way back. Stale, those could misjudge how a move is *offered* (`REVIVAL_STATES` most of all; see its own header, which admits it reads an FSM edge the fetched `transitions[status]` also answers); none could authorise one, which the server validates regardless. The homepage's `pipeline-diagram.tsx` remains the one declared exception, an illustration nothing reads. A missing `terminal_states` degrades to **silence** (neither "permanent" nor "reopenable"), since the FSM always has terminal states and an empty list can therefore only mean the table did not arrive. A missing `entry_states` degrades the same way, to the **absence of a picker**: the form sends no `status` and the API applies its own default, because an empty entry set likewise cannot be real, and guessing one risks offering a state the API would `422`. § API contract's `GET /applications` now documents its query parameters, which it never had: a swagger-only gap, so no prose here moved. Before that, `v1.5.0`: § API contract's `status` filter became a **list**: `GET /applications?status=applied,offer` ORs within the filter and still ANDs against `company` / `source`, with an empty or all-unknown list treated as unfiltered rather than as `where(status: [])`'s silent zero rows: the reading that would have contradicted § `Applications::ListQuery`'s promise that junk falls back to the unfiltered first page. `status=applied` still parses as a one-element list, so the wire is backward-compatible. § The transition table gained `active_states`, and `ApplicationFSM::ACTIVE_STATES` now owns the definition the frontend used to hardcode: promoting "active" from a display detail to a user-facing filter contract would otherwise have left FSM vocabulary living in two languages. § Board data re-argued its rejection of per-column pagination, which had leaned partly on the `status` parameter not existing: the parameter exists now, and the surviving reasons carry it alone. Before that, `v1.4.4`: § i18n gained § Catalog parity is checked in CI: `en`/`ja` key parity was a convention held by review, and this document said so; it is now a script in the `web` job, counting every path with array elements counted individually so a missing FSM reason chip cannot hide inside an array. § Security gained a per-account write throttle on the application endpoints and `Application::MAX_PER_USER`, a hard ceiling of 200 applications per account: the throttle bounds the rate of the upload path, and the ceiling is what bounds total storage, which no throttle can; and every path guard in `rack_attack.rb` now keys off `Rack::Attack.normalized_path` rather than raw `req.path`, because Rails routes `/api/v1/auth/sign_in.json` to the same action while an `==` guard misses it and fails open. § API contract gained § Download filenames, and § Exports now defers to it: both download surfaces name their PDFs through one `Application#download_basename`, where the controller previously sent a hardcoded `resume.pdf` for every application and the archive built a different name from `parameterize` that emptied out on Japanese company names. The slugger preserves Unicode rather than transliterating it. Before that, `v1.4.3`: § Query layer gained `Applications::ListQuery`, an extraction rather than a behaviour change: it moves `GET /api/v1/applications`'s filtering and cursor decoding out of the controller and writes down the contract that action already had. § Error codes split pre-fill failure into `invalid_url` / `prefill_blocked` / `prefill_unreachable` / `prefill_failed`: the `invalid_url` scope the `v1.4.1` audit recorded as "corrected to match the code" was correct about the code and wrong about the world: the code was conflating four outcomes, and it is the code that has now moved. After the tag, § `UrlPrefillService` **retracted a factual claim**: no board is currently known to block us, and the TokyoDev challenge this spec asserted as standing policy did not survive re-probing. The retraction changed no code, only what the spec claims to know.

---

## Contents

- [How to use this file](#how-to-use-this-file)
- [System overview](#system-overview) · [Registration is closed](#registration-is-closed)
- [Backend (`api/`)](#backend-api) · [Tech stack](#backend-tech-stack) · [Data model](#data-model) · [State machine](#state-machine) · [Service layer](#service-layer) · [Query layer](#query-layer) · [API contract](#api-contract) · [Background jobs](#background-jobs) · [Mail](#mail) · [Security](#security) · [Passkeys (WebAuthn)](#passkeys-webauthn) · [Push notifications](#push-notifications) · [Observability](#observability)
- [Frontend (`web/`)](#frontend-web) · [Tech stack](#frontend-tech-stack) · [Design system](#design-system) · [Auth flow](#auth-flow) · [Public pages](#public-pages) · [Legal pages](#legal-pages) · [Route guard](#route-guard) · [Caching](#caching-use-cache) · [Board view](#board-view) · [i18n](#i18n) · [Installable app](#installable-app)
- [Testing strategy](#testing-strategy)
- [Deployment (Railway)](#deployment-railway) · [Backups](#backups)
- [Local development](#local-development)
- [Versioning & releases](#versioning--releases)
- [Decisions log](#decisions-log)
- [What this project is demonstrating](#what-this-project-is-demonstrating)

---

## System overview

> **At a glance** · Two deployables. `api/` (Rails 8) owns data, auth, the FSM, and background jobs; `web/` (Next.js 16) owns the UI and the browser session. The one hard rule at the boundary: **the JWT never reaches client-side JavaScript.**

```
karirkalyan/
  api/    ← Rails 8 API-only. Owns data, auth, the FSM, background jobs.
    docker-compose.yml   ← postgres 18 for local dev (no Redis)
  web/    ← Next.js 16 App Router. Owns the UI and the browser session.
  design/ ← design tokens and icon assets
  notes/  ← working notes; not authoritative
```

### Why an API plus a separate frontend

The Rails backend is the portfolio piece. The Next.js frontend exists so the app is genuinely usable day-to-day for tracking a real job search. Separating them also demonstrates knowing when Rails is the right tool (data integrity, background jobs, API) and when it isn't (rich interactive UI).

There is one hard rule at the boundary: **the JWT never reaches client-side JavaScript.** Everything in the frontend auth design follows from that.

### Registration is closed

> **At a glance** · No public sign-up: no endpoint, no page, no invite. Visitors use the shared demo account; real accounts are created by the operator, server-side. The trade is deliberate: it avoids a custodial promise over strangers' resumes this deployment cannot keep. Account *deletion* stays (`DELETE /api/v1/auth/account`).

**There is no way for a stranger to create an account.** No `POST /api/v1/auth/sign_up`, no `/sign-up` page, no invite flow. Visitors sign in to the shared read-write demo account through the **`Try demo account` button on `/sign-in`**, which fills the form for them; the credentials are also published in both READMEs and in `llms.txt`, and they ship in the sign-in page's own JavaScript bundle, so treat them as world-readable, which is the assumption § Legal pages already makes when it calls the demo account world-writable. New accounts are created by the operator, on the server, with `bin/rails users:create EMAIL=… PASSWORD=…`, the one surviving caller of `WelcomeMailer`.

<details>
<summary><strong>Why registration is closed: the full argument</strong></summary>

This is deliberate, and it is the single most surprising thing about the system, so the reasoning is here rather than in a commit message:

- **Open registration means strangers' resumes.** A resume is close to the most PII-dense document a person owns: legal name, address, phone, employment history, sometimes a photo and a date of birth. This app stores it as `bytea` in a single Railway Postgres, whose only backup is a nightly `pg_dump`. That is an honest arrangement for *my* resume. Accepting yours would make it a custodial promise I have not built the machinery to keep.
- **No legal entity is not an exemption.** Under Japan's APPI a natural person handling personal information can be a 個人情報取扱事業者 in their own right; the small-handler carve-out for under 5,000 records was repealed in 2017. "It's just a portfolio project" is not a defence, and neither is "I'm not a company."
- **Nothing is lost.** The portfolio story is told by the demo account, which is *better* than an empty new account: it opens with 12 pre-loaded Tokyo tech applications, a populated board, real timeline history and a working ghost-risk prediction. A recruiter who signs up gets an empty dashboard and no reason to stay.
- **It deletes a whole surface.** Closing the door removes the sign-up endpoint, its Rack::Attack throttle, its spam-account and outbound-mail vectors, its CSRF-able route handler, and the self-service account-deletion button an open service would owe its users, because there are no such users. What it does *not* remove is the deletion capability itself: `DELETE /api/v1/auth/account` stays, and cascades (§ API contract). The operator can honour an erasure request; nobody can trip over the button.

</details>

<details>
<summary><strong>The <code>routes.rb</code> trap, and why <code>RegistrationsController</code> is not a Devise subclass</strong></summary>

The trap to know before touching `config/routes.rb`: Devise's `:registerable` module generates the sign-up `POST` **and** the account-destroy `DELETE` from the same `registrations` controller, so reaching for `skip: [:registrations]` alone would silently take the deletion endpoint with it. `devise_for` therefore skips `:registrations`, and the destroy half is re-declared as an ordinary route (no `devise_scope`) on a path that says what it does:

```ruby
devise_for :users, path: "/api/v1/auth", skip: [ :registrations ], …

namespace :api do
  namespace :v1 do
    namespace :auth do
      delete "account", to: "registrations#destroy"
    end
```

`Api::V1::Auth::RegistrationsController` is deliberately **not** a `Devise::RegistrationsController` subclass: inheriting it would drag `new`, `create`, `edit`, `update` and `cancel` in as live methods: unroutable, but a loaded gun in a drawer, in the one release whose point is that the gun is gone. It subclasses `ApplicationController` instead, which is where `authenticate_user!`, `current_user` and `render_error` come from anyway; nothing was lost. `bin/rails routes` shows exactly four auth routes: sign-in (new + create), sign-out, and account-destroy.

</details>

The demo account is exempt from destruction (`403 forbidden`). Its credentials are published, this endpoint is in Swagger, and `DemoResetJob` only rebuilds on the hour; without the guard, any visitor could make "Try demo account" 401 for the next fifty-nine minutes.

Reopening registration is a product decision, not a config change: it would owe users a privacy policy that promises more than "the operator's own data" (§ Legal pages), a self-service delete button, and a backup story that is not one `pg_dump`. The upload throttle and the per-account application cap this list used to name are no longer owed: `v1.4.4` built both (§ Security), because the shared demo login is a multi-tenant abuse surface whether or not registration is open.

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
| **Solid Queue + Solid Cache** | Sidekiq + Redis | Postgres-backed; no Redis, no extra Railway service |
| PostgreSQL `bytea` for files | Active Storage + S3 | Files are ≤ 1 MB; no object-storage overhead at this scale |
| RSpec + FactoryBot | Minitest | Industry standard in Tokyo Rails shops |
| rswag | Hand-written OpenAPI | Request specs and docs share one source of truth |
| `anthropic` gem | HTTP by hand | Typed tool/JSON-schema responses for URL pre-fill |

**Why `--skip-test` on `rails new`?** Rails generates a `test/` folder for Minitest. This project uses RSpec, so that folder would be dead weight. `--skip-test` signals the choice.

### Data model

> **At a glance** · Six tables. `users` (Devise auth, `jti` for JWT revocation), `credentials` (WebAuthn passkeys: one row per enrolled authenticator), `push_subscriptions` (Web Push: one row per subscribed browser), `agencies` (recruitment agencies, a per-user vocabulary the recruiter channel resolves names into), `applications` (the core FSM entity: `status`, plus `resume`/`cover_letter` as `bytea` and the Japan-market columns), and `timeline_entries` (append-only audit log, one row per status change).

#### `users`

Managed by Devise. `jti` stores the current token ID, rotated on sign-out to invalidate existing tokens. `webauthn_id` is the opaque WebAuthn **user handle** (§ Passkeys): generated lazily the first time the user asks for passkey-registration options, and nullable because a password-only account never needs one, which also keeps the column inside the additive-migration rule (`TODO.md`'s standing rule: every new column nullable or defaulted). `User#as_json` strips `encrypted_password`, `jti`, and `webauthn_id`.

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

**`residence_status` + `residence_expires_on` are the global half of the visa item** (`v1.9.0`): the per-application half (`applications.sponsorship`/`status_of_residence`) asks whether a *role* can be taken; this asks about the user's *own* footing. `residence_status` is `User::RESIDENCE_STATUSES` (`engineer_specialist`, `highly_skilled`, `permanent_resident`, `spouse_or_dependent`, `other`), and `residence_expires_on` yields the days-remaining warning the search runs on. Both nullable, additive under the standing rule (registration is closed, but the operator's own `INSERT` predates these columns). Permanent residents have no expiry and need no Certificate of Eligibility on a job change, so the UI reads `permanent_resident` as "no clock." The CoE lead-time guidance a job change implies is a *derived* read over `Visa::COE_LEAD_TIME_DAYS` (a perishable constant, sourced to the MOJ processing statistics), never a stored value. `User#as_json` continues to strip `encrypted_password`, `jti`, and `webauthn_id`; the residence fields are the user's own and are returned.

#### `credentials`

WebAuthn passkeys: one row per enrolled authenticator, zero for a password-only account, at most `Credential::MAX_PER_USER` (20) per account (§ Passkeys: the bound the enrollment throttle cannot provide). The table is purely additive (the previous image never writes to it), so it passes the versioning test for free. The full ceremony lives in § Passkeys; what the columns are for:

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

`external_id` is unique **globally**, not per user, because authentication is usernameless: the assertion arrives with no user context, and the credential row, found by `external_id`, is what names the user. `Credential#as_json` exposes only `id`, `nickname`, `created_at`, `last_used_at`: the settings list needs nothing else, and `public_key`/`external_id` have no client-side use.

#### `push_subscriptions`

Web Push subscriptions: one row per browser that enabled notifications, zero for most accounts, at most `PushSubscription::MAX_PER_USER` (10) per account (§ Push notifications). Purely additive, so it passes the versioning test the same way `credentials` did:

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

`endpoint` is unique **globally**: a push endpoint identifies one browser profile, so a re-subscription from the same browser updates the existing row rather than duplicating it; whoever is signed in at that moment owns it. The three fields together are the capability to send that browser a notification, which is why `PushSubscription#as_json` exposes only `id` and `created_at` and why the rows never leave the server otherwise.

#### `agencies`

Recruitment agencies, one row per agency per user. Hiring in Japan is heavily agent-mediated, and the recruiter channel (`applications.channel` below) needs the agency to be a first-class thing rather than a free-text string, because the ownership check has to group submissions by *which* agency made them. Rows are created lazily: `Agency.resolve(user:, name:)` find-or-creates by `(user_id, name)` when an application arrives carrying an `agency_name`, so the table is a vocabulary the applications share, not something the user manages on a page of its own. Purely additive (the previous image never writes to it), so it passes the versioning test the way `credentials` and `push_subscriptions` did.

```
agencies
  id
  user_id  FK → users, not null
  name     string, not null
  created_at, updated_at

  index (user_id, name) unique
```

`(user_id, name)` is unique so the same name typed twice resolves to one row; `resolve` rescues `RecordNotUnique` and retries the find, which is the standard answer to the find-or-create race. Names are matched exactly after stripping whitespace, nothing cleverer: fuzzy-merging "Robert Half" into "Robert Half Japan" would be guessing about the user's own vocabulary.

**`Agency::OWNERSHIP_WINDOW_MONTHS` (18) lives on this model.** The first agency to submit a candidate to a company owns that candidacy for roughly 12–18 months, and the placement fee goes to the owner even if the candidate later reaches the same company through another channel (researched 2026-07-11, TokyoDev). 18 is the conservative end on purpose: the warning's one job is to fire while the window *may* still be open, and a window presumed shut six months early is the failure mode. This is a perishable market fact under `TODO.md`'s refresh rule: re-confirm the convention yearly, and the constant is the only place the number lives.

#### `applications`

The core entity. `status` is FSM-controlled: it changes only through `Applications::TransitionService`, never a direct attribute write, and it is never mass-assignable. `resume` and `cover_letter` are `bytea` columns capped at 1 MB in the model and excluded from JSON serialisation: dedicated download endpoints serve them via `send_data`, under the name `#download_basename` gives them (§ Download filenames).

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

**The Japan-market columns (`v1.8.0`) are all nullable, by the standing rule** (`TODO.md`: a `NOT NULL` column without a default would fail the previous image's `INSERT`s and silently turn a minor into a major), and all of them pass the field admission test the same way: each is extracted by `UrlPrefillService` at prefill time from the posting text, so recording them costs the user a review rather than data entry.

- **`channel` + `agency_id`** model how agent-mediated hiring here actually is: direct application, agency submission, or referral (`Application::CHANNELS`). The agency matters as a *row*, not a label, because two agencies submitting the same candidate to the same company is a real and damaging situation; the ownership check (§ API contract) is the feature these columns exist for. There is deliberately no validation tying `agency_id` to `channel = "agent"`: the form only offers the agency field on the agent channel, but data recorded another way is not wrong enough to refuse.
- **`japanese_level`** is the posting's demand, on the market's own taxonomy (`Application::JAPANESE_LEVELS`: `none`, `conversational`, `business`, `n2`, `n1`), the same buckets TokyoDev and Japan Dev tag every posting with. It records what the posting asks, not what the user holds; the gap between the two is the career-growth JLPT item and deliberately out of scope here. There is no index: at personal-tracker scale the filter scans a few hundred rows through the existing `(user_id, created_at)` index, the same reasoning as `timeline_entries.to_status`.
- **`sponsorship` + `status_of_residence` are the single most decision-relevant fact for a foreign engineer** (`v1.9.0`), and no generic tracker models them: a role that will not sponsor a work visa is not takeable, whatever else it offers. `sponsorship` is `Application::SPONSORSHIP` (`unknown`, `available`, `unavailable`) and is the one column that **defaults to a value rather than to null**: `unknown` is not missing data, it is decision-relevant signal (an attractive role whose sponsor status is unknown is a visible risk flag), so the default is `"unknown"` and the column stays nullable by design, never tightened to `NOT NULL` even in the `2.0.0` schema pass (`TODO.md` records the exception). Most postings do not state sponsorship, but the boards this project targets (TokyoDev, Japan Dev) tag visa support on every listing, so prefill fills it for free on the user's actual sources and one tap sets it otherwise, at the first recruiter conversation. `status_of_residence` names which 在留資格 the sponsored role falls under, on `Application::STATUSES_OF_RESIDENCE` (`engineer_specialist` = 技術・人文知識・国際業務, the usual one for software; `highly_skilled` = 高度専門職; `other`): a stable legal taxonomy, not a perishable figure, so it carries no annual refresh cost. It is null-means-unrecorded like `japanese_level` (no default), is not prefilled (postings rarely name the exact status, and a hallucinated one is worse than none), and is only meaningful when `sponsorship = "available"`, which is where the form surfaces it. Neither is indexed, the same personal-scale reasoning as `japanese_level`. This is the per-application half of the visa item; the user's own status of residence and its expiry (days remaining, CoE lead time) are the global half, deferred to a later `v1.9.0` pass pending a re-confirmation of the ISA/MOJ processing numbers (`TODO.md`).
- **`hiring_entity` is the remote-work analogue of the visa item** (`v1.9.0`), and just as underserved: the filter that silently kills most global-remote applications from Japan is not salary, it is that many companies simply **cannot employ someone resident here**. It is a four-value enum, not a boolean, because each value is a different employment reality: `own_entity` (the company has a Japan legal entity and employs you directly), `eor` (an employer-of-record is the legal employer, not the company you interviewed with), `contractor` (an independent-contractor arrangement only), and `unsupported` (Japan is not a supported location at all). `Application::HIRING_ENTITIES` holds the set. It is null-means-unrecorded like `japanese_level` (no default) and **is** captured at prefill (remote postings usually state their hiring model, unlike the exact 在留資格), so it passes the field admission test through the prefill door. Some EORs now also sponsor visas, which is why this sits beside `sponsorship` rather than apart from it. The enum encodes a stable legal structure, so its **annual refresh cost is near zero**: what is perishable (EOR fee ranges, onboarding times) informs the plan but never ships in the product. Not indexed, the same personal-scale reasoning as the other market columns.
- **`company_timezone` + `overlap_hours_required` answer "is this remote role survivable from JST?"** (`v1.9.0`). A US-West role demanding four hours of overlap means a 1am start, and no generic tracker does the timezone arithmetic that surfaces it before you apply. `company_timezone` is a **curated enum of IANA zone identifiers** (`Application::COMPANY_TIMEZONES`: the markets a Tokyo-based engineer actually targets, from `America/Los_Angeles` through `Europe/London` to `Australia/Sydney`), not a free 400-zone list, because a curated set validates trivially and the survivability question needs no more. IANA identifiers rather than fixed offsets, so DST is handled by the zone database, not frozen at record time. `overlap_hours_required` is the daily hours of overlap the role demands (a float, half-hours are real). Both are null-means-unrecorded (no default), and both are prefilled: postings state a company's location or HQ far more reliably than they state sponsorship, so the extractor usually derives the home zone, and the overlap window is explicit in most remote postings. The survivability read (the company's business hours mapped into JST, and whether the required overlap forces antisocial hours) is **derived, never stored**: it is a pure function of the two columns and the current date, computed at render time (`web/app/lib/timezone.ts`) so DST is always current. Not indexed, the same personal-scale reasoning as the other market columns. The interview-invite-at-a-bad-JST-hour warning rides the same arithmetic and lands with the `.ics` scheduling work.
- **`interview_at` is the one upcoming-interview instant** (`v1.9.0`), the source both the `.ics` export and the `v1.10.0` push reminders read. A single nullable `datetime`, not a per-stage schedule: at personal-tracker scale you are scheduling the *next* interview, and the per-stage history that already exists is the timeline. Stored UTC like every instant here, presented in JST. It is not prefilled (an interview is scheduled, not posted) and it is the input to the antisocial-hour warning the timezone item promised: an invite whose JST time falls before `07:00` is flagged rather than quietly accepted, because a company that scheduled it in its own timezone may have handed you a 3am call. The `.ics` export (`GET /api/v1/applications/:id/interview`, served as `text/calendar` under the download name `…-interview.ics`, § Exports) turns it into a calendar event whose `DTSTART` is a UTC instant, so the user's calendar renders it in their own zone with no timezone math on our side.
- **The compensation structure is four columns, not one number**, because Japanese offers quote 年収 as an annual figure that folds in bonus, often expressed as N months of base, and two "600万" offers with the same total differ materially on **guaranteed months vs performance-tied months**, which is the distinction worth a column. `comp_annual_min_yen`/`comp_annual_max_yen` hold the quoted range in yen (a bare figure fills only `min`; yen rather than 万円 so the stored number is unambiguous, and the form does the ×10,000). `comp_months_guaranteed`/`comp_months_variable` hold the months split; both are floats because half-months are real. Any comparison view derives from these: the normalised value is arithmetic, not a fifth column.
- **`posting_snapshot`** is the stripped text of the posting, captured because postings get taken down mid-process, usually right when the user is prepping for the interview they earned with them. It is capped at the model by the same `MAX_TEXT_CHARS` the prefill pipeline caps extraction at (one constant, owned by `UrlPrefillService`), and **excluded from `as_json` the way the blobs are**: the index and board fetch every row, and 12k of text per row is blob weight in a text costume. `#show` merges it explicitly (§ API contract). How it is captured without violating "prefill persists nothing" is § `UrlPrefillService`'s to explain.

#### `timeline_entries`

Append-only audit log. Every status change writes one row atomically with the status update; they succeed or fail together.

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

The `(application_id, created_at)` composite **replaces** a bare `application_id` index, which it covers as a prefix, so it is a widening, not an extra index. It exists because every read of this table is per-application in time order: the detail page's timeline, and the `LAG(created_at) OVER (PARTITION BY application_id ORDER BY created_at)` in the ghost-risk query, which is now the heaviest thing the dashboard does.

There is still deliberately **no index on `to_status`**, though the dashboard's offer-lookup subquery filters on it. Add `(to_status, application_id, created_at)` if the table grows; see `TODO.md`.

**Creation writes no timeline entry.** A row lands here only on a *transition*; an application created directly in an entry state (`wishlist`, `draft`, `applied`) has no `to_status` row naming that state. Anything deriving stage history from this table has to account for it; see the ghost-risk query, which does.

**`note` is the interview-stage note (`v1.10.0`), and the column already existed.** `TODO.md` scoped "interview stage notes" as a new `timeline_entries` column; the code already had one, carrying the revival reason a `→ applied` re-open records. So the release added no migration, only the affordance the column was waiting for: advancing into an interview stage (`phone_screen`, `technical`, `final_round`, `offer`) now offers an **optional** note ("who you met, what they asked"), recorded as that transition's `note` and shown on the timeline where revival reasons already are. The prompt is the detail page's alone; the board's card menu stays a one-gesture move, because the note is optional and a quick drag should not grow a text box. The set of stages that offer it is `web/`'s `STAGE_NOTE_STATES`, an affordance set beside `CONFIRM_REQUIRED`/`REVIVAL_STATES`, not an FSM copy that could authorize a move (§ Board view records why those sets are safe).

### State machine

> **At a glance** · `api/app/lib/application_fsm.rb`: a hand-written PORO, not a gem. 13 states; `TRANSITIONS` is the single source of truth for legal moves. Three states are terminal (`accepted`, `declined`, `archived`); three *look* terminal but revive to `applied` (`rejected`, `withdrawn`, `ghosted`). Creation is not a transition: it sets one of three `ENTRY_STATES`.

#### Why a custom PORO instead of a gem

The `state_machines` gem is mature but opaque: behaviour lives in DSL macros and callbacks, not in a file you can read top to bottom. The PORO means: open `application_fsm.rb`, read the `TRANSITIONS` array, know exactly what is allowed. This mirrors Awano's `fsm.ts`.

**`TRANSITIONS` is the single source of truth for legal transitions.** Nothing may duplicate it: not the frontend, not a test fixture, not this file. The diagram below renders it for human readers; if the two disagree, the Ruby wins and this section is the bug.

#### States

13 states. The recruiter-driven stages follow industry-standard ATS pipelines (Greenhouse, Lever, Workday); the candidate-side states (`wishlist`, `withdrawn`, `ghosted`) are common in personal trackers like Huntr and Teal.

```
wishlist ──→ draft ──→ applied ──→ phone_screen ──→ technical ──→ final_round ──→ offer ──→ accepted
                          ↘            ↘               ↘              ↘             ↘
                       rejected      rejected       rejected       rejected      rejected
                       ghosted       ghosted        ghosted        ghosted       declined

  withdrawn ← any of: wishlist, draft, applied, phone_screen, technical, final_round
  applied   ← any of: ghosted, rejected, withdrawn        ← revival paths
```

**`TERMINAL_STATES` is exactly `accepted`, `declined`, `archived`.** Only these three are final.

`rejected`, `withdrawn`, and `ghosted` all look terminal but are **not**: each transitions back to `applied`. A company that ghosted you can reach out again; a rejection can be reversed; a withdrawal can be reconsidered. This is the single most misread part of the FSM, and the reason a Kanban board cannot infer legal drops from a guessed left-to-right ordering.

Any non-terminal state may also transition to `archived` (housekeeping: remove clutter without deleting history). That is handled by an early return in `assert_transition!`, not by rows in `TRANSITIONS`.

**Why `rejected`, `declined`, and `withdrawn` are distinct:**

- `rejected`: company-initiated; the candidate didn't get the offer
- `declined`: candidate-initiated, *after* receiving an offer
- `withdrawn`: candidate-initiated, *before* any decision

Collapsing them into one "closed" state loses the signal cohort analytics depends on. The breakdown matters more than the count.

#### `ENTRY_STATES`: creation is not a transition

`ENTRY_STATES` is `wishlist`, `draft`, `applied`.

A tracker's users add roles at whatever stage they are really at (saved, still preparing, or already applied), so forcing every new application to start as `draft` was wrong, and left `wishlist` unreachable. The mental model: **the FSM constrains *changes*; creation sets the *initial* state**, the same way an ATS imports a candidate at a given stage.

`status` is still never mass-assignable. The controller validates the requested value against `ENTRY_STATES` explicitly, so a client cannot POST its way to `offer`: later stages are reachable only by transitioning, which keeps the audit trail honest. When someone adds a job they already applied to, an optional applied date backdates `applied_at`, so dashboard timing stays accurate for jobs added after the fact.

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

`valid_next_states` is serialised by `show` and `transition` only, **not by `index`**, which stays lean. A board view gets the whole effective table in one request from `GET /api/v1/transitions` instead; see § API contract.

### Service layer

> **At a glance** · Writes go through explicit service objects, never model callbacks. `TransitionService` is the only path for a status change (FSM check + timeline row in one transaction). Also here: `UrlPrefillService` (AI pre-fill over an SSRF-guarded fetch), `Demo::ResetService`, and the two `Exports::*` artefact builders.

#### Why service objects instead of fat models or callbacks

ActiveRecord callbacks (`after_save`, `before_update`) fire on every save, including seeds, factories, and admin imports. Logic that should run only on an explicit user action ends up running everywhere, requiring escape hatches. Service objects have explicit call sites: the behaviour runs when `TransitionService.new(...).call` is called, and not otherwise.

This mirrors Awano's `transitionStatus()` in `src/lib/tickets/service.ts`.

#### `Applications::TransitionService`

Signature: `new(application:, to:, actor:, note: nil).call`

1. `ApplicationFSM.assert_transition!` runs **before any DB write**: no partial state.
2. The status update and the `TimelineEntry` creation happen in one `ActiveRecord::Base.transaction`, the analogue of Prisma's `$transaction`. Both or neither.
3. `from_status` comes from `status_before_last_save` (ActiveRecord dirty tracking), so it is accurate even if callbacks run.
4. `applied_at` is set by the service, never supplied by the client.

**Known sharp edge:** `applied_at` is reset on *every* transition into `applied`, including the revival paths (`ghosted → applied`, `rejected → applied`, `withdrawn → applied`). Whether a revival should overwrite the original application date or preserve it is an open question: it changes what the dashboard's apply→offer timing means. Settle it in this file before changing the code.

#### `Applications::UrlPrefillService`

Paste a job-posting URL on the new-application form; it returns the extracted fields for the user to review and edit. Nothing is persisted. The AI fills the form; it does not save.

The service fetches the page, strips HTML to text, and asks Claude (via the official `anthropic` gem) for structured fields through a tool/JSON schema, so the result is typed rather than free text to be parsed.

**One extraction pass owns every captured field.** Since `v1.8.0` the tool schema asks for the Japan-market fields beside `company`/`role`/`notes`: `channel` (does the posting read as an agency listing, a direct one, or neither), `agency` (the agency's name when there is one), `japanese_level` (on `Application::JAPANESE_LEVELS`' taxonomy), and the four compensation-structure numbers (§ Data model). `v1.9.0` adds `sponsorship` (does the posting state that the employer sponsors a work visa: `available`/`unavailable`, or empty when unstated, which the extractor normalises to `nil`; the `unknown` default that fills the form is supplied by the column default and the form's initial state, not by this pass), because the boards this project targets tag visa support on every listing, and `hiring_entity` (`own_entity`/`eor`/`contractor`/`unsupported`, empty-then-`nil` when unstated), because remote postings usually state their hiring model, and `company_timezone` (one of `Application::COMPANY_TIMEZONES`, derived from the posting's stated location or HQ) plus `overlap_hours_required` (the daily overlap the role demands, a number), because remote postings state both far more reliably than they state sponsorship. `status_of_residence` is **not** in the schema: postings rarely name the exact 在留資格, so it is a manual one-tap field, not an extracted one. Only `company`/`role`/`notes` are `required` in the schema; the market fields are optional, and the service normalises what comes back rather than trusting it (an enum value outside the model's set becomes `nil`, a non-positive number becomes `nil`), because a schema constrains shape, not judgement, and a hallucinated `channel` written to the form is worse than an empty one. The all-fields-empty `ExtractionError` check stays keyed to `company`/`role`/`notes` alone: a page with a company and role is a posting even when it names no salary, and the reverse is not true.

**The response also carries `posting_text` (the stripped, capped text that was sent to Claude), and that is how `posting_snapshot` gets captured without prefill persisting anything.** There is no row to write at prefill time, so "persist at prefill" literally cannot mean a database write; instead the form holds `posting_text` and submits it as `application[posting_snapshot]` when the user creates the application. Zero manual entry, the user's review still stands between extraction and persistence, and both entry points fill it the same way: a pasted posting snapshots exactly as a fetched one does, which matters because a posting that could never be fetched is the strongest case for keeping a copy.

**Two entry points, one pipeline.** The pipeline is `fetch → to_text → extract`, and `POST /applications/prefill` accepts either `url` or `text`:

- **`url`**: the whole pipeline. This is the path that can be refused.
- **`text`**: the user pasted the posting themselves, so the fetch is skipped and the *same* `to_text → extract` tail runs on what they pasted. `extract` takes text and knows nothing about where it came from, which is why this is a second entry point and not a second pipeline: no new infrastructure, no per-source branching past the front door, and no circumvention of a site that refused us: the user fetched the page themselves, in their own browser, as themselves.

`text` wins if both arrive, because the user only pastes after the URL has already failed. Neither one present is still `invalid_url` ("Paste a job posting URL first"): the request supplied nothing to work with. **Pasted text goes through `to_text` rather than around it**: it inherits the same byte-cap-then-`scrub`, the same tag-strip (a paste from *view-source* works), and the same whitespace collapse: one text-conditioning rule, not one per source. What it does not inherit is `MAX_TEXT_CHARS`, which `to_text` no longer applies: the fetch's truncation lives in `#capped`, and the paste refuses instead. That is the one divergence, and it is spelled out below.

**The paste box is not offered on every failure, and that is the point of the taxonomy.** It is shown on exactly the two codes it cures: `prefill_blocked` (the site refuses automated readers) and `prefill_failed` (we reached the page and it yielded no posting: a login wall, an SPA shell, a challenge interstitial). A `prefill_unreachable` gets a **Retry** instead, because a paste would be manual work for a URL that may well answer on a second try, and `invalid_url` gets neither: nothing is wrong except the URL. Before `v1.4.3` typed these, every failure arrived as `invalid_url` and a paste box shown on all of them would have been noise on three failures out of four.

The **near-zero-manual-entry test** in `TODO.md` § Standing rules is not in tension with this. That test refuses a paste field *replacing* free capture at prefill time; this one competes with **no capture at all**, because the fetch is impossible rather than merely unattempted. Same widget, opposite question. **Model: Claude Haiku 4.5.** Extraction is a small, well-defined job; the cheapest fast model is the right tool, and a typical posting costs a fraction of a cent. Claude specifically because it reads Japanese postings natively: the same flow works on a Wantedly listing, a Greenhouse page, or a company careers page without a parser per site. For a Tokyo job search that is the whole point.

Because the server fetches a user-supplied URL, the SSRF guard is load-bearing:

- Resolves the host and validates **every** resolved address against loopback, private, and link-local ranges, including the cloud metadata endpoint `169.254.169.254`.
- **Pins the connection to the validated IP** (`http.ipaddr`), so a DNS rebind between check and connect cannot redirect the fetch. Restricts to ports 80/443.
- **The pin prefers an IPv4 address** when the host resolves to both. Outbound IPv6 is disabled on the `api` service, so dialling a AAAA record dies with `ENETUNREACH` before a packet leaves the container; and Cloudflare-fronted hosts resolve IPv6-first, which makes that the common case rather than the edge. This does not weaken the guard: every resolved address is still validated and a single internal one still rejects the whole URL. The preference only decides which *already-validated* address gets dialled, never whether validation ran.
- **The connection never proxies** (`Net::HTTP.new(host, port, nil)`). The default `p_addr` is `:ENV`, under which an `http_proxy` variable makes Net::HTTP dial the proxy and ignore `ipaddr` entirely: the proxy re-resolves the hostname and the rebinding defence above becomes decoration. Passing `nil` means a future env change cannot silently switch the guard off.
- Re-validates **scheme, port, and every resolved address on every redirect hop**. Scheme matters per hop because `fetch` recurses into itself and never passes back through `validated_uri`, and `URI.join` will produce `ftp://host:80/x` from a `Location` header, which clears a port-only check.
- **A guard rejection past hop 0 is a `FetchError`, not an `InvalidUrlError`.** The user chose hop 0; the site chose the rest. Blaming a pasted URL for where the site redirected is the same lie this taxonomy exists to end, one hop later.
- **Every guard rejection returns one message** ("That URL can't be fetched.") whether the host failed to resolve or resolved somewhere internal. Distinct copy would turn a blind SSRF into an internal-hostname oracle: probe `redis.railway.internal`, read which names exist off the wording. The demo account's credentials are published, so authentication is not a barrier here. The specific reason is logged server-side.
- Body-size cap on the fetch, **enforced while streaming**; character cap on the text sent to Claude. The body is read in chunks and reading stops at `MAX_BODY_BYTES`. This is not a tidiness choice: `Net::HTTPResponse#body` buffers the entire response before a post-hoc `byteslice` sees a byte, so against a huge or endless body (a misconfigured server, a hostile streaming endpoint) an unstreamed cap is decoration, and the fetch runs inline in a Puma request thread where one such response occupies the container's memory. Streamed, peak memory is the cap regardless of what the server sends. Every response goes through the same capped read, redirects and error pages included, because `Net::HTTP` drains an unread body into memory itself on the way out of the request block.
- **The whole fetch runs under one wall-clock deadline** (`FETCH_DEADLINE`, 15 s, shared across every redirect hop). `read_timeout` is per-read: a trickle stream that delivers a chunk every few seconds, forever, never trips it. Exceeding the deadline raises `FetchError` (retryable), the same honesty rule as every other failure here: the page took too long, try again.
- The capped body is `scrub`bed after the byte-cap: `byteslice` is byte-indexed, Japanese text is three bytes a character, and a cut landing mid-character makes every later `gsub` raise `ArgumentError`: an untyped `500` on exactly the postings this service exists to read. **A paste is byte-capped and `scrub`bed the same way before `to_text`**, for the same reason and with the same constant: it bounds the regex work on a body the user chose the size of.

**The fetch truncates at `MAX_TEXT_CHARS` (12,000); the paste refuses.** That is the one place the two entry points diverge past the front door, and the difference is whether the user watched us read it. A fetched page over the cap is cut by `#capped` in silence: nobody saw its length, and a posting has said what it needs to well before 12k of stripped text. A paste is something the user assembled and can see, so cutting it silently would tell them their whole posting reached Claude when a third of it did. `PasteTooLongError` → `prefill_paste_too_long` instead, naming the real figure.

**The cap is measured server-side, and the browser deliberately does not mirror it.** The ceiling applies to *stripped* text, and only the server has stripped it: a view-source paste is routinely 3× its own stripped length, so a form counting the raw paste would refuse postings that sail through whole. `MAX_FILE_BYTES`' spare-the-round-trip logic does not transfer, because a file's size is a number the browser can actually compute and this one is not. The paste box therefore shows an **informational** character count with no limit attached and blocks nothing; the server owns the decision, because it is the only party that can make it correctly.

Two consequences worth stating, since both look like oversights:

- **The counter counts codepoints** (`[...posting].length`), not `.length`'s UTF-16 code units. Ruby's cap counts codepoints, an emoji scores 2 under `.length`, and this app is full of Japanese: a code-unit count would match neither what the user sees nor what the server does.
- **`errors.code.prefill_paste_too_long` does not name the number**, following `base_too_many_applications` (§ Server-side error messages) rather than `resume_too_long`. Here it is not only the drift argument: the count the user can see is the *raw* paste, and the limit applies to the stripped text, so quoting "12,000" beside a counter reading 16,800 would invite exactly the wrong comparison. The English sentence from the API names both real figures; the localized copy says it is too long and to trim it.

Rate limits are enforced per-IP *and* per-account; see Security.

Errors are typed so that each one tells the user a different true thing, and the mapping is the whole point of the taxonomy: `InvalidUrlError` → `invalid_url` (your URL is the problem: fix it), `BlockedError` → `prefill_blocked` (the site refuses automated readers; nothing to fix), `PasteTooLongError` → `prefill_paste_too_long` (the paste is over the cap once stripped: trim it), `FetchError` → `prefill_unreachable` (check the page is live, then retry), `UnreadableError` and `ExtractionError` → `prefill_failed` (we read the page, it yielded no posting), `ConfigError` → `prefill_unavailable`. Statuses are in § Error codes. The user can always fill the form in by hand.

**`prefill_failed`'s copy names no source**, because both entry points reach it: a fetched page that yielded no posting and a paste with no readable text in it raise the same `UnreadableError`. Copy that said "that page couldn't be read" would be telling someone who had just pasted a posting about a page nobody fetched.

Two edges of that mapping are deliberate. **An extraction where every field comes back empty is an `ExtractionError`, not a `200`**: Claude read the page and found no posting in it, so rendering a blank form as success would be the same class of lie as the status codes above. And **`ConfigError` fires before the fetch**, not after: a server with no `ANTHROPIC_API_KEY` would otherwise spend the full guarded round trip, up to 13s of timeouts, on a result it cannot use.

**A blocked fetch is expected degradation, not a bug to engineer around.** A site may refuse an automated reader outright (`401`/`403`, or a `cf-mitigated` header on any status), and `prefill_blocked` reports that as what it is: the URL is fine, a retry fetches the same wall, and telling the user their URL was malformed instead would be a lie. Defeating a challenge is out of scope by choice; rotating User-Agents or proxying to get around one is not a fix, it is a lie told to the site instead of the user.

**No board is currently known to block us.** `prefill_blocked` guards a state that is real and cheap to report, but as of 2026-07-17 nothing in production is observed to be in it.

<details>
<summary><strong>Why this section named TokyoDev until 2026-07-17, and why it no longer does</strong></summary>

It claimed TokyoDev answered any non-browser client with `403` + `cf-mitigated: challenge`, "with our User-Agent and with a stock Chrome one alike". That claim did not survive scrutiny, and the way it failed is worth keeping.

**Every `403` behind it was seen from a laptop, and none from this service**: confirmed with the author, who ran the probes locally and never from inside the container. That alone sinks the claim: until `v1.4.3` the IPv6-first bug killed every connect to a Cloudflare-fronted host with `ENETUNREACH` before a packet left the box, and TokyoDev is one, so the `api` service had **never reached TokyoDev at all**. A statement about how a site answers *us* had been assembled entirely from observations of how it answers *something else*.

What that something else was doing matters too: **fetching many TokyoDev URLs at once**, during the debugging session that produced this release. Bot mitigation scores the client it answers, so a burst is itself a known way to be challenged: the observation may well have been the site reacting to the probe rather than stating a policy. That much is inference, not proof; the site could equally have been in a defensive mode that hour. But it does not need proving, because the claim was never tested against the path it described.

Re-probed on 2026-07-17, TokyoDev answered `200`: six of six to this service's exact `User-Agent`, and to a stock Chrome one likewise. **Those probes were from a laptop as well**, and by the second rule below they cannot speak for the container either; what they establish is only that the block was neither standing nor UA-based, which is enough to sink the claim as written. The evidence that actually speaks for this service is production: pre-fill against a TokyoDev posting works.

Two rules this leaves behind. **A self-inflicted block is indistinguishable from a real one at the moment you observe it**: probe a third-party site one request at a time, or the finding is about you rather than about the site. And **a claim about how a site treats this service has to be measured from this service**: a laptop and the `api` container differ in IP, in reputation, and (as this very release proves) in whether they can reach the host at all. Nothing here is fixed by probing more politely from the wrong machine.

</details>

#### `Applications::TalkingPointsService`

Cover-letter talking points (`v1.10.0`): the concrete overlaps between the user's resume and the posting, returned as bullets. **Bullets, not a draft, by decision**: a generic AI voice is the real risk in a market where the letter *is* the signal, so this extracts match points and stops; the user writes the letter. It **reuses the Claude pipeline `UrlPrefillService` established** (the same `anthropic` gem, the same Haiku model, the same tool/JSON-schema for typed output), and adds the one new thing the feature needs: it reads *both* documents at once, the resume as a base64 **PDF document content block** and the posting text beside it. The posting text is `posting_snapshot` when captured, else `notes`. `POST /api/v1/applications/:id/talking_points` returns `{ points: [...] }`; **nothing is persisted**, the points are generated on demand and shown for the user to draw from. Its error taxonomy is small and its own: `MissingInputError` → `talking_points_missing_input` (no resume, or no posting to compare it to) before any Claude call, `ConfigError` → `talking_points_unavailable` (no `ANTHROPIC_API_KEY`), `ExtractionError` → `talking_points_failed` (the model returned nothing usable).

#### `Demo::ResetService`

Wipes the shared "Try demo" account back to a clean seed. Invoked hourly by `DemoResetJob`, scoped to the demo user only. Without it, the shared account accumulates every visitor's data indefinitely.

#### `Exports::ApplicationsCsv` and `Exports::AccountArchive`

Signature: `new(user).call` → a `String` of bytes, ready for `send_data`. Each also exposes `#filename`, so the date-stamped download name (`karirkalyan-applications-2026-07-12.csv`) is decided next to the bytes it names rather than in the controller.

They are services, not queries: a query answers a question about the data, and these two *produce an artefact* from it. What they share is the read (`user.applications` with `timeline_entries` preloaded), and that is deliberately not extracted into a common parent. Two subclasses of an `Export` base class, to share one `includes`, would be inheritance used as a hiding place.

`ApplicationsCsv` is `CSV.generate` over the columns a spreadsheet can hold, blobs excluded and replaced with `has_resume` / `has_cover_letter` booleans. It **quotes every field (`force_quotes: true`)** and prefixes any cell that opens with `=`, `+`, `-`, or `@` with a single quote: a company literally named `=cmd|...` is a CSV-injection payload the moment the file is opened in Excel, and this is a file we hand a user and expect them to open in Excel. The escape is the [OWASP-recommended](https://owasp.org/www-community/attacks/CSV_Injection) one.

`AccountArchive` builds the zip described under § API contract → Exports.

#### `AllowedHosts`: `app/lib/allowed_hosts.rb`

Host-authorization patterns for Rails' `HostAuthorization`. **The patterns here are deliberately un-anchored.** `HostAuthorization::Permissions#sanitize_regexp` wraps every pattern as `/\A#{pattern}(:\d+)?\z/`: Rails anchors it for you and appends an optional port group. Adding your own `\z` makes that port group unmatchable and blocks `api.railway.internal:3001`, the `Host` on every internal web→api call, which 403s the entire API.

This is documented because it already happened once and took production down (CHANGELOG v1.0.1). **Verify a framework's own normalization before "hardening" a pattern it owns.**

#### `JobBoard`: `app/lib/job_board.rb`

`JobBoard.from_url` strips a URL to a host key (`linkedin.com`). The `JobBoard::NONE` sentinel selects applications added without a link. There is no `source` column and no per-board parser.

### Query layer

> **At a glance** · `api/app/queries/`, the read-side counterpart to services: non-trivial read models that mutate nothing. Two live here: `ListQuery`, which turns the application index's filter and cursor params into a page of records, and `GhostRiskQuery`, which flags applications the user has probably been ghosted on.

Services exist for *writes*: an explicit user action changes state (§ Service layer). Query objects are the read-side counterpart: a non-trivial read model that mutates nothing. `app/queries/` holds them.

A read model earns a query object when it is **more than a scope**: `GhostRiskQuery` composes a window function with a percentile aggregate, and `ListQuery` composes four filters with cursor decoding and a lookahead. A one-line `where` does not qualify and belongs on the model.

#### `Applications::ListQuery`

Signature: `new(user:, status:, company:, source:, japanese_level:, after:, limit:).call`; every filter keyword is optional and nil-tolerant. Backs `GET /api/v1/applications` and nothing else. Returns `{ records:, next_cursor:, has_more: }`; the controller renders that into the `{ data, meta }` envelope of § Cursor pagination and does nothing else.

> **At a glance** · Applies the `status` / `company` / `source` / `japanese_level` filters, decodes the `after` cursor, clamps `limit` to 1–100, and fetches `limit + 1` rows to learn whether a next page exists. All filtering is server-side and composes with pagination.

**Why it is a query object at all**, given it wraps no exotic SQL: the filters are the growth axis. `ApplicationsController#index` previously inlined filtering, cursor decoding, and the lookahead in one method, and the market-layer filters land on this exact read path, each one thickening a controller action rather than composing into an object built to hold them. Extracting first is what stopped that: `japanese_level` (`v1.8.0`) arrived as one `filter_by_*` method and one keyword, which is the point.

**`japanese_level` is a comma-separated list with `status`'s exact contract**: members are intersected with `Application::JAPANESE_LEVELS`, the survivors OR within the filter and AND against everything else, and a list left with nothing after the intersection is unfiltered, never `where(japanese_level: [])`'s silent zero rows. One deliberate reading: the filter matches the *recorded* value, so `japanese_level=none` selects postings recorded as requiring no Japanese, not postings with a null column: null means unrecorded, and there is no query for it, the same honesty rule as `JobBoard::NONE` being an explicit sentinel rather than an absence.

**Ignoring bad input rather than rejecting it** is the deliberate contract, inherited from the pre-extraction behaviour and now stated in one place. An unknown `status` (not in `ApplicationFSM::VALID_STATES`), a malformed `after` cursor, and a non-numeric `limit` are each dropped, and the request returns the first page rather than a `422`. These params come from navigation (a stale bookmark, an edited URL), not from a form, and a browsable list that 422s on a typo'd query string is worse than one that shows the unfiltered page.

The `source` filter is a host substring match (`ILIKE`), not a column: § `JobBoard` explains why there is no `source` column, and `JobBoard::NONE` selects applications with no link at all. `sanitize_sql_like` escapes the pattern, so a `%` in the param is a literal `%`.

#### `Applications::GhostRiskQuery`

Signature: `new(user:).call`. Answers one question: **which applications has the user probably been ghosted on?**

> **At a glance** · It reads each `timeline_entries` row as an *exit* from a stage, derives how long every stage took, and flags an application still sitting in a monitored stage (`applied`, `phone_screen`) past the user's own p90 response time. No new column, no new table: the audit log already holds everything it needs.

<details>
<summary><strong>How time-in-stage is derived from the audit log (and why the obvious reading is wrong)</strong></summary>

The `ghosted` state has always existed in the FSM, but nothing ever *suggested* it: the user had to notice the silence themselves, which is precisely the thing a person in the middle of a job search is bad at. This query turns the audit trail the app already keeps into the suggestion. It needs no new column and no new table: `timeline_entries` already records `from_status`, `to_status`, and `created_at` for every move, which is enough to reconstruct how long every application sat in every stage.

**Deriving time-in-stage.** The obvious reading ("an application entered stage `S` at the `created_at` of its `to_status = S` row") is wrong here, and wrong in a way that silently discards most of the data. Creation writes no timeline entry (§ `timeline_entries`), so an application added directly as `applied` (the common case, since people add jobs they have already applied to) has no `to_status = 'applied'` row to anchor on.

So read each row as an **exit**, not an entry. Every timeline entry is an exit from its `from_status`; the moment that stage was *entered* is the previous entry's `created_at`, or, when there is no previous entry, the application's own start:

```sql
COALESCE(
  LAG(created_at) OVER (PARTITION BY application_id ORDER BY created_at),
  applications.applied_at,
  applications.created_at
)
```

That single expression covers every case. A backdated `applied_at` (the create form accepts one) correctly dates the first stage from the real application date rather than the day the row was typed in. A revival (`ghosted → applied`) has a preceding entry, so `LAG` wins and the reset `applied_at` (the known sharp edge in § `Applications::TransitionService`) never gets a chance to corrupt the interval. And a `wishlist` application whose `applied_at` is null falls through to `created_at`.

**What counts as a response.** The sample must measure *how long the company took to reply when it replied at all*, so exits to `ghosted`, `withdrawn`, and `archived` are excluded. Including `ghosted` in particular would be self-defeating: every application the user marks ghosted after a long silence would push their own threshold up, and the predictor would grow steadily more reluctant to predict. Everything else is a response: an advance up the pipeline, or a rejection.

</details>

**The threshold.** Per stage in `RISK_STAGES = %w[applied phone_screen]` (the two stages where the next move is the company's and silence therefore means something), take `percentile_cont(0.9)` over the user's own completed response times. An application currently sitting in that stage past its threshold is *likely ghosted*. p90, not the median: the claim is "you are outside the range where replies normally arrive", and being wrong here is expensive in both directions: a false flag invites the user to close a live application.

Cold start is the real design problem, and it is handled in three parts:

| Guard | Value | Why |
|---|---|---|
| `MIN_SAMPLE` | `5` responses in that stage | Below this a p90 is one lucky outlier. Falls back to the default. |
| `DEFAULT_P90` | `applied: 21`, `phone_screen: 14` days | Ordinary hiring-timeline heuristics, used until the user has their own history. |
| clamp | `7 … 90` days | A user whose few replies all landed same-day would otherwise get a 2-day threshold and see every application flagged. The floor is a guard against confident nonsense; the ceiling stops one 200-day outlier from disabling the feature. |

The payload names which of the two applied (`basis: "personal" | "default"`) and the sample size behind it, and the UI says so. A number this consequential should not arrive unexplained.

<details>
<summary><strong>Why two stages, and why the defaults are what they are</strong></summary>

Ghosting is the mainstream case, not an edge case: [53% of job seekers were ghosted by an employer in the past year](https://www.ihire.com/resourcecenter/employer/pages/53-percent-of-job-seekers-have-been-ghosted-by-a-potential-employer) (up from 38% in 2024), and [61% report being ghosted *after* an interview](https://blog.theinterviewguys.com/the-2025-ghosting-index/), which is why the flag covers `phone_screen` and not just `applied`. The same research breaks it down by stage (28% after application, 16% after a phone screen, 12% after multiple interviews), a distribution the `DEFAULT_P90` pair is sanity-checked against: silence after an application is both commoner and tolerated longer than silence after someone has spoken to you.

</details>

### API contract

> **At a glance** · All routes are JSON, all under `/api/v1`, all authenticated and scoped per-user (cross-user access → `404`, never `403`). Errors share one envelope: `{ error, code, details? }`; clients branch on the stable `code`, never the English `error`. Endpoint list, error-code table, and payload shapes below.

All routes are JSON. Every error response is:

```json
{ "error": "<English sentence>", "code": "<stable_code>" }
```

`error` is a single human-readable string, never an array; validation failures join their messages into it. `code` is the machine-readable half of the contract: a stable snake_case identifier that `web/` can key its message catalog on, so localization never has to parse English prose. The full code table is below. `validation_failed` responses additionally carry the failing fields:

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

`details[].code` is the ActiveModel error type (`blank`, `inclusion`, `too_long`, …), so a catalog can localize per field without string-matching the sentence.

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
GET    /api/v1/applications/:id/resume            send_data, PDF, nosniff
GET    /api/v1/applications/:id/cover_letter      send_data, PDF, nosniff
GET    /api/v1/transitions                        the FSM's effective transition table
GET    /api/v1/dashboard                          SQL aggregation + facets + ghost risk + user
GET    /api/v1/me                                 authenticated user's profile

GET    /api/v1/exports/applications               CSV of every application; text/csv
GET    /api/v1/exports/account                    full account archive; application/zip

GET    /up                                        deep health check; pings Postgres
GET    /api-docs                                  Swagger UI (rswag)
GET    /api-docs/v1/swagger.yaml                  generated from request specs
```

Every record is reached through `current_user.applications`, so cross-user access returns `404`, not `403`.

#### Error codes

Every `code` the API can return, with the status it rides on. The status is still meaningful on its own (a `409` is retryable, a `422` is not), but the code is what clients should branch on.

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
| `prefill_paste_too_long` | `422` | A pasted posting exceeds `MAX_TEXT_CHARS` (12,000) **once stripped to text** (`PasteTooLongError`). Only the paste path raises it: a fetched page over the cap is truncated in silence, because the user never saw its length. Measured server-side on purpose: the browser cannot know the stripped length without a second copy of `to_text` |
| `prefill_unreachable` | `502` | The pre-fill page could not be fetched: DNS, connect, TLS, timeout, redirect loop, or an HTTP error the site did not refuse us with (`FetchError`) |
| `prefill_failed` | `502` | The page was fetched but yielded nothing usable: no readable text (`UnreadableError`), or the Claude call failed or came back empty (`ExtractionError`) |
| `prefill_unavailable` | `503` | `ANTHROPIC_API_KEY` missing; the rest of the app keeps working |
| `push_unavailable` | `503` | VAPID keys missing: the subscribe endpoints only; the rest of the app keeps working. The same degradation pattern as `prefill_unavailable`, and the reason the VAPID env vars are optional rather than required (§ Push notifications) |

Codes are append-only: renaming or removing one is a breaking change to `web/`'s message catalog, adding one is not (unknown codes fall back to status-keyed copy). `/up` also returns `503` when Postgres is down, but it is a health probe with its own body shape (`{ status, checks }`), not part of this error contract; and for the same reason it carries no OpenAPI path. It is infrastructure, not API; its absence from `swagger.yaml` is deliberate, not a missing rswag spec.

#### The transition table: `GET /api/v1/transitions`

A Kanban board must know which drops are legal *before* the drop, and `ApplicationFSM::TRANSITIONS` is the only source of truth: the shape cannot be guessed from the state list (revival paths like `ghosted → applied` are legal; most forward skips are not). So the API serves the table read-only:

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

`active_states` is the seven stages where the application is **still in play**: where a pending follow-up is actionable, and chasing it could still change the outcome. It is **not derivable from the rest of the payload**: it is the thirteen states minus `TERMINAL_STATES` *and* minus `rejected`, `ghosted`, `withdrawn`, which are non-terminal (each revives to `applied`; see § State machine) yet are not stages you are waiting on anyone in. Only `ApplicationFSM` knows that distinction, so `ApplicationFSM::ACTIVE_STATES` owns it and this endpoint serves it.

It is **served rather than mirrored in TypeScript** because it is now a filter contract. As a display detail (dimming an overdue-follow-up warning on a dead row), a hardcoded frontend set was survivable. As the definition of what the stage filter's "Active" preset selects and what the board gives columns to, it is FSM vocabulary that the user acts on, and a re-typed copy in a second language is the one thing this codebase does not permit (§ State machine). The rule here is the same one that governs `transitions` itself: a fetched copy cannot drift, a re-typed copy can.

`terminal_states` is consumed the same way and for the same reason. It decides whether the status help calls a state permanent, and whether the confirm shown before a move (on the board's card menu and the detail page's transition buttons alike) warns that the move is irreversible. Those are user-facing claims about the FSM, so a state promoted to terminal in Ruby would leave all three lying. It is fetched, never re-typed.

**A missing `terminal_states` degrades to silence, not to a claim.** `apiFetch` casts rather than parses and `web/` and `api/` are separate Railway services, so a payload predating a field can still arrive with `ok: true` mid-deploy. An empty list therefore reads as *unknown*, and the permanent badge and the permanent/reopenable line render as **neither**: the FSM always has three terminal states, so empty is never a real answer. Defaulting to "reopenable" would swap one lie for another: the point is not to withhold the scary half, it is to make silence unclaimable in either direction.

`entry_states` is consumed by the one screen that needs it: the new-application form builds its status picker from it, rather than hardcoding the three options `ApplicationFSM::ENTRY_STATES` lists. This is the create path, not a display detail: `Api::V1::ApplicationsController` rejects a create outside the entry set with a `422`, so a copy gone stale would either hide a state the API accepts or offer one it refuses. Only the *set* is fetched; which member is pre-selected is a form default (`draft`, matching the API's own fallback when no `status` is sent) and falls back to the first offered state if `draft` ever leaves the set.

**A missing `entry_states` drops the picker rather than guessing one.** The reasoning is `terminal_states`' above: an empty entry set cannot be real, so it reads as *unknown*. With no picker the form sends no `status` and the API applies its own default: the created application is still correct, and the user can move it afterwards through the FSM, which is the one path that was ever authoritative. Rendering a guessed set would be the "reopenable" mistake in create's clothing: an invented claim about the FSM that the API may answer with a `422`.

`transitions` maps **every** state through `ApplicationFSM.valid_next_states`, so the archived rule (any non-terminal state → `archived`, an early return in `assert_transition!`, not a row in `TRANSITIONS`) is already folded in: this is the *effective* table, not the raw constant. Terminal states map to `[]`. The payload is static per deploy and authenticated like every other route.

Consuming this at runtime is the sanctioned alternative to mirroring the table in TypeScript: a fetched copy cannot drift from the server, a re-typed copy can. The server still rejects illegal transitions regardless; the client's copy only decides what *looks* droppable.

#### Cursor pagination

`GET /api/v1/applications?after=<base64_cursor>&limit=20`. Limit clamped 1–100, default 10. Response: `{ data: [...], meta: { next_cursor, has_more } }`. The cursor is a Base64 `created_at` in ISO-8601 with microseconds; a malformed cursor is ignored and returns the first page rather than erroring. Manual implementation, no gem: roughly 20 lines, and it shows understanding rather than gem reach.

Filters compose with pagination server-side: `status` (comma-separated list of states), `company` (exact), `source` (host substring, `ILIKE`), `japanese_level` (comma-separated list on `Application::JAPANESE_LEVELS`). The mechanism (filters, cursor decoding, the `limit + 1` lookahead behind `has_more`, and the rule that bad input is ignored rather than rejected) lives in § `Applications::ListQuery`; the controller only renders what it returns.

`status` takes a **list**: `status=applied,phone_screen,offer` matches a row in *any* of them. The list ORs within itself and still ANDs against `company` and `source`. It is intersected with `ApplicationFSM::VALID_STATES` and unknown members are dropped, which is what keeps the change invisible on the wire to a client that only ever sends one: `status=applied` is a one-element list and behaves exactly as it always has.

**An empty or all-unknown list is `UNFILTERED`, the same as `nil`**, not an empty result. `where(status: [])` matches zero rows *silently*, so the literal reading would make junk input return a blank page, contradicting § `Applications::ListQuery`'s contract that bad input falls back to the unfiltered first page. A list with nothing left after the intersection has therefore told the server nothing, and is treated as nothing. This is the defence for a hand-edited URL, not an interface: a client that wants to show no rows must not ask the server for them: "show nothing" is a client-side state, because there is no query that means it.

#### The ownership check: `GET /api/v1/applications/ownership_check`

The mechanism most candidates learn the hard way has a name: candidate **ownership**. The first agency to submit you to a company owns that candidacy for roughly 12–18 months, and the placement fee goes to the owner even if you later reach the same company through another channel, so a second submission is damaging, not merely wasteful, and most candidates don't know the rule exists. This endpoint answers one question before the damage is done: **does an agency already have an open window on this company?**

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

The rules, each deliberate:

- **A submission is an application to that company with `channel = "agent"` whose `applied_at` falls within `Agency::OWNERSHIP_WINDOW_MONTHS`** (18, the conservative end of the researched 12–18, because the warning's job is to fire while the window *may* still be open; § Data model → `agencies`). `applied_at` is the submission date on purpose: a `wishlist` or `draft` row was never submitted, so it starts no window.
- **An agent submission with no agency recorded still counts**, with `agency_name: null`. Someone owns that candidacy, and not knowing who is the more dangerous case, not a safer one.
- **`company` is matched exactly**, the same rule as the list's `company` filter: both read the user's own vocabulary back to them. A blank `company` returns an empty `submissions` list rather than a `422` (the ignore-bad-input contract: the form calls this as the user works, and an error would be noise).
- **Nothing blocks.** The FSM has no opinion, the create endpoint accepts the application regardless, and the response is a warning surface only. The new-application form calls it when the company field settles and shows the warning whenever `submissions` is non-empty, *whatever channel the new application uses*: the fee rule bites on any second submission while a window is open, not only on a second agent.

It lives on `ApplicationsController` as a collection route rather than in a query object: it is one scope (`Application.open_ownership_submissions`), and § Query layer's own rule says a read that small belongs on the model.

#### The dashboard payload: `GET /api/v1/dashboard`

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

`at_risk` is sorted longest-silence first and carries `lock_version`, so the UI can offer the `ghosted` transition inline without a second fetch: the whole point of the feature is that seeing the problem and resolving it are one click apart.

**`user` is the former `GET /api/v1/me` payload, folded in.** The dashboard is the only page that wanted it, and it was fetching both endpoints in parallel anyway: one wasted request per load. `/me` still exists (it is a documented endpoint and costs nothing), but `web/` no longer calls it.

**Caching.** The aggregation is the heaviest work in the app and runs on every dashboard load, so it is memoized in Solid Cache under a self-expiring key: the user id, their application count, and `MAX(updated_at)`. Every status change goes through `TransitionService`, which bumps `updated_at`, so the key changes exactly when the numbers could have changed, and no manual invalidation is needed. `expires_in: 12.hours` is a safety net, not the mechanism.

Two things the key has to carry beyond the data:

- **`STATS_CACHE_VERSION`**: bump it whenever the payload *shape* changes. A data-derived key cannot see a deploy: unchanged rows would keep serving the old shape to new code.
- **`Date.current`**: ghost risk is a function of *elapsed time*, and elapsed time is invisible to a key built from rows. Without the date, an application could cross its threshold and stay unflagged for up to twelve hours, because nothing about it changed; that is exactly the point. Including the date recomputes the payload once a day per user, which is the right granularity for a threshold measured in days.

`user` is merged in *outside* the cached block. It is a cheap read, and keying application stats on a user record would be a category error.

#### Dashboard filters: derived from the URL, no new column

Company is a stored field; the "job board" is derived crudely from the URL host already stored. Every filter control is **interdependent** (faceted): picking TokyoDev narrows the company list to TokyoDev companies, and vice versa. Rather than re-query per selection, the cached stats endpoint ships a compact `facets` array, and the dropdowns and counts are computed from it on the client, so narrowing is instant with no round trip. If a change makes the other selection impossible, it is cleared, so a dropdown value can never point at a hidden option.

**`v1.10.0` widened `facets` from a `[company, board]` pair to a `[company, board, status, japanese_level]` tuple** (`STATS_CACHE_VERSION` bumped once), and the client now computes **disjunctive faceting across all four filters**: each facet's counts reflect the *other* active filters, never its own selection, so a stage chip's count narrows when you pick a company and the Japanese-level dropdown finally has counts. This closed two same-shape debts at once: the stage chips previously read `by_status` (grand totals that ignored company/board, so "12 phone screens" stayed 12 after picking a company), and the Japanese-level dropdown was deliberately count-less pending exactly this reshape (below). The stage filter constrains the *other* facets only when it is a real subset; all chips lit is unfiltered, so a full chip row narrows nothing.

The tradeoff is honest: host-substring matching is approximate (a job added without a link buckets under "No link"), and one facet pair per row does not scale forever. At personal-tracker volume it is the right amount of effort, and deriving from data already stored beats asking the user to tag every row.

The **Japanese-level dropdown** (`v1.8.0`) is the fourth filter control. It shipped deliberately count-less, on the record that the `facets` payload's next reshape would carry its counts rather than migrating the shape twice; `v1.10.0` did exactly that (above), so it now cross-narrows and shows counts like the other three. Its options are still the fixed `Application::JAPANESE_LEVELS` taxonomy plus "All": every level renders, and one with no matching rows shows `0` rather than vanishing, which is honest and needs no dangling-selection guard.

**The filter state lives in the URL (`v1.10.0`), so a filtered view is linkable, reload-survivable, and back-button-correct.** The four filters become query params (`status`, `company`, `source`, `japanese_level`), and three rules carry over from the wire rather than being invented. (1) **Absent params are the unfiltered list**: a full chip row already sends no `status`, so the default view keeps a bare URL and a complete chip set never serialises thirteen names. (2) **A pasted URL filters the first paint**: `dashboard/page.tsx` reads `searchParams` into its initial `/applications` fetch, so a shared link renders filtered from the server rather than arriving unfiltered and correcting client-side. (3) **Junk degrades to unfiltered, never to empty and never to a `422`**: server-side that is `ListQuery`'s existing ignore-bad-input contract (§ Query layer); client-side, a `status` param whose members are all unknown intersects against the rendered chips to nothing and so also reads as unfiltered. The routing goes through `i18n/navigation` (`useRouter`/`usePathname`), never the `next/navigation` originals, so the locale prefix survives; and it uses `replace`, not `push`, because refining one view is not navigation and should not stack history. **One decision recorded here:** the zero-chips "show nothing" state is deliberately **not shareable**. An empty status list reads as unfiltered on the server (rule 3), and there is no sentinel param for "nothing"; it is a client-only transient, so it sends no `status` and reads as unfiltered on reload, rather than growing a wire encoding for a momentary UI state.

The **stat cards** (`v1.10.0`) ride the same payload: `response_rate` and `ghost_rate` (percent of *applied* applications, the wishlist/draft rows excluded, that the company replied to or ghosted, read from `timeline_entries` so a later revival does not erase that a reply happened) and `avg_days_in_stage` (the mean of the board's `days_in_stage` anchor across in-flight applications). Each is `null` until there is data, and the card hides rather than showing a misleading `0%`. They are cards beside the existing `avg_days_to_offer` line, not a dedicated `/insights` route: a new page and nav weight for one user is not worth it, and if the cards ever earn promotion the queries move with them. `DashboardController` owns all of it; the cache key (`count + MAX(updated_at) + Date.current`) already changes exactly when any of these could.

The **stage chips** are a third filter type beside these two dropdowns, and the boundary between them is load-bearing. Chips OR within themselves and AND against company and board, so the presets above them ("All", "Active", "None") rewrite only the chip selection: clicking "All" restores every stage and **keeps** the chosen company. Resetting all three is what "Clear filters" is for; a control inside the stage group that also cleared a dropdown would drop a filter the user never asked to lose. One chip renders per status that *has* rows (`by_status` is `group(:status).count`), so the row is however many stages the user has actually used, not all thirteen; and it is sorted against `states` from the transition table, because `GROUP BY` without `ORDER BY` returns plan order and the chips would otherwise reshuffle between reloads.

#### Exports: two endpoints, two different jobs

Both live on `Api::V1::ExportsController`, both stream through `send_data`, and both are scoped to `current_user`. They look like one feature and are not:

| | `GET /exports/applications` | `GET /exports/account` |
|---|---|---|
| Media type | `text/csv` | `application/zip` |
| Contains | applications, one row each | applications, timeline, resumes, cover letters, user |
| Built by | `Exports::ApplicationsCsv` | `Exports::AccountArchive` |
| It is for | reading the data somewhere else | **getting the data back** |

The CSV is a **convenience view**: a spreadsheet, one row per application, no blobs and no timeline. It recovers a table, not an account. Its columns are a **hand-curated allow-list** (`Exports::ApplicationsCsv::COLUMNS`), not every column: the Japan-market and visa layers (`channel`, `japanese_level`, `sponsorship`, `status_of_residence`, `hiring_entity`, the comp structure) are deliberately absent, because the CSV is the *legible* view and a dozen market columns turn a readable spreadsheet into a database dump. Completeness is the archive's job, not this one's: `account.json` carries every column via `as_json`, so nothing is lost, only relocated to the artefact built to hold everything. Adding a market column here is a decision to make the convenience view less convenient, taken column by column, not a default.

The archive is the **data-safety artefact**, and the reason this exists at all: the real job-search history lives in one Railway Postgres, and the Hobby plan has no managed backups. Scheduled `pg_dump`s cover that from the outside (§ Deployment); this covers it from the inside, and is the leg the user can pull without a provider, a cron runner, or a shell. It contains `account.json` (user, every application with every column, every timeline entry) plus the PDFs under `resumes/` and `cover-letters/`, named by `Application#download_basename` (§ Download filenames), the same method the per-application download endpoints use, so a file means the same thing whichever door it left by. `account.json` carries a `schema_version` so a future importer can tell what it is reading, and each application row names its own files, so the mapping survives even when a segment is unhelpful: the id in the name is what makes it unique, the company and role are only there to be readable.

**One archive-only detail:** rubyzip writes UTF-8 entry names but leaves the EFS flag (general-purpose bit 11) unset by default, which is mojibake in strict extractors the moment a name is Japanese. `config/initializers/zip.rb` sets `Zip.unicode_names = true` once at boot.

**The archive is built in memory** (`Zip::OutputStream.write_buffer`), which is a deliberate cap, not an oversight: blobs are capped at 1 MB each, so the peak is bounded by `applications × 2 MB`; and since `v1.4.4` that multiplicand has a ceiling of its own, `Application::MAX_PER_USER` (§ Security), which puts the worst case at 400 MB. That is the honest number, not the expected one: a real account of a few dozen applications is a few dozen megabytes. A worst-case account is where this stops fitting in memory, and the fix then is streaming; the throttle below is what buys the time to notice.

**The download surface** is the export half of `app/components/profile-card.tsx`, rendered on `/dashboard`, its two links proxied to Rails by `app/api/exports/{applications,account}/route.ts`, the same `apiProxy` the resume and cover-letter downloads use, so the JWT stays server-side (§ Auth flow). Three rules that look like slips and are not:

- **The links render even when the card has no user to show.** The card's profile half is conditional on `stats.user`; its export half is not, and the gate must never be lifted to wrap the whole card. `/privacy` promises the user can get their data out, and this is the only surface in the app that honours it: gating it on a successful `/dashboard` fetch would remove it precisely when the data looks like it is in trouble, and remove it silently.

- They are **plain `<a>` tags**, not the `Link` from `i18n/navigation.ts`. These are API routes, not localized pages: a client-side navigation would fetch the route and do nothing visible. The ESLint rule `@next/next/no-html-link-for-pages` cannot tell the difference and is disabled on those two lines.
- There is **no `download` attribute**. Rails already sends `Content-Disposition: attachment` with the filename it chose (`karirkalyan-applications-2026-07-12.csv`), so the browser downloads rather than navigates, and the server stays the one place that names the file. Note this is the one disposition § Download filenames did **not** move to `inline`: an export is a file you are taking away, not a document you are reading.

`ProfileCard` **takes the user as a prop and never fetches one.** `/dashboard`'s own payload carries `user`, which is why the page makes no second `/me` request: that fold is what `v1.3.0` shipped, and a component that fetched its own user would quietly re-introduce the request on every page that imported it. It is a component rather than markup inlined in the page so an account or settings page can import it instead of copying it.

#### Download filenames

Every PDF this API hands out is named by **`Application#download_basename(kind:)`**, where `kind` is `:resume` or `:cover_letter`:

```
{company}-{role}-{MMDD}-{id}-{kind}.pdf     株式会社メルカリ-バックエンドエンジニア-0712-12-resume.pdf
```

Two callers, one method: `Api::V1::ApplicationsController#resume` / `#cover_letter`, and `Exports::AccountArchive#blob_path`. It lives on the model because the alternative is two implementations that drift, which is exactly the state `v1.4.4` found it in, the controller sending a hardcoded `resume.pdf` for every application while the archive built a different name from `parameterize`.

**Why each part is there.** The **id** is the uniqueness guarantee: same company, same role, same day is a real collision, and `company`/`role` are readable rather than load-bearing. The **`MMDD` stamp is the upload date** (`resume_updated_at` / `cover_letter_updated_at`, falling back to `created_at` for a legacy row with a blob but no stamp), and it earns its place *in the user's downloads folder*, not in the app: the app stores exactly one resume per application (`applications.resume` is a single `bytea`, and an upload overwrites it), so the stamp is what stops a re-uploaded resume's download from silently overwriting the copy of the old one already saved. It **disambiguates rather than guarantees**.

**The slugger preserves Unicode; it does not transliterate.** `parameterize` sends a Japanese company name to the empty string, but transliteration is the wrong cure: kanji→reading needs a morphological analyzer (日本 is *nihon* or *nippon* by context, and a wrong reading is worse than the kanji), a kana-only romaji gem strips kanji straight back to empty, and the ASCII fold is a constraint nothing here imposes. So the slugger **sanitizes and keeps**: Unicode letters and digits survive, display case is preserved (「Google」 beats 「google」, and case is a no-op for Japanese), everything else collapses to a single `-`, edges are trimmed, and each segment is capped at **20 codepoints**: per segment, with the stamp, id and suffix outside the count, since a single 20-char budget for the whole name does not close (`-cover-letter.pdf` alone is 17).

This needs **no gem and no encoding work in the controller**: `send_data` with a UTF-8 filename makes Rails emit both a legacy `filename="%3F%3F…"` (`I18n.transliterate`d, ignored by every browser since ~2011) and `filename*=UTF-8''…` (RFC 5987), which is what browsers actually read.

**A segment that sanitizes to empty is dropped, not placeheld**: `unknown`/`untitled` adds fake meaning where the id already carries the truth. Since `company` and `role` are both `null: false`, a segment only empties on an all-punctuation or emoji-only name, whose degenerate worst case is `0712-12-resume.pdf`. Still unique, still honest.

### Background jobs

> **At a glance** · Solid Queue on the primary Postgres: no Redis, no separate worker service. Workers run inside Puma (`SOLID_QUEUE_IN_PUMA`). Three recurring tasks: the follow-up reminder digest (08:15 JST, skipped on Japanese dead zones), finished-job cleanup, and the hourly demo reset.

**Adapter:** `:solid_queue` in production (`config/application.rb`), `:async` in development, `:test` in test.

**Workers run inside Puma.** `config/puma.rb` has `plugin :solid_queue if ENV["SOLID_QUEUE_IN_PUMA"]`; that variable must be set on the Railway `api` service. There is no separate worker service.

**Single database.** Queue and cache tables live in the primary Postgres via a normal migration (`20260710000002_create_solid_queue_and_solid_cache_tables.rb`). There are no `db/queue_schema.rb` / `db/cache_schema.rb` files and no `connects_to` / `database:` config. Keep it that way unless the app outgrows it.

**Connection pool.** `database.yml` sets `max_connections` to `RAILS_MAX_THREADS + 6`. Solid Queue's ~5 threads share the pool with Puma's request threads, and it *exits, stopping Puma with it*, if the pool is smaller than its thread count. This is not a tuning knob; it is a correctness constraint.

**Poll cadence.** Workers poll at 1 s (`config/queue.yml`), raised from the 0.1 s the app shipped with. Between requests the worker poll loop is the only continuously running work in the process, and at 0.1 s it issues ~36,000 queries an hour of pure allocation churn; Railway metrics showed the idle process creeping from ~0.35 GB after boot to ~0.49 GB over half a day with zero user traffic, and this loop is the main continuous allocator feeding that growth. What 0.1 s bought was job-start latency no job here can perceive: every job in the system is scheduled hourly or daily, and the enqueue-to-start delay of the digest's fan-out jobs is invisible next to SMTP and push-service round trips. The dispatcher already polled at 1 s.

**Recurring tasks** (`config/recurring.yml`):

| Task | Schedule | What |
|---|---|---|
| `follow_up_reminders` | `15 8 * * * Asia/Tokyo` | `FollowUpReminderJob`, 08:15 JST |
| `clear_solid_queue_finished_jobs` | hourly at :12 | Bounds the jobs table |
| `reset_demo_account` | hourly at :42 | `DemoResetJob` |

#### `FollowUpReminderJob`: one digest per user, deferred out of dead zones

The job runs every morning at 08:15 JST and does three things in order.

**1. It stops on a dead zone.** If today is not a business day in Japan (`JapanCalendar`, below), the job returns immediately: no timeline entries, no mail. A reminder that fires on 1 January is noise: nobody is reading it and no company is answering it.

**2. It collects what is due, including what is overdue.** The scope is `follow_up_at <= end of today` (JST), non-terminal, and no further back than `LOOKBACK` (30 days). Not "due exactly today"; that would make step 1 a *deletion*: a reminder falling inside Golden Week would be skipped on its day and never looked at again. Because the scope reaches backwards, a held reminder is simply picked up by the next business day's run, which is what "defer" means here.

The lookback is the other half of that: it bounds how far back "overdue" reaches, so a follow-up date set eight months ago and forgotten does not resurrect itself as a nudge. Past 30 days it is not a reminder, it is archaeology.

**3. It sends one email per user, not one per application.** Applications are grouped by user and handed to `FollowUpMailer#digest` as a batch. Three follow-ups due on the same morning are one email with three entries: the inbox cost of the feature scales with *days*, not with how well the search is going, which is the point. Timeline entries are still written per application: the timeline is the application's history, and "you were reminded" belongs on each one. Since `v1.6.0` the same per-user batch also feeds the digest's second channel: one `PushDigestJob` beside the mailer, no second claim (§ Push notifications).

#### Idempotency: keyed on the follow-up date, not the day it fires

Solid Queue guarantees at-least-once delivery. `FollowUpReminderJob` writes a `TimelineEntry` with `idempotency_key = "reminder-{application_id}-{follow_up_at as a JST date}"`. The check is **not** `exists?`-then-`create!` (that race is real); it relies on the unique index and rescues `ActiveRecord::RecordNotUnique` for true exactly-once. Same pattern as Stripe idempotency keys.

**The key is derived from `follow_up_at`, not from `Date.current`**, and that is what makes deferral safe. A reminder held through Golden Week and delivered on 7 May still carries the key of the date it was *set for*, so:

- the deferred send cannot double up with the run that held it, and
- an overdue application, which now sits in the scope every day until it is answered, is reminded **once** rather than every morning until the user gives up on us.

It also buys a property worth having on purpose: **moving `follow_up_at` re-arms the reminder.** A new date is a new key, so rescheduling a follow-up produces a new nudge, which is exactly what a user who moved the date meant.

(The old key was `reminder-{id}-{Date.current}`. Under the old "due exactly today" scope those two are the same string for every entry ever written, so the change is backward-compatible: no historical reminder re-fires.)

The `TimelineEntry` is written first, as the exactly-once anchor; the email is then decoupled via `deliver_later` onto the `mailers` queue, so a transient SMTP failure retries the email without duplicating the entry. Only applications whose entry this run actually *won* go into the digest.

#### `JapanCalendar`: `app/lib/japan_calendar.rb`

The dead zones, and the single place that knows what a business day in Japan is:

| Dead zone | Dates |
|---|---|
| Weekends | Saturday, Sunday |
| National holidays | via the `holidays` gem, region `:jp`, `:observed` |
| New Year (年末年始) | 29 December – 3 January |
| Golden Week | 29 April – 5 May |
| Obon (お盆) | 13 – 16 August |

`holidays` is a dependency rather than a hardcoded list because two of Japan's holidays are **astronomical** (春分の日 and 秋分の日 move with the equinoxes and are fixed by cabinet proclamation each February), and because 振替休日 (a holiday falling on a Sunday displaces the following Monday) is a rule, not a date. Both are exactly the kind of thing a hand-maintained array gets quietly wrong in a year nobody is looking. The `:observed` region is what turns substitute holidays on.

The last three rows are *not* public holidays and the gem does not know them. Golden Week's span is a run of real holidays with working days wedged between; Obon has no legal status at all. They are in the table anyway because the question this job asks is not "is the post office open" but **"will a company answer a nudge sent today"**; and in mid-August, it will not.

**Annual refresh cost: one `bundle update holidays`.** That is the whole maintenance surface, and it is why the gem earns its place under the perishable-facts rule in `TODO.md`.

#### Time zone

`config.time_zone = "Tokyo"`. `active_record.default_timezone` is deliberately **not** set, so timestamps are still stored in UTC; only presentation and `Time.zone`-based queries (such as the reminder job's "today", and the JST date inside its idempotency key) are JST. Comparing `DATE(follow_up_at)` in UTC gave JST users reminders a day early; the job uses zone-aware day boundaries throughout.

### Mail

> **At a glance** · Two mailers: `WelcomeMailer` (on account creation) and `FollowUpMailer#digest` (one per user per business day). Production sends via Resend over STARTTLS port `2587`, because Railway blocks 587/465.

`ActionMailer` is re-enabled in `config/application.rb` (the `--api` default disables it). Production sends via SMTP (Resend); development previews only; test collects in `ActionMailer::Base.deliveries`.

- `WelcomeMailer`: sent when an account is created, via `deliver_later`. Its only caller is the `users:create` Rake task (§ Registration is closed); it used to be the sign-up endpoint. `deliver_later` rather than `deliver_now` because with `raise_delivery_errors = true` a mail failure would take the account creation down with it.
- `FollowUpMailer#digest(user, applications)`: from `FollowUpReminderJob`, one per user per business day. The subject names the company when there is exactly one application (*"Follow up on your Mercari application"*; the single case is the common case and deserves to read like a sentence) and counts them when there are several (*"3 follow-ups due today"*).

**Railway blocks outbound SMTP on ports 587 and 465**, so production uses Resend's alternate STARTTLS port `2587`. The `From:` domain must be verified in Resend first.

### Security

> **At a glance** · JWT auth with one JTI per user (sign-out revokes all devices). Rack::Attack throttles keyed per-IP *and* per-account/email through Solid Cache, plus a hard 200-application ceiling per account, which is the only thing that bounds storage. Optimistic locking on writes, magic-byte-checked uploads, `nosniff` downloads, credentials filtered from logs.

- **Auth**: Devise + devise-jwt. The JWT is issued in the `Authorization` response header. **One JTI per user**, via `JTIMatcher`: sign-out rotates it and therefore revokes *all* devices. 1-day expiry, no refresh flow. This is intended, not a bug. Passkey sign-in dispatches the identical token through the same middleware (§ Passkeys).
- **Rack::Attack**: throttle counters go through `Rails.cache` (Solid Cache), so they are shared across Puma workers rather than counted per worker.
  - **Every path guard keys off `Rack::Attack.normalized_path`, never `req.path`.** This is the one rule in this section that is load-bearing rather than descriptive. Rack::Attack runs *above* the router, so `req.path` is the raw `PATH_INFO`: the string the client typed. Rails normalises it afterwards, and routes far more strings to a controller than a naive `==` will match: `resources :applications` generates `(.:format)`, and Journey tolerates trailing and duplicate slashes. `POST /api/v1/auth/sign_in.json`, `.../sign_in/`, and `/api/v1/applications//12` all reach their action. A guard written as `req.path == "/api/v1/auth/sign_in"` returns `nil` for all three, and a `nil` key means *no counter and no limit*, so the guard fails **open**, and the throttle becomes opt-out by suffix. `normalized_path` collapses duplicate slashes, strips a format extension and a trailing slash, and memoises on the Rack env like `account_id`. **The general rule, which outlives this file: anything above the router sees the string the client sent; anything below sees the string the framework decided it meant. Never key a security control off the former.**
  - `sign_in`: per-IP, plus **email-keyed** throttles (`10/5min`, `50/hour`) capping guesses against a single account across all IPs. IP-only throttling is defeated by a botnet or a shared NAT egress. The sign-up endpoint `sign_in` used to sit beside is gone (§ Registration is closed), and with it the spam-account and outbound-mail vector that its 3/hour cap existed to close; the unauthenticated writes left are `sign_in` and the two passkey ceremony paths, whose per-IP throttle (and why it has no email-keyed backstop) is in § Passkeys.
  - `prefill`: per-IP, plus **per-account** caps (10/min, 50/hour, 100/day) keyed on the JWT `sub`. The endpoint costs money (a Claude call plus an outbound fetch), so an uncapped per-account path is a cost and abuse vector, most sharply through the shared demo login.
  - `exports`: **per-account** caps (10/min, 60/hour) keyed on the JWT `sub`, same decoder as prefill. Not a money vector, a *work* vector: `/exports/account` reads every blob the user owns and assembles the zip in memory, so a signed-in client looping it is the cheapest way to push this app over its memory ceiling. The cap is per-account rather than per-IP because the cost is a function of whose data is being assembled, not of where the request came from.
  - `passkeys/write`: **per-account** caps (10/min, 30/hour) on the two enrollment writes, with `Credential::MAX_PER_USER` bounding the total; reasoning, and the sign-in ceremony's own per-IP throttle, in § Passkeys.
  - `push_subscriptions/write`: **per-account** caps (10/min, 30/hour) on `POST /push_subscriptions`, with `PushSubscription::MAX_PER_USER` bounding the total; `DELETE` exempt (§ Push notifications).
  - `applications/write`: **per-account** caps (30/min, 300/hour) on `POST /applications` and `PATCH|PUT /applications/:id`, the two requests that carry a blob. Per-account for the same reason as exports. The throttle covers every write to those paths rather than only the ones with a file attached, because deciding *inside Rack middleware* whether a multipart body contains a PDF means parsing the body Rails has not parsed yet, to save a counter increment on a request that is cheap either way. `DELETE` is deliberately not throttled: it is the one write that gives storage back. `POST /applications/prefill` and `.../transition` do not match these patterns: prefill has its own caps above, and the path regex is anchored on `/\d+\z`.
- **The application ceiling**: `Application::MAX_PER_USER` (200), validated on create, is what actually bounds storage. **A throttle cannot do this job**: it bounds a rate over a window and every window resets, so any positive rate integrates to unbounded total. The exposure is real because an upload *overwrites* (`applications.resume` is a single `bytea` with no version history and a 1 MB cap), so a client looping `PATCH` holds its storage footprint flat at 2 MB per application, while `POST` buys another 2 MB of allowance each time, on a database whose whole backup story is a nightly `pg_dump` (§ Backups). 200 × 2 MB bounds the worst case at ~400 MB. It sits well above a real job search (100–300 applications is a long one) and the breach is recoverable by deleting a row, which is why the number is allowed to be this close to real use.
  - It reports through the **existing** envelope, not a new code: the validation adds to `:base`, so `create` renders `validation_failed` with `details: [{ field: "base", code: "too_many_applications" }]`, the same shape the 1 MB upload cap uses for `too_long`.
  - The **shared demo** is the account most likely to reach it, and it heals itself: `DemoReset` destroys the demo *user* before re-running the seed (§ `Demo::ResetService`), so the ceiling cannot deadlock the reset that clears it: worst case the demo is full until the top of the hour.
  - **It is a bound, not an invariant.** The check is a `count` in the same transaction as the insert with no lock, so N concurrent creates at 199 can all pass and overshoot by N-1. That is accepted: the cap exists to stop unbounded growth, not to make 200 exact, and a real guarantee costs a counter column and an advisory lock to defend a number chosen by judgement.
- **Optimistic locking**: a `lock_version` column activates Rails' built-in optimistic locking. Two concurrent writers: the second gets `StaleObjectError` → `409`. One column, one `rescue_from`, no library.
- **Uploads**: size is checked from multipart metadata *before* `.read`, so an oversized file never enters memory. Then the 1 MB model cap, then PDF magic-byte validation (`%PDF`), which cannot be spoofed by renaming a file. The frontend's `accept=".pdf"` is UX only.
- **Downloads**: `current_user`-scoped, `X-Content-Type-Options: nosniff`. PDF for the per-application files; the two export endpoints add `text/csv` and `application/zip`, and carry the same `nosniff` header for the same reason (a CSV that a browser decides to sniff as HTML is a stored-XSS delivery mechanism, and its cells contain user-supplied company names).
- **Param filtering**: `filter_parameter_logging.rb` filters `passw` and `email`; lograge logs `request.filtered_parameters`, so credentials do not leak into logs.

### Passkeys (WebAuthn)

> **At a glance** · Passkey sign-in via the `webauthn` gem, hand-wired into Devise. Discoverable credentials, no attachment restriction, `attestation: "none"`: the three settings that keep third-party providers (Proton Pass) in the chain. RP ID and origin derive from `FRONTEND_URL`; challenges are single-use five-minute entries in Solid Cache; a verified assertion dispatches the same devise-jwt token password sign-in does. Password sign-in stays forever as the fallback.

#### Why hand-wired instead of `devise-passkeys`

The `devise-passkeys` gem is not mature enough to lean on. The `webauthn` gem (cedarcode) is the reference Ruby server implementation and does the cryptographic work; what remains (challenge storage, the credential table, wiring a verified assertion into Devise's JWT dispatch) is a few dozen explicit lines, which is the same visibility argument as the PORO FSM.

#### The provider chain is the design constraint

The real authenticator is **Proton Pass**, reached through Chrome/Brave → Android Credential Manager (or the desktop extension), never Google Password Manager or the machine's own platform authenticator. Three settings keep that chain open, and each one closes it if flipped:

- **`residentKey: "required"`**: discoverable credentials, so sign-in needs no username first and the browser's own picker lists whatever provider holds the key. This is also what makes usernameless authentication work at all: the assertion, not a typed email, names the account.
- **No `authenticatorAttachment` restriction**: a `platform` restriction on desktop would demand the machine's own authenticator and bypass the Proton Pass extension entirely.
- **`attestation: "none"`**: attestation policy is how sites accidentally block third-party providers, and this app has no fleet-management reason to know which vendor minted a key.

Enrollment is **desktop-first** by design: a passkey created on Ubuntu (Brave + the Proton Pass extension intercepts the ceremony) syncs through Proton Pass to the phone, so there is no separate phone-enrollment flow. **Password sign-in stays forever as the fallback**: the chain above has more moving parts than a first-party one, and Brave has shipped real third-party-passkey regressions ([brave-browser#38345](https://github.com/brave/brave-browser/issues/38345), [#37984](https://github.com/brave/brave-browser/issues/37984)).

#### RP ID and origin: derived, never hardcoded, never widened

A passkey binds to an origin, and a mismatched RP ID fails the ceremony silently with an opaque browser error. Both derive from `FRONTEND_URL` in `config/initializers/webauthn.rb`, the env var CORS already requires, so the required set does not grow: the allowed origin is `FRONTEND_URL` itself, the RP ID is its **host** (`kk.chairulakmal.com` in production, `localhost` in development).

The RP ID is the full host, **never the registrable domain**: `chairulakmal.com` would make these passkeys assertable by every sibling subdomain, current and future; `awano.chairulakmal.com` already exists. The narrower ID costs nothing, because no second host needs to share these credentials.

#### Ceremonies and challenge lifecycle

Four endpoints, two ceremonies (§ API contract for the list). Every challenge is a **single-use** entry in Solid Cache with a five-minute TTL, consumed before verification so a replay finds nothing. On the authentication ceremony the consumption is **atomic**: the cache read enforces the TTL (an expired entry reads as nil before the store sweeps it), and the delete's own return value (one SQL `DELETE` in Solid Cache) is the single-use check, so of two concurrent verifications of the same assertion exactly one proceeds. Read-then-delete would be a TOCTOU race; registration's take alone is allowed that shape, because its window is an authenticated user racing themselves for the prize of enrolling their own passkey twice, which `external_id` uniqueness refuses anyway.

- **Registration** (authenticated): `POST /passkeys/options` generates options via `WebAuthn::Credential.options_for_create` (excluding already-enrolled credential IDs) and caches the challenge keyed by user id (one in-flight enrollment per user; a fresh options request overwrites a stale one). The first call also generates and persists `users.webauthn_id`. `POST /passkeys` verifies the attestation against the cached challenge and inserts the `credentials` row.
- **Authentication** (unauthenticated, usernameless): `POST /auth/passkey/options` generates options with an **empty allow-list** (discoverable credentials mean the browser picker, not the server, chooses) and caches the challenge **keyed by its own value**, since no user is known yet. `POST /auth/passkey` takes the echoed challenge plus the assertion; the echo is safe because a challenge is only accepted if it is sitting in the cache (server-issued, unexpired, unused) *and* the assertion cryptographically verifies over it. The credential row is found by `external_id`; its `user_handle` is cross-checked against the row's user's `webauthn_id`; `sign_count` is updated and `last_used_at` stamped on success.

Every verification failure on the authentication ceremony is one `401 invalid_passkey`, deliberately not enumerated (§ Error codes). Enrollment failures are `422 passkey_verification_failed`.

#### JWT dispatch: a passkey sign-in is a password sign-in from here on

`devise.rb`'s `jwt.dispatch_requests` gains `POST /api/v1/auth/passkey`: after a verified assertion the controller calls `sign_in(user, store: false)` and devise-jwt's middleware injects the same 1-day JWT into the `Authorization` response header that password sign-in produces. Nothing downstream can tell the difference: same JTI, so **sign-out still revokes every device regardless of how each one signed in**, and the JWT-never-reaches-client-JS invariant is untouched because the web half handles this response identically (§ Auth flow).

Rack::Attack throttles the two unauthenticated passkey paths per-IP as one family (10/min across options + verify; a ceremony costs two requests, so this is the same five sign-ins a minute the password throttle allows). There is no per-email backstop equivalent because there is no email in the request, and no guessing surface for one to protect: an assertion is a signature over a server-issued challenge, not a secret that enumeration erodes.

Enrollment is throttled too (while the shared demo login exists, every authenticated write is a public write), **per-account** (10/min, 30/hour), mirroring `applications/write`, with `DELETE` exempt for the same reason: it gives capacity back. The throttle bounds the rate; **`Credential::MAX_PER_USER` (20) bounds the total**, because a throttle cannot bound a total: every window resets (the `Application::MAX_PER_USER` argument, in miniature, with the same accepted caveat: it is a bound, not an invariant). The ceiling reports through the existing envelope (`validation_failed` with detail code `too_many_passkeys` on field `base`), the same shape as the application ceiling's.

Every ceremony rescue **logs before rendering its unenumerated failure**: the response is deliberately uninformative (see the error-code reasoning above), so without the log line a systemic regression that 401s every user would be indistinguishable from hostile junk. A rescue either re-raises or logs.

### Push notifications

> **At a glance** · Web Push as a second channel for the follow-up digest, via the `web-push` gem. Per-environment VAPID keys from two **optional** env vars: absent keys degrade the subscribe endpoints to `503 push_unavailable` and the digest to email-only. `FollowUpReminderJob` fans its already-claimed `won` set into one `PushDigestJob` per user beside the mailer; expired subscriptions self-prune. The browser half (the push-only service worker and the settings toggle that owns the permission prompt) is § Installable app § The service worker.

#### VAPID keys: per-environment, optional, never in the repo

The `web-push` gem signs every push with a VAPID keypair. The keys live in `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (plus `VAPID_SUBJECT`, which defaults in code to `mailto:` + the operator contact): Railway vars in production, `.env` in development, never the repo. **Each environment gets its own pair**, settled in `TODO.md` before this was built: a leaked or casually-shared dev key must not be able to sign a push to the production user. The cost is that a subscription binds to the environment that issued it: the browser stores the public key it subscribed with, so switching environments means re-subscribing, and that is the design working, not a bug. `bin/rails push:vapid` prints a fresh pair for pasting into either place.

**The vars are optional, not required**: deliberately the `ANTHROPIC_API_KEY` pattern rather than the `DEVISE_JWT_SECRET_KEY` one. With no keys the app boots and serves; `GET /push_subscriptions/public_key` and `POST /push_subscriptions` answer `503 push_unavailable`; `PushDigestJob` returns before touching the network; the digest stays email-only. This keeps the required env set unchanged, which matters under § Versioning: adding a required var is a deploy landmine and dropping one later is a major, while an optional var is neither.

#### Subscriptions

The browser mints a subscription (`endpoint` + `p256dh` + `auth`; § Data model) against the VAPID public key, which it fetches from `GET /push_subscriptions/public_key` rather than from a duplicated web-side env var: two services sharing a key by copy is drift waiting to happen, and the endpoint costs one authenticated request on the settings page.

`POST /push_subscriptions` **upserts on `endpoint`**: a push endpoint identifies one browser profile, so a re-subscription updates keys in place and reassigns the row to whoever is signed in: the endpoint's real owner is the browser, and the account association follows the session that registered it last. `DELETE /push_subscriptions` takes the endpoint in the body and is idempotent: unsubscribing a browser the server never knew about is a `204`, because the state the caller asked for is the state that obtains. Both writes are bounded the way every authenticated write here is (§ Security): a per-account throttle (10/min, 30/hour; `DELETE` exempt) and `PushSubscription::MAX_PER_USER` (10) bounding the total, reporting through `validation_failed` with detail code `too_many_push_subscriptions`.

#### Delivery: the digest's second channel, same exactly-once anchor

`FollowUpReminderJob` already claims each reminder through the `timeline_entries` idempotency key (§ Background jobs), and the claimed `won` set drives the mailer. Push adds **no second claim**: the same set now also enqueues one `PushDigestJob.perform_later(user, application_ids)` beside the mailer's `deliver_later`, gated on `PushVapid.configured?`, so email-only mode enqueues nothing rather than a job that would return immediately. The decoupling is the same as the mailer's and for the same reason: each channel's failure is handled on its own job, without re-running the reminder scan or double-sending the other channel, and the timeline claim remains the one exactly-once anchor for both.

`PushDigestJob` composes the notification from the same facts the email renders (the mailer's subject rule reused as the title, *"Follow up on your Mercari application"* / *"3 follow-ups due today"*, and the deep link `/applications/:id` for a single reminder and `/dashboard` for several) and sends it to every subscription the user holds, with a **24-hour TTL**: a digest that could not be delivered today is superseded by tomorrow's, not queued behind it. Copy is English-only and the deep links are locale-unprefixed, both **inherited from the mailer this channel mirrors** (§ Mail builds the same unprefixed paths onto `FRONTEND_URL`), a recorded inheritance, not an oversight; next-intl resolves the visitor's locale from the `NEXT_LOCALE` cookie on arrival, exactly as it does for the email's links.

#### A second push channel: interview and residence reminders (`v1.10.0`)

The delivery loop (send to every subscription, prune the revoked, return the first transient error so retry re-runs the whole job after every device got its attempt) is now `Push::Notifier`, extracted from `PushDigestJob` so a second channel reuses it rather than a drifting copy; `PushDigestJob` delegates to it, and its `retry_on` keys on `Push::Notifier::TRANSIENT_ERRORS` so the retry list and the loop cannot diverge. The new channel is `InterviewReminderJob`, a daily recurring job (08:00 JST, just before the digest) that pushes two things fed by data the pages already show: an **interview coming up within 24 hours** (the `interview_at` instant the `.ics` work structures; the daily cadence makes it a once-per-interview reminder, since each interview falls in exactly one run's window), and a **residence-expiry warning** as the days-remaining countdown crosses a threshold (`90/60/30/14/7`), carrying the same CoE lead-time guidance (`Visa::COE_LEAD_TIME_DAYS`) the settings page shows. The threshold set is what keeps a warning that stays true for ninety days from pushing every morning. **The service worker's notification `tag` is now payload-driven** (`payload.tag || "follow-up-digest"`): the digest keeps its historical fixed tag by sending none, while each interview (`interview-:id`) and the residence warning (`residence-expiry`) carry their own, so a retry replaces its own notification and two different subjects stay two notifications rather than collapsing into one.

**Delivery failures, and the retry that is declared rather than assumed.** Solid Queue has no implicit retry (an uncaught raise parks in `solid_queue_failed_executions`), so the job declares its own `retry_on` (three attempts, polynomial backoff) for the failures that plausibly pass later: network-level errors the gem does not wrap (`Net::OpenTimeout`, `SocketError`, TLS and connection resets) and the push service's `429`. A transient failure is **collected per subscription and re-raised only after the loop finishes**, so one flaky endpoint cannot cost the user's other devices their notification; and the retry's re-send is safe on devices that already got it, because the service worker tags the digest notification (`tag: "follow-up-digest"`) and a re-delivered push replaces the copy on screen instead of stacking a duplicate. The other two failure classes are terminal for the attempt: the push service's `404`/`410` (`WebPush::ExpiredSubscription` / `InvalidSubscription`) means the browser revoked the subscription and the row is **destroyed** (self-pruning, since browsers do not reliably fire `pushsubscriptionchange`), and any other push-service response is logged and skipped. A job that exhausts its retries parks in `solid_queue_failed_executions`, and tomorrow's digest supersedes whatever it could not deliver.

The launcher badge needs no code: on Android the notification itself produces the dot, which is why `TODO.md` scoped no badge work.

- **Structured JSON logging** via `lograge` in production: one line per request with `request_id`, controller, action, status, duration.
- **Error tracking** via Honeybadger in production; API key from an env var, never hardcoded.
- **`/up`** pings Postgres and returns `200` / `503`, so Railway's healthcheck fails fast on dependency loss. The Rails 8 default only checks that the app booted. It no longer pings Redis: there is no Redis.

---

## Frontend (`web/`)

### Frontend tech stack

| Technology | Alternative considered | Reason |
|---|---|---|
| Next.js 16 (App Router) | Vite + React | Needs a server to receive the JWT; see below |
| JWT in `httpOnly` cookie | `localStorage` | Token never touches client JS; XSS-proof |
| Tailwind CSS v4 | - | Utility-first; no UI library, no form library, no state library |
| Server components + server actions | Client-side data fetching | The token stays server-side by construction |
| `next-intl` | `react-i18next`, hand-rolled | App Router–native (RSC message catalogs, no client bundle for server copy); declares `next: ^16` |

#### Next.js 16 vs Vite

Vite is a pure client-side bundler. It has no server component, so there is nowhere to securely receive a JWT and set an `httpOnly` cookie; you would add an Express or Hono server just for that. Next.js route handlers do it in the same process with no extra moving part.

Second reason: Next.js 16 is already live in this portfolio at [awano.chairulakmal.com](https://awano.chairulakmal.com). Using the same framework for both lets a reviewer compare Rails and Next.js patterns side by side, rather than also comparing two frontend toolchains.

Vite would be right if this were a public app where a stateless token in `localStorage` was acceptable, or if a cookie server already existed.

### Design system

> **At a glance** · `web/app/globals.css` is the single entry point where `design/assets/tokens.css` reaches the app, via Tailwind v4's `@theme inline`. Ten colours, three typefaces (Fraunces / Manrope / IBM Plex Mono), **radius 0**: sharp corners are the editorial voice. No UI kit, no form library, no state library.

`design/assets/tokens.css` is the brand book; `globals.css` is the only place those tokens enter the app, through Tailwind v4's `@theme inline`. Ten colours (the nine brand hues plus `--color-danger`, a warm madder (`#96291D`) for destructive actions, error text, and terminal-negative statuses, always applied through opacity modifiers (`text-danger`, `bg-danger/10`, `ring-danger/30`) and never stock Tailwind `red-*`), three typefaces (Fraunces display, Manrope body, IBM Plex Mono labels), and **radius `0`**: the sharp corners are the editorial voice, not an oversight.

The typefaces load through `next/font/google` in `web/app/[locale]/layout.tsx` (and `global-not-found.tsx`, whose two families use the same variable form so its files are content-hash-shared with the layout's). Fraunces and Manrope are **variable builds** (Fraunces with `axes: ["opsz"]` in normal + italic, Manrope with the default `wght` axis), while IBM Plex Mono has no variable build and stays static at 400/500. That is five base `woff2` files instead of the fifteen static instances loaded before, and it is also what makes the `font-variation-settings` rules below actually bind: `opsz`/`wght` variation settings are no-ops on a static instance, so the heading and wordmark cuts *require* the variable builds; don't "optimize" back to enumerated weights.

Three things there are easy to get wrong:

- **Motion is set through Tailwind's own variables**, `--default-transition-duration` and `--default-transition-timing-function`. Overriding those means every bare `transition` utility already in the codebase inherits the brand's `cubic-bezier(.2,.6,.2,1)`: no one has to remember a custom `ease-brand` class. A `prefers-reduced-motion` block flattens all of it.
- **Fraunces is an optical-size variable font, and `opsz` is not a size**: it is how the letterforms are drawn *for* a size. The `h1, h2, h3` rule sets `opsz 36`, a heading cut whose thin joins go weak past ~60px. The homepage hero therefore uses `.kk-display` (`opsz 144`, the wordmark's cut, with tracking pulled in). It is the only display-scale type on the site.
- **`:focus-visible` is declared once, globally**, as a cobalt ring. Before that each interactive element re-declared its own and anything that forgot fell back to the UA outline, which is invisible against sand.

`.kk-wordmark` (upright "karir" + italic cobalt "kalyan"), `.kk-label` (mono eyebrow), and `.kk-num` (mono ordinal, tabular figures) are the only other custom classes; everything else is Tailwind utilities.

### Auth flow

> **At a glance** · The JWT never reaches client JS. A Next route handler proxies sign-in to Rails, lifts the token from the `Authorization` header, and stores it in an `httpOnly` `session` cookie; server-side `apiFetch` re-attaches it as a Bearer. A companion `httpOnly` `account_email` cookie, set and cleared beside it, gives the header's account menu its email without a fetch. Origin checks guard the auth handlers: Next's built-in CSRF defence covers Server Actions, not route handlers.

1. The sign-in form POSTs plain credentials to a Next route handler (`app/api/auth/session/route.ts`). It is the only such handler: registration is closed, so there is no second credential-accepting entry point.
2. Those handlers proxy to Rails, capture the JWT from the `Authorization` response header, and store it in an `httpOnly` cookie named `session`.
3. `DELETE /api/auth/session` hits Rails to rotate the JTI, then clears the cookie.
4. `app/lib/api.ts` exposes a server-side `apiFetch` that reads the cookie and attaches `Authorization: Bearer …`. Mutations in `app/lib/actions.ts` are server actions calling `apiFetch` + `revalidatePath`.
5. File downloads proxy through `app/api/applications/[id]/{resume,cover_letter}/route.ts`, streaming the PDF body back while passing through `Content-Type` and `X-Content-Type-Options`; again, the JWT stays server-side.

`apiFetch` detects `FormData` and leaves `Content-Type` to `fetch`, so the multipart boundary is set correctly.

**Origin checks are mandatory on the auth route handlers.** Next's built-in CSRF protection covers Server Actions, *not* route handlers, so without an `Origin` allowlist a cross-site form or fetch can drive a login (classic login-CSRF). `web/app/lib/csrf.ts` enforces same-origin by default, with `ALLOWED_ORIGIN` to pin; cross-origin → `403`. It guards the session `POST` and `DELETE`, and both passkey handlers below.

**Passkey sign-in reuses this whole shape** (server half in § Passkeys). The ceremony itself must run in browser JS (`navigator.credentials.get` exists nowhere else), but the JWT still never reaches it:

1. The sign-in form's passkey button POSTs `app/api/auth/passkey/options/route.ts`, which proxies the options request to Rails and returns the ceremony JSON. The button renders only when the browser has `PublicKeyCredential.parseRequestOptionsFromJSON`: the native WebAuthn JSON methods are the only (de)serialization used, no hand-rolled Base64URL and no client library; a browser without them (none in the Android-first support set) simply keeps the password form.
2. The browser runs `navigator.credentials.get` and POSTs the assertion's `toJSON()` output plus the echoed challenge to `app/api/auth/passkey/route.ts`, which proxies to Rails, lifts the JWT from the `Authorization` response header, and stores it in the same `httpOnly` `session` cookie; from there the session is indistinguishable from a password one. A user-cancelled ceremony (`NotAllowedError`) shows nothing: cancelling the browser's own picker is not an error the page needs to repeat.

**Enrollment lives on `/settings`**: a signed-in page (route-guarded like the rest of `(app)`), listing enrolled passkeys with add/remove. The authenticated halves of the ceremony go through **server actions** (`getPasskeyRegistrationOptions`, `registerPasskey`, `deletePasskey` in `app/lib/actions.ts`) rather than route handlers: they are ordinary authenticated API calls, which is exactly what `apiFetch` + server actions already do: only the two *unauthenticated* ceremony legs need route handlers, because only they must lift a header into a cookie. `/settings` is reachable at every width through the account menu (next paragraph); enrollment's desktop-first design (§ Passkeys) is unchanged, but the settings *link* is no longer `sm`-and-up, because push delivery re-decided it: the push enable toggle lives on `/settings`, a push subscription is per browser instance, and the one device push delivery targets (the installed Android app) was the one that could not reach the page without a typed URL. The tab bar keeps its three tabs: settings is a secondary destination, and the bar's slots are for primary ones.

**The account menu** collapses Settings and Sign out behind a square initials chip in the header, at every width. Square on purpose: the design system's radius is `0`, and the circle convention exists to signal a person's photo, which this app never has; a radius-0 chip in brand tokens is consistent where a copied circle would be the one rounded element on the page. With no display-name column in the data model, the chip shows a single initial from the **email local part** (initials derived from a *name* are culturally fraught: name order, single names, non-Latin scripts), and the full email is the trigger's accessible label and the menu's first row. The menu is a plain disclosure, not an ARIA `menu` (two links do not earn roving focus): outside click and `Escape` close it, `Escape` returns focus to the chip, and choosing an entry closes it. Sign-out moves off the header bar into the menu, so the below-`sm` header shrinks rather than grows. The locale switcher stays outside: language switching is a first-visit action, and burying it costs more than the slot saves. Rejected: a fourth tab (spends a primary-navigation slot on a secondary destination) and a bare settings link beside sign-out below `sm` (grows the phone header the tab bar just shrank, and leaves sign-out loose where the menu collects both).

**The email reaches the header through a companion cookie, never a fetch.** Both sign-in responses already carry `{ user: { id, email } }` in their body; the two sign-in route handlers read it and set an `httpOnly` `account_email` cookie beside the `session` cookie, same attributes, same one-day `maxAge`, and every path that clears one clears both (`DELETE /api/auth/session`, `/api/auth/expired`). The `(app)` layout, a server component rendered per request like every route, reads the cookie and passes the email down as a prop: `ProfileCard`'s prop-not-fetch rule (§ Exports) applied to the layout. A layout-level `/me` call would reintroduce the per-page request the `v1.3.0` fold removed, on every signed-in page this time, and an email claim in the JWT would grow the token contract for a display string. The cookie is `httpOnly` because no client JS needs it; it is display-only and self-affecting, so a hand-edited value can mislabel nobody but its own author. A session minted before this cookie existed lacks it for at most a day (it ages out with the JWT): the chip falls back to a neutral `@` glyph with the localized account label, and both menu entries work regardless, since neither needs the email.

**Expired sessions** bounce through `/api/auth/expired`, which clears the cookie and redirects to `/sign-in?expired=1` with a notice. A `401` must never dead-end on an error box. The redirect's `Location` is **relative**, never assembled from `request.url`: behind Railway's proxy the Host this process sees is the internal origin (`localhost:8080`), so an absolute URL built from it throws the browser at localhost, which shipped, and is why this is a rule rather than a preference. The path is unprefixed on purpose: the follow-up request flows through the proxy and next-intl, which resolve the visitor's locale from the `NEXT_LOCALE` cookie (§ i18n), so a `/ja` session expires into `/ja/sign-in` without the handler holding its own copy of the locale rules.

A `401` from upstream is the *only* thing that may surface as a `401`. Collapsing every non-OK upstream status into `401` once turned a total API outage into "Invalid email or password" for every user; see CHANGELOG v1.0.1.

### Public pages

> **At a glance** · `/` argues one claim (a job tracker built on a finite state machine) with a pipeline diagram that is an *illustration*, never a second copy of the transition table. `/about` states four build decisions as the cheaper alternative each one rejected; `/docs` frames the API and links out to Swagger.

The homepage argues one claim: this is a job tracker **built on a finite state machine**: thirteen states, an explicit transition table, an immutable audit trail, the stack named outright. Its primary call to action is "How it's built" (→ `/about`; 設計を読む in Japanese); the demo is second. It is aimed at a reviewer reading the code, not at a jobseeker shopping for a tracker.

On viewports below `sm` (640px) the marketing and auth headers **declutter rather than collapse into a menu**, because a hamburger would hide the locale switcher, and these headers are where a Japanese visitor meets the app before any session exists to remember a preference. Each drops only what is redundant at that width: the homepage hides its "About" nav link (the hero's primary CTA is the same destination, immediately below). Everything that remains, sign-in and the locale switcher, stays visible and one tap away, and fits a 375px viewport in Japanese, the wider locale, without wrapping. The signed-in shell's phone layout is its own story (§ Installable app): the tab bar carries the page links, and the header keeps the account chip (§ Auth flow) and the locale switcher at every width.

Below the hero it draws the machine it claims to be built on: `web/app/components/pipeline-diagram.tsx` draws the happy path as a vertical rail of status chips (the register of a git log, which is the audit trail's own aesthetic, and a layout that never wraps on a phone), with the three closed states below it rejoining the rail at `applied` along a dashed cobalt return trace, so "it is not a line" is drawn rather than only stated. **It is an illustration, not a second copy of the transition table.** The real table lives only in `api/app/lib/application_fsm.rb`, deliberately not restated here, not even as an edge count, because a hand-copied number is the same failure as a hand-copied table and this paragraph once carried a wrong one; the diagram names that file in its caption, nothing in the app reads the diagram, and no behaviour depends on it: a stale arrow there is a wrong drawing, never a wrong transition. Mirroring the full table in TypeScript is precisely what deferred the Kanban board to v1.2.0; the board answers that by *fetching* the table (§ Board view), and this diagram answers it by not needing one. Chip labels come from the `status` catalog and chip colours from `statusBadgeClass`, so the FSM's vocabulary still has one home.

Below the diagram, four numbered cards state the four claims the code has to back: the explicit transition table, the append-only audit trail, Solid Queue on Postgres, and the Kanban board that reads its legal moves from the API instead of copying them. They sit in one hairline grid: two across at `md`, four at `lg`.

`/about` therefore carries the visit. It states four decisions, each as the cheaper alternative it rejected: Rails for a TypeScript developer, a PORO FSM over a state-machine gem, Solid Queue over Sidekiq and Redis, `bytea` over object storage. Those arguments are the ones in the decisions log below, written for someone who has not read this file.

`/docs` frames the API (auth, per-user scoping, the `{ error, code, details? }` failure envelope, cursor pagination, and the endpoint table) and then links out to the rswag Swagger UI. Deep-linking raw Swagger on a `*.up.railway.app` domain drops the visitor out of the design system; the reference stays reachable, one click further in. The endpoint table's methods and paths are code and are not translated; only the sentence beside each one is.

`/hsp-calculator` (`v1.10.0`) is a public, no-auth **高度専門職 (Highly Skilled Professional) points calculator**, and the one page in the app that serves strangers rather than its one loyal user: the trade is portfolio/SEO value for a page whose numbers ride the same annual visa-research pass as the in-app residence guidance (`Visa::COE_LEAD_TIME_DAYS` and this share the perishable-facts refresh). It is an `OPEN_PATH` (readable with or without a session) and is in the sitemap. The scoring logic is pure TypeScript in `app/lib/hsp.ts`, **unit-tested via the Vitest seam** (the point table, the age-gated income bands, the 70-point threshold, the PR fast-track years, the J-Skip gate, every bonus point at its table value, the national-qualification cap, and the empty-form-scores-zero path), so the page is a thin shell over tested logic; the point values are sourced to the MOJ ポイント計算表 and verified `2026-07-21` in the module's own header, and the "primary sources" links resolve per locale to the MOJ's own translation, the English points-table PDF on `/en` and the Japanese original on `/ja`. It models only the **technical track** (高度専門・技術分野), the one a software engineer applies under, but covers that column in full: the academic, experience, income, age, and Japanese-language points, plus **every bonus point an engineer can claim**, all except the three that live purely in the 経営・管理 column (position held, a ¥100M business investment, and investment-management work). National qualifications (Bonus 3) score 5 each capped at 10, presented as two mutually-exclusive checkboxes (one / two-or-more); an innovation-support employer (Bonus 4) that is also an SME reveals a dependent +10 (Note 3). Each bonus carries an info button that discloses the **verbatim MOJ wording** for that item (its row text plus any footnote), transcribed from the same points-table PDF, in the reader's language. The number fields start empty so an untouched form reads 0 out of 70, and clamp to range only on blur rather than fighting mid-typing. All scoring is client-side: nothing entered is sent or stored, and an inline note beside the estimate/not-legal-advice disclaimer says so. The page renders in the visitor's **system fonts** (a scoped `.hsp-system` in `globals.css` collapses the brand serif and mono onto a system sans over the page body, the header wordmark outside it staying branded): dependency-free type for a standalone public tool, and the mono labels read poorly small. Because its data story and legal surface are not the resume-holding app's, the page deliberately does **not** wear the app's `/privacy` and `/terms` (those describe the account app) or link them: it uses `<SiteFooter minimal>`, which carries only author, license, and GitHub. **Chosen with eyes open against the north star**: it does not serve the author, but it is the release's clearest single piece of Japan-market signal a reviewer could not have seen in someone else's portfolio.

### Legal pages

> **At a glance** · `/privacy` and `/terms`, both locales, reachable while signed in (`OPEN_PATHS`). They exist because the app holds resumes, and are written to be *true about the system as built*: five named sub-processors (Railway, GitHub, Anthropic, Resend, Honeybadger), two functional cookies, no self-service delete. Never a promise the code does not keep.

Two prose pages in both locales, linked from the site footer, `OPEN_PATHS` so a signed-in user can still read them. They exist because the app holds resumes, and a service that holds resumes without saying what it does with them is not defensible whether or not anyone made it fill in a form.

There is no legal entity behind this app and the pages say so: the operator is a natural person (§ Registration is closed explains why that is not an exemption). They are written to be **true about the system as built**, not to imitate a company's boilerplate, and every claim in them is checkable against this file:

- what is collected: an email address, application records, and one resume plus one cover letter per application; **plus, incidentally, IP addresses**, which are not a feature but are unavoidable: Rack::Attack keys its throttle counters on them (Solid Cache, so they land in Postgres rows), and Honeybadger attaches them to an error report's `cgi_data`. The **request log does not** carry them: lograge replaces Rails' default request line (the one with `for <ip>`) and its `custom_options` emit `time`, `request_id` and `params`, nothing else. Do not restore the IP to that lambda without changing the legal pages in the same commit;
- where it lives: `bytea` in a single Railway-managed Postgres, with a daily `pg_dump` run by the private `karirkalyan-backups` repository, whose artifacts expire after 60 days;
- who else touches it: **five** parties, and the pages name all five, because a sub-processor you decline to name is the one the policy exists to disclose:
  - **Railway**: hosting and the database, so everything;
  - **GitHub**: the nightly `pg_dump` runs on a GitHub-hosted runner and is stored as a GitHub Actions artifact, which means **GitHub holds a copy of every resume**. It is easy to forget because the backup repository is private and the workflow is boring, and it is precisely the kind of omission that makes a policy false;
  - **Anthropic**: the **text of the page** pasted into AI pre-fill, and nothing else. The server fetches the URL itself and sends Claude the stripped text (≤12k chars); the URL string never leaves the box, and neither does a resume, a cover letter, or anything else from the account. An earlier version of this list said "only the URL, never a document", which named the one thing that is *not* sent and denied the one that is;
  - **Resend**: outbound mail, so email addresses;
  - **Honeybadger**: error reports, which carry the request context above, and **only** error reports: `insights: enabled: false` in `honeybadger.yml`. With Insights on, honeybadger's Rails plugin ships an event per request, per SQL query and per mailer send: a stream of telemetry from healthy traffic, not just from failures. It is off so that the sentence on `/privacy` ("Honeybadger receives error reports") is true as written. Turning it on is a change to what a sub-processor sees, and the legal pages move in the same PR.
- one outbound request that is *not* a sub-processor: AI pre-fill makes the **server** fetch the job posting, so the site hosting it (LinkedIn, a company careers page) sees a request from Railway's IP, not from the user's browser. No personal data goes with it, so it does not join the list of five; the pages say it anyway, because it is the only case of the app talking to a host the *user* chose, and because the answer is a good one: the job board never learns who looked;
- what is *not* there: no analytics, no tracking pixels, no advertising, no third-party JavaScript. Two cookies, both functional: the `session` cookie that holds the JWT, and next-intl's `NEXT_LOCALE`, which remembers the chosen language. Neither is a tracker, and the pages say "two functional cookies", not "no cookies", see below;
- how to get it out, and how to get it erased: the two export endpoints (§ API contract) and an email to the operator, who runs `DELETE /api/v1/auth/account`.

**Do not write a promise the code does not keep.** The page must not offer a self-service delete button (there isn't one; that is the deliberate trade in § Registration is closed), must not claim encryption at rest beyond what Railway actually provides, must not name a retention period the backup script does not enforce, must not say "nothing is shared with anyone else" while a nightly job ships the whole database to GitHub, and must not promise erasure is immediate when it is a human reading mail. The failure mode of a privacy policy is not being too short; it is saying something untrue.

`/terms` is correspondingly small: the service is a portfolio demo, provided as-is with no warranty and no uptime commitment, the demo account is shared and world-writable so nothing private belongs in it, and the operator may reset or delete it at any time.

### Route guard

> **At a glance** · `web/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`; a `middleware.ts` is silently ignored). Auth is the presence of the `session` cookie, across three path classes: `OPEN_PATHS` always render, `PUBLIC_PATHS` bounce to `/dashboard` when signed in, everything else bounces to `/sign-in` when not. It also resolves the locale and sets the per-request CSP nonce.

Next.js 16 renamed `middleware.ts` → `proxy.ts`; a `middleware.ts` file is **ignored**. Export a function named `proxy`.

Authorization is presence of the `session` cookie: there are no roles. Paths fall into three categories, checked in this order:

| Category | Paths | Without a cookie | With a cookie |
| --- | --- | --- | --- |
| `OPEN_PATHS` | `/about`, `/docs`, `/privacy`, `/terms` | renders | renders |
| `PUBLIC_PATHS` | `/`, `/sign-in` | renders | `307` → `/dashboard` |
| everything else | `/dashboard`, `/applications/*`, … | `307` → `/sign-in` | renders |

`OPEN_PATHS` is checked first and skips both redirects. `/about` and `/docs` explain how the system is built rather than selling it, so bouncing a signed-in reader to the dashboard would hide them from the people most likely to read them, which is why they are not more `PUBLIC_PATHS` entries. `/privacy` and `/terms` are there for a sharper reason: the people they most concern are the ones already signed in and holding data in the system, and a privacy policy a user cannot reach while logged in is not a privacy policy. The signed-in app shell's "For reviewers" footer links to `/about` and `/docs`, and the site footer links to the two legal pages; those links only resolve because of this. Matching is by segment: `/about` also covers `/about/anything`, but never `/aboutish`.

`config.matcher` **must** exclude `/robots.txt`, `/sitemap.xml`, and `/llms.txt`, or crawlers get a `307` to sign-in and the whole SEO surface becomes unreachable; and `/sw.js`, whose failure mode is quieter: the browser re-fetches a registered service worker on its own schedule, sometimes with an expired session, and a `307` answer is a failed worker update (§ Installable app § The service worker).

It also resolves the locale and applies next-intl's rewrite/redirect before the auth check, so the guard always sees a locale-stripped pathname. See the i18n section below.

`proxy.ts` also sets the CSP. The policy is per-request nonce-based (`script-src 'self' 'nonce-…' 'strict-dynamic'`), with no `'unsafe-inline'`; development keeps `'unsafe-eval'` for HMR. **Because nonces are applied only during SSR, `await connection()` in the root layout opts the whole app into dynamic rendering**, so every page's scripts get the nonce. There is consequently no static optimization left to lose, which is why locale-prefixed routing in v1.1.0 costs nothing.

### Caching (`use cache`)

> **At a glance** · Next.js 16's `'use cache'` directive requires `cacheComponents: true` in `next.config.ts`, which this project does not set. A stray directive fails the build loudly rather than silently doing nothing; enabling the flag is a whole-app decision, not a per-component fix.

`'use cache'` is a Cache Components feature, distinct from `React.cache` and `unstable_cache`. Without `cacheComponents: true` Next.js rejects the directive outright, so there is no silent-degradation failure mode to worry about. Enabling the flag interacts with the dynamic-rendering constraint above (every route renders dynamically so its scripts carry the CSP nonce), so it is a deliberate architectural decision: don't switch it on to fix a single component. If it is ever enabled, caching belongs at the component or data-fetch layer, never on a server action or a mutation in `app/lib/actions.ts`.

### Board view

> **At a glance** · `/board` (labelled "Kanban"): one column per active status, cards moved by drag or menu, each move a real FSM transition. It *fetches* the legal-move table from `GET /api/v1/transitions` rather than mirroring it. Bounded fetch-all, native HTML5 drag, optimistic moves that revert on `409`.

A Kanban view of the same applications the dashboard lists: one column per active status, cards moved by drag or by menu, each move a real FSM transition. It lives under the `(app)` route group, so the route guard's "everything else" row already protects it: no `proxy.ts` change. The header gains a `nav.board` link beside Dashboard; unlike the Dashboard link it stays visible below `sm`, because there is no second way to reach the board.

The **route is `/board`; the label is "Kanban"** (カンバン): in the nav (`nav.board`) and as the page title (`board.title`). "Board" names the thing generically and could be any of the app's views; "Kanban" names the one pattern the page actually is, and it is the word both audiences already have. The path stays `/board` because a URL that moves is a URL that breaks, and the message namespace stays `board.*` for the same reason.

#### Data: one bounded fetch-all, plus the transition table

The server page makes two fetches in parallel:

- **Applications**: the cursor-paginated `GET /applications` followed to exhaustion at `limit=100`, capped at 10 pages. A board is a view of *everything*, so pagination is the wrong UI; but "fetch all" against a cursor API must be bounded or one pathological account hangs the page. Past ~1,000 applications the board renders what it fetched plus a `board.truncated` notice. Per-column cursors ("load more" inside each column) were rejected; see the decisions log.
- **The transition table**: `GET /api/v1/transitions`. The board *fetches* the table; it never mirrors it. `ApplicationFSM::TRANSITIONS` stays the only copy (§ State machine), which is the invariant that deferred this feature to v1.2.0 in the first place.

#### Columns: seven active, one closed rail

The seven columns are exactly the fetched `active_states` (§ API contract), laid out as a wrapping grid rather than a horizontal scroller (four per row on large screens, two per row on small screens, one on the narrowest), keeping every column on screen without sideways scrolling. Display order is board-local and grouped by engagement, not funnel order: the four-column row break puts the interview loop (applied, phone_screen, technical, final_round) on the first row and everything outside it (wishlist, draft, offer) on the second. Membership still derives from `active_states`, so the board-local order list can never hide a column. The six closed states (accepted, declined, rejected, ghosted, withdrawn, archived) do not get columns; thirteen columns is unreadable at any width. They collapse into a **closed rail** below the board, one toggleable group per status showing a count, expanding to the same cards.

Cards keep the server's order within a column. There is no intra-column reordering: position is not API data, and inventing a client-side order would be a second source of truth.

**The two candidate-side columns triage themselves (`v1.10.0`).** `wishlist` and `draft` are the columns where a stalled item is the user's *own* to move (past `applied`, the next move is the company's, which ghost risk already watches). For those two only, `TRIAGE_COLUMNS`, the card grows three facts so a decision needs no card open: an `excerpt` of `notes`, the job-board `source`, and how long it has sat there; and the column sorts **stalest-first**. The excerpt is `web/`-only pure logic (`excerpt.ts`, codepoint-aware, unit-tested via the new Vitest seam). The other two are new **index-payload** fields (§ API contract): `source` is `JobBoard.from_url(url) || JobBoard::NONE`, server-derived because a TypeScript copy would re-implement the www-strip/downcase rule, and now rides `Application#as_json` everywhere; `days_in_stage` is the whole days since the row entered its stage, the `COALESCE(MAX(timeline_entries.created_at), applied_at, created_at)`-against-`Time.current` computation `GhostRiskQuery` already names (**not** `updated_at`, which any edit bumps), reused under the same name rather than a near-miss second one. It is a **correlated subquery in `ListQuery`'s `SELECT`**, one statement for the whole page, not a per-row Ruby query the board's fetch-to-exhaustion would turn into a thousand. The stalest-first sort key is that server field, so the order is still derived from server data; the elapsed label reuses `format.ts`'s `relative` engine (the one `timeAgo` uses) rather than a second duration format. `DashboardController` stays untouched: its aggregate `facets` payload sits behind a `count + MAX(updated_at)` cache key that cannot see per-row content.

**The "can re-open to Applied" affordance is now derived, not a set.** `REVIVAL_STATES` is gone; `canRevive(status, table)` reads the fetched table instead. The naive `transitions[status].includes("applied")` is not enough, because `draft` has a *forward* edge to `applied`; the correct test gates on the state being closed too, `!active_states.includes(status) && transitions[status].includes("applied")`, which yields exactly `ghosted`/`rejected`/`withdrawn`. It degrades to `false` when the table did not arrive, so the reason prompt is simply not offered rather than wrongly demanded. This shrinks `web/`'s hardcoded-FSM-set allow-list to `COLUMN_ORDER`, `CONFIRM_REQUIRED`, `STAGE_NOTE_STATES`, and `TRIAGE_COLUMNS`, all pure affordance judgement that no fetched fact could replace.

#### Moving cards: native drag-and-drop, card menu as the accessible path

Drag-and-drop is native HTML5 (`draggable`, `dragover`, `drop`): no dependency; what it can't do (touch, animation polish) is not worth a library at this scale (see decisions log). Drag is card → column only. While a card is dragged, columns that are legal targets *per the fetched table* highlight; dropping anywhere else is a silent no-op. The closed rail is **not** a drop target: moves into closed states carry intent (an offer accepted, a process abandoned) that a flick of the wrist shouldn't express.

Every card carries a focusable menu button listing **all** legal next states, including the closed ones drag refuses. The menu is the accessible path and the only complete one; drag is a convenience layered on top. The confirm/revival semantics live in a shared module (`web/app/lib/transitions.ts`) so the detail page and the board cannot drift: `CONFIRM_REQUIRED` (which moves are worth a prompt) and `STAGE_NOTE_STATES` (which offer an optional note) are UI judgement and stay there, while `canRevive` derives the reopen affordance from the fetched table (above). Which states are *irreversible* is an FSM fact, not a judgement, so it comes from the fetched table's `terminal_states` (§ API contract) rather than a set beside them.

The table only decides what *looks* droppable. The server re-validates every transition through `Applications::TransitionService` regardless: a stale table degrades the highlighting, never the data.

#### Optimistic moves, 409 reverts

A move applies optimistically via `useOptimistic` and calls the existing `transitionStatus` server action. On failure the card snaps back to its source column and a board-level localized notice shows the resolved error (§ Server-side error messages). A `409` / `stale_record` additionally triggers `router.refresh()`, since the board's copy of that application is stale by definition. `revalidateApplication()` in `actions.ts` revalidates `/board` alongside `/applications/[id]` and `/dashboard`, so moves made elsewhere reach the board on next render.

### i18n

> **At a glance** · `next-intl`, `en` (default, unprefixed) and `ja` (prefixed; `localePrefix: "as-needed"`). Copy lives in ICU catalogs at `web/messages/{en,ja}.json`. Rails stays English-only; `web/` localizes failures on the machine-readable error `code`. All navigation goes through `i18n/navigation.ts`, never the `next/*` originals. `en`/`ja` key parity is enforced by a CI script, not by review. Japanese lines break at phrase boundaries: `word-break: auto-phrase` in CSS, plus server-side BudouX on the headings (§ Japanese line breaking).

Locales are `en` (default) and `ja`. Copy lives in ICU message catalogs at `web/messages/{en,ja}.json`.

#### URL shape: `ja` is prefixed, `en` is not

`localePrefix: "as-needed"`. English keeps the bare paths (`/`, `/dashboard`, `/about`); Japanese is prefixed (`/ja`, `/ja/dashboard`, `/ja/about`). No existing URL moved when i18n landed, which is why this shape was chosen over prefixing both locales.

`/en/*` is not a 404 and is not a second canonical URL for the same page: next-intl redirects it to the unprefixed path (`307`, query string preserved). So the English page has exactly one address, which is what the sitemap and `hreflang` advertise.

Locale for an unprefixed path resolves from the `NEXT_LOCALE` cookie, then `Accept-Language`, then the default.

#### Routing internals

Pages live under `app/[locale]/`, which is therefore the **root layout**: there is no `app/layout.tsx`. Route handlers (`app/api/**`), the crawler files (`robots.ts`, `sitemap.ts`, `manifest.webmanifest`), and `global-not-found.tsx` stay outside it: they are locale-independent, and a locale segment would break their fixed paths.

`proxy.ts` composes two concerns in one pass, in this order:

1. `splitLocale()` splits the pathname into the prefix to preserve (`/ja`, or empty for English) and the path the guard reasons about (`/dashboard`).
2. The auth guard runs against that **locale-stripped** path, so `PUBLIC_PATHS` and `OPEN_PATHS` stay lists of a few entries rather than one per locale, and `/ja/dashboard` is protected exactly as `/dashboard` is. Its redirects re-apply the prefix, so a signed-out `/ja/dashboard` visitor lands on `/ja/sign-in`.
3. If the guard passes, next-intl's middleware resolves the locale and produces the rewrite (`/dashboard` → `/en/dashboard`) or redirect (`/en/dashboard` → `/dashboard`).
4. The CSP with its per-request nonce is set on whatever response comes out of 2 and 3, including redirects, which must carry it too.

The guard runs *before* next-intl, not after, because it needs no locale to make its decision and next-intl's output is a rewrite the guard would then have to un-rewrite.

The nonce reaches SSR by mutating `request.headers` in place before delegating: next-intl copies those headers (`new Headers(request.headers)`) onto the request it forwards. It must be a mutation, not `new NextRequest(request, { headers })`: reconstructing the request re-reads its body, and every server action arrives as a POST with one.

`config.matcher` is unchanged: it excludes by *prefix segment* (`api`, `_next`, …) and a `/ja` prefix does not collide with any exclusion. The crawler exclusions (`robots.txt`, `sitemap.xml`, `llms.txt`) keep working because those paths are never locale-prefixed.

#### Navigation must go through `i18n/navigation.ts`

`Link`, `useRouter`, `usePathname`, `getPathname`, and `redirect` are re-exported from `i18n/navigation.ts` and used **instead of** the `next/link` and `next/navigation` originals. The originals drop the prefix, so a `/ja` visitor clicking through the app silently falls back to English.

Two deliberate exceptions, both importing from `next/navigation` on purpose:

- `notFound()`: it carries no path, so there is no locale to preserve.
- `redirect` in `app/lib/api.ts`, which sends an expired session to `/api/auth/expired`, a route handler outside the `[locale]` tree. It must **not** be locale-prefixed: the wrapped `redirect` would rewrite it to `/ja/api/auth/expired`, which does not exist. Someone applying the rule mechanically will "fix" this import and silently break session expiry.

Two consequences worth knowing:

- `usePathname` from this module returns the **locale-stripped** path, so `NavLink`'s `href` comparison needs no special case.
- In a server action there is no component tree to infer the locale from, so `redirect` and `getPathname` take it explicitly: `actions.ts` calls `getLocale()` and passes it. `revalidatePath` gets the same treatment, since the visitor's router cache is keyed on the prefixed URL.

#### Locale switcher

`app/components/locale-switcher.tsx` is a two-locale **toggle**, not a list: it renders only the language the visitor is *not* reading, named in that language (`日本語` on an English page, `English` on a Japanese one). Showing the active locale as well would restate what the page already says in every other word on it. A third locale makes this a menu: the component picks a single `target` and that stops being well-defined.

The visible label is a bare language name, which can be read as a statement rather than an action, so the accessible name supplies the verb via `locale.switchTo` (`Switch to {language}`).

It switches with `router.replace`, not `push` (changing language corrects the current page rather than advancing through the site), and passes the **locale-stripped** `usePathname()`, so `/ja/applications/7` and `/applications/7` map onto each other with no string surgery.

It is mounted in the app shell (`(app)/layout.tsx`), the marketing header (`[locale]/page.tsx`), and the auth layout (`(auth)/layout.tsx`). The last two matter because a Japanese visitor meets the app there, before any session exists to remember a preference.

#### 404s

`app/[locale]/not-found.tsx` handles a bad path *inside* a locale. Paths matching no route at all fall to `app/global-not-found.tsx`, enabled by `experimental.globalNotFound` in `next.config.ts`. It exists because a root layout under a dynamic segment leaves Next nothing to compose a 404 from; without it those paths get Next's built-in bare document: no `lang`, no stylesheet, no nonce. It bypasses normal rendering, so it returns a full HTML document, imports its own styles and fonts, and links out with a plain `<a>` (no client router is mounted to take a soft navigation).

#### Sitemap

`app/sitemap.ts` emits one `<url>` per route, `<loc>` being the default-locale (unprefixed) address, with `alternates.languages` producing `hreflang` links for `en`, `ja`, and `x-default`. Prefixes come from `getPathname()` rather than string concatenation, so the prefix rule has one source of truth.

Its `ROUTES` list holds only what a signed-out crawler can reach: `/`, `/about`, `/docs`, `/privacy`, `/terms`, `/sign-in`. Everything behind the session cookie is a `307` and has no business being advertised.

#### Metadata description comes from the catalog

`generateMetadata` in `app/[locale]/layout.tsx` reads its description from `home.tagline` rather than holding a second copy as a constant. A Japanese search result should say what the Japanese homepage says. `/about` and `/docs` each override `title` and `description` from their own catalog namespace, which the layout's `title.template` renders as `… — KarirKalyan`.

#### Server-side error messages: keyed on the error code, HTTP status as fallback

**Rails stays English-only, and `web/` localizes by the machine-readable `code`** the API returns on every failure (see § API contract), falling back to the HTTP status when the code has no catalog entry.

An upstream failure resolves to localized copy in this order; first hit wins:

1. **Per-field validation details.** When the failure is `validation_failed`, each `details[]` entry is looked up as `errors.field.<field>_<code>` (`errors.field.email_taken`, `errors.field.resume_too_long`); every entry with catalog copy is rendered, joined into one message. Fields or inner codes without an entry are skipped rather than guessed at.

   `errors.field.base_too_many_applications` is the one whose *field* is `base` rather than a real column: the `MAX_PER_USER` ceiling (§ Security), where no field is wrong and the account is simply full. It reads as a lookup like any other because `base` is what Rails calls a record-level error, and the resolution above never assumed the field was a form input. **Its copy does not name the number**, deliberately: the ceiling is a constant in Ruby, and a catalog that repeated it would be a second copy free to drift the day it moves. The API's English sentence names it; the localized copy says the account is full and to delete something.
2. **The code.** `errors.code.<code>`: `invalid_credentials`, `stale_record`, `invalid_transition`, `invalid_url`, `prefill_failed`, and the rest of the § Error codes taxonomy each have an entry.
3. **The status.** The v1.1.0 map survives as the fallback: `401`, `403`, `404`, `409`, `422`, `429`, `502`, `503` under the `errors` namespace. It catches non-JSON failures, codes added to the API before the catalog learns them, and route-handler-synthesized errors that carry no code.
4. `errors.unknown`.

**The `code` also decides what recovery is offered, not just which sentence is shown.** Two failures can both be "the pre-fill didn't work" and still want different things from the user, so `web/` branches on the code rather than the prose: `prefill_blocked` and `prefill_failed` open the paste box (§ `UrlPrefillService`), `prefill_unreachable` leaves the Pre-fill button to be pressed again, `invalid_url` offers neither. This is why the failure arms of the action types carry `code`/`status` at all: `ActionFailure` has always returned them, and a result type that narrowed them away would throw the signal out at the door, which is what `PrefillResult` did until `v1.6.0`. **Never branch on the `error` sentence**: it is prose, it is translated, and the codes exist precisely so nobody has to parse it. The same rule already governs the `409` / `stale_record` optimistic-lock recovery.

Nothing ever string-matches the English `error` sentence: the codes exist precisely so no one has to parse prose. Codes are append-only on the API side, and step 3 means an unknown code degrades to the v1.1.0 behaviour rather than breaking.

Two places do this resolution, because a failure reaches the UI by two paths:

- `apiFailure()` in `app/lib/actions.ts`: takes the whole failed `ApiResult` (which `apiFetch` now decorates with `code` and `details` alongside `error` and `status`); every server action localizes before it returns, so the client components that render `result.error` need no translation logic of their own. Failures the action catches *before* the request (empty company/role, no file chosen, no URL to pre-fill) name a catalog key directly through `localFailure()`, since they have neither code nor status to key on.
- `errorMessage()` in `(auth)/sign-in/sign-in-form.tsx`: the auth form talks to the `/api/auth/*` route handlers over `fetch`, not through a server action, so it parses the response body itself and runs the same resolution. The session route handler passes the upstream `code`/`details` through, substituting its own copy for security-sensitive statuses but keeping the code. Per-call status overrides remain as the fallback layer: a `401` there means bad credentials, not a dead session. (It used to be two handlers; the register one went with § Registration is closed.)

Catalog presence is tested with next-intl's `t.has()`, so steps 1–2 need no hardcoded list of known codes in TypeScript: the catalogs themselves are the list. That is also why a key present in `en` and missing in `ja` fails quietly rather than loudly: `t.has()` turns the gap into a fallback, so a `ja` reader silently gets the status-keyed copy of step 3 instead of the sentence written for them. Nothing about the page looks broken. § Catalog parity is checked in CI is what catches it.

Localizing *in Rails* was rejected for the original reason: it would mean an i18n dependency, locale negotiation on every request, and a second message catalog to keep in sync, for strings only the frontend ever displays.

#### Catalog parity is checked in CI

`web/scripts/check-i18n-parity.mjs` diffs the two catalogs and exits non-zero on any asymmetry. It runs as `npm run lint:i18n`, wired into the `verify` job of `web-ci` ahead of the build, so a key landing in one catalog and not the other fails the `Lint, typecheck & build` check that `conserve-main` requires. Before `v1.4.4` this rule was held by review alone, and a `ja` key could go missing through lint, typecheck and build without a word (above).

**What it counts is every path, with array elements counted individually and containers counted as well as descended into.** A path is the dotted route to a node, with array indices as `[n]` segments, so `transitions.reasons.ghosted` contributes four paths, not one: the array itself, plus `[0..2]`, one per FSM reason chip. Two rules follow, and the script reports each separately:

- **A path in one catalog and not the other is drift.** This one rule does most of the work, because walking the whole tree collapses the other shapes of drift into it. An array of a different **length** is caught for free: a `ghosted` with two chips in `ja` has no `[2]`, so `[2]` reports missing. That is the whole reason elements are counted rather than the array being treated as one opaque leaf: a reason chip that exists in English and not in Japanese is exactly the bug this check is for, and dict-only counting cannot see it; that blindness is what made an earlier docs audit report a *false* drift here.
- **A path whose type differs is drift too**: most usefully a `string` in one catalog against an `object` in the other, meaning the two disagree about the shape of the copy and `t()` finds out at runtime instead of here. This rule only works because the walker records containers rather than only leaves: on a leaves-only walk a key that became an object would never appear as a path at all (only its children would), so the comparison would find `undefined` on one side and short-circuit, and the check would be dead code with a comment vouching for coverage it did not have. That is exactly what it was when first written in this release, and a review caught it. Recording containers also makes an empty `{}` visible, which a leaves-only walk drops silently. The rule additionally covers a `5` against a `"5"`; nothing in the catalogs is a non-string scalar today, so that half is a guard rather than a working part.

The convention matters more than which convention it is: whatever the script counts, it must count the same thing on both sides. It walks both catalogs with one function for precisely that reason.

It is a script rather than a test because `web/` has no unit-test runner: Playwright E2E is the only suite, and booting a browser to compare two JSON files would be absurd. It has no dependencies and reads nothing but the two catalogs, so it costs the CI job well under a second.

**It checks symmetry, not completeness, and the difference is not academic.** A key the API needs and *neither* catalog has is perfectly symmetric, so the check passes, which is exactly what happened to `errors.field.base_too_many_applications` in this release: the ceiling shipped with SPEC, TODO and CHANGELOG all naming the detail code, and both catalogs missing it, so the one user who hit the ceiling would have been told to check the form. The parity check ran green over that the whole time and was right to. The gap it closes is a key in one catalog and not the other; the gap it cannot close is a code the API emits that the catalogs have never heard of, which is step 1's `t.has()` filter degrading exactly as designed. Adding an error code is not done when the API renders it; it is done when both catalogs can say it.

#### Locale-sensitive formatting

`Intl.RelativeTimeFormat` and `toLocaleDateString` in `app/lib/format.ts` take the active locale rather than the hardcoded `"en"`. `<html lang>` and OpenGraph `locale` follow the active locale too.

`formatDate()` pins `timeZone: "Asia/Tokyo"`. The API serialises in app time, and a date-only field like `follow_up_at` parses as UTC midnight, so without the pin a viewer west of UTC would see the previous day; and `isOverdue()`, which compares date strings, would disagree with what is on screen.

`format.ts` holds no copy. Status labels and descriptions live in the `status` namespace of the catalogs, keyed by status (`status.label.applied`, `status.description.applied`); an English copy in `format.ts` would give the FSM's vocabulary two sources of truth. What stays in the module is what cannot be translated: the badge palette, the status sets, and `BOARD_LABELS`. `jobBoardLabel()` takes the localized `(none)` label as an argument rather than reaching into a catalog from a pure module.

#### Japanese line breaking (文節単位の改行)

Japanese has no spaces, so a browser's default line breaking treats almost every character boundary as a break opportunity and compound nouns wrap mid-word (`東京オリン` / `ピック`). Two layers fix it, deliberately cheap and with no schema or API surface:

- **CSS, the broad layer.** `globals.css` declares `word-break: auto-phrase` under `:lang(ja)`, keyed off the `lang` attribute the locale layout already sets on `<html>`. Chromium 119+ breaks every Japanese line at phrase boundaries (the browser embeds the same BudouX model as the layer below); every other engine drops the unknown value at parse time and keeps today's behaviour, so the rule is a one-line progressive enhancement with no fallback code.
- **Markup, the targeted layer.** `app/components/phrase.tsx` exports `<Phrase>`, a server component that runs [BudouX](https://github.com/google/budoux) (the `budoux` npm package; the parser and its ~15 KB Japanese model are constructed once per process at module scope) over its children. One research note corrected at install time: the package is no longer zero-dependency as `TODO.md`'s 2026-07-11 note recorded; since 0.8.0 it declares `linkedom`, `commander`, and `google-artifactregistry-auth`, all serving its CLI and HTML-processing halves. The root import statically loads `linkedom`, so the dependency set rides along in the server bundle only; nothing of it can reach the client, because only a server component imports the module. String children containing Japanese are re-emitted as phrase segments separated by `<wbr>`, wrapped in one span carrying `word-break: keep-all` (which suppresses the default anywhere-breaking so the `<wbr>`s become the only break points) and `overflow-wrap: anywhere` (the escape valve when a single phrase is wider than its container). `<wbr>` is chosen over zero-width spaces because ZWSPs survive copy-paste and end up inside pasted text; `<wbr>` does not. Children without Japanese pass through untouched and unwrapped, so call sites need no locale check: the same `<Phrase>` is a no-op on every `en` catalog string and segments a Japanese company name even on an English page. Element children (the spans a `t.rich` tag renderer produces) are left alone rather than recursed into; a call site that wants their contents segmented wraps the chunks inside the tag renderer explicitly, which is what the homepage headline does.

Where the targeted layer applies is decided by one question: **does the element actually wrap?** The server-rendered wrapping surfaces get `<Phrase>`: the homepage hero headline, feature-card titles, and CTA labels; the `h1`/`h2` headings on `/about` and `/docs`; the dashboard and board page `h1`s; and the detail page's role line, which is Japanese user data rather than catalog copy. Three surfaces deliberately do not get it:

- **The board and list card titles** (`board.tsx`, `applications-list.tsx`): they render with `truncate`, so they never wrap and a break annotation is dead markup. `TODO.md` named card titles as a target; this is a scope reduction discovered at the code, not a drift.
- **Client-rendered labels and buttons** (transition buttons, form labels, nav). BudouX runs server-side precisely so the model never enters the client bundle; importing `<Phrase>` from a client component would ship it. Those labels are short, rarely wrap, and get the CSS layer on Chromium.
- **Long body text**: mostly self-corrects, per the research note in `TODO.md`; bad breaks are worst at display sizes.

`Intl.Segmenter` was rejected: it segments dictionary words, not phrases, so it produces choppier breaks than the phrase model, and it still needs the same markup plumbing.

#### What is not translated

Job-board brand names (`BOARD_LABELS`), schema.org enum values in the `jsonLd` blob, the `KarirKalyan` wordmark, and the HTTP methods and paths in the `/docs` endpoint table.

See `TODO.md` for remaining scope.

---

### Installable app

`web/public/manifest.webmanifest` is a static file, served outside the locale tree and excluded from the proxy matcher (§ Routing internals). It declares `display: standalone`, and the shell behind the install is real: below `sm` the app's navigation moves to a bottom tab bar (§ The installed shell), long-pressing the launcher icon offers manifest `shortcuts` (§ Shortcuts), a `monochrome` icon lets Android themed icons tint the monogram instead of dimming the full-colour plate (§ Icon purposes), sign-in can be a passkey instead of a morning password prompt (§ Auth flow), and the follow-up digest can arrive as a notification through the push-only service worker (§ The service worker).

**`id` is `/`, and is the one field here that can never be corrected.** An absent `id` defaults to `start_url`, which means changing `start_url` silently re-identifies the app: the browser sees a different app, and an already-installed one is orphaned rather than updated. `/` is what the id defaulted to while `start_url` was `/`, so pinning it preserves the identity this app has always had. It is written down before the first WebAPK exists, because that is the last moment the choice is free.

**`start_url` is `/dashboard`, not `/`.** `/` is a `PUBLIC_PATH`, so launching the installed app bounced a signed-in user off the marketing page: the launch spent a redirect to reach the app. `/dashboard` costs an English user none. A Japanese user spends exactly one, because `/dashboard` is the *English* canonical under `localePrefix: "as-needed"` and next-intl resolves the unprefixed path from the `NEXT_LOCALE` cookie and redirects to `/ja/dashboard`. That is still an improvement: from `/` the same user paid two, the proxy's and next-intl's. A locale-pinned `start_url` is not the fix: it would freeze the installed app to whichever language was current on install day.

`scope` is `/` explicitly. It would default to `start_url`'s parent directory, which is already `/`, so this changes nothing today; it is written so that a later `start_url` cannot narrow the scope as a side effect and drop `/applications` out of the installed app.

#### Share target: capture from the share sheet

The manifest declares a [`share_target`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target): sharing a posting from any Android app sends the installed app a `GET /applications/new` carrying the share in `url`, `text`, and `title` query parameters. The method is `GET` because a share here is a navigation, not an upload: `POST` share targets exist for shared *files*, which nothing on this form accepts from a share sheet.

`/applications/new` reads those parameters whether or not the navigation came from a share: the share sheet is one caller of a plain deep link, so a bookmark, a hand-built URL, or a future manifest `shortcut` hits the same contract. `web/app/lib/share.ts` owns the reading:

- **A shared URL wins, wherever it hid.** The `url` param is preferred, but most Android apps put the link in `text` (usually with prose around it), and a few only fill `title`, so all three are scanned in that order and the first `http(s)` URL found is the capture. Nothing but `http`/`https` survives the parse: these params arrive from any link anyone crafts, so a `javascript:` or `intent:` scheme dies in the extractor rather than being echoed into the form.
- **A URL share auto-runs the pre-fill.** The form lands with the URL field populated and the same pre-fill the button triggers already in flight: the deep link *is* "trigger `UrlPrefillService` on arrival". Failures land in the existing error taxonomy, so sharing a login-walled or fetch-blocked posting opens the paste box exactly as a manual pre-fill would (§ `UrlPrefillService`).
- **A text-only share seeds the paste box, and runs nothing.** Android's "share selected text" is a real capture flow and the payload *is* the posting, so it lands in the paste textarea, already open, with the button left to the user. Auto-running was rejected here on the asymmetry: a URL is an unambiguous "read this page", while shared text may be half a posting or the wrong selection; and the paste box's design is that the user vouches for what is in it before it is sent.

**A signed-out share survives the sign-in it bounces into.** The proxy's redirect preserves the query string (it clones the URL and rewrites only the pathname), so the share reaches `/sign-in?url=…` intact; the sign-in page runs the same extraction and, on success, forwards to `/applications/new` with the capture instead of to `/dashboard`. Under a 1-day JWT the signed-out landing is the common morning case, not an edge, and a capture flow that dead-ended there would lose the posting at the exact moment the user acted on it. This is deliberately **not** an open `?next=` redirect: the destination is built from the extracted capture only (a fixed internal path plus one encoded parameter), never from a caller-supplied path.

**Install through Chrome, browse in Brave.** `share_target` is installation-gated: it exists only in the WebAPK Chrome mints, and Brave has no minting server, so a Brave install is a home-screen shortcut in which this feature silently does not exist. Sharing *from* Brave (or any app) still reaches the WebAPK; only the install itself must happen in Chrome, once.

#### The installed shell: a bottom tab bar below `sm`

Below `sm`, primary navigation is a bottom tab bar (`web/app/components/tab-bar.tsx`) carrying the header nav's three destinations: Dashboard (`/dashboard`), New (`/applications/new`), Board (`/board`). It is the header nav relocated, not a new information architecture: the labels reuse the existing `nav` catalog keys, so both locales and the parity check come for free. At `sm` and up the bar renders nothing and the header nav is unchanged.

- **The bar is `sticky bottom-0`, not `position: fixed`.** The body is already a flex column, so a sticky bar participates in layout: content and footer end above it at full scroll, and nothing needs a compensating bottom padding that would drift the day the bar's height changes.
- **`padding-bottom: env(safe-area-inset-bottom)`, and the viewport declares `viewportFit: "cover"`**: without `viewport-fit=cover` the `env()` insets are all zero, which is the way this padding silently does nothing. The inset keeps the labels above Android's gesture bar in the standalone WebAPK, and is `0` in a normal browser tab, where the browser owns that edge.
- **The header below `sm` shrinks to mark + sign-out + locale switcher.** The Board and New links hide once the tab bar carries them, which dissolves the 375px squeeze the header comments used to fight: the Japanese nav labels no longer compete with the wordmark for phone width.
- Active state is `aria-current="page"` on an exact path match, same rule as `NavLink`: deeper paths (`/applications/[id]`) light no tab, which is honest: the detail page is reachable from two tabs and claiming either would be a guess.

#### Shortcuts: static file, English labels, by decision

The manifest declares two `shortcuts`: **New application** → `/applications/new` and **Board** → `/board`. The first is the same deep-link contract `share_target` uses (§ Share target predicted this caller); the launcher long-press is just one more way to arrive with intent to capture.

**The labels ship English-only in a bilingual app, decided with eyes open.** The alternative (serving the manifest from a route handler that reads the locale cookie) was rejected on three grounds: a manifest is fetched at install and WebAPK-update time, so a cookie-derived manifest freezes the labels to install-day locale anyway, the exact freeze § `start_url` above refused; it converts a static file into a dynamic surface (proxy-matcher exclusion, CSP, caching) for the sake of two strings; and shortcut labels render in the launcher next to `name`, which is already the untranslated wordmark (§ What is not translated). If Chrome ever re-fetches manifests per-request-locale, this decision can be revisited; until then English labels are the honest version of what a "localized" manifest would actually deliver.

Each shortcut carries `icon-monogram-96.png` (the monogram plate downscaled): Android renders shortcut entries icon-first, and an icon-less shortcut falls back to a launcher-chosen placeholder.

#### Icon purposes are split, because one icon cannot serve both

`any` and `maskable` are contradictory requirements, and `purpose: "any maskable"` on a single icon satisfies whichever one it was drawn for:

- **`any`** is drawn as-is. `icon-primary-{192,512}.png` is a rounded-square plate with **transparent corners** (111px radius at 512, 4.45% of the canvas), which is exactly right here.
- **`maskable`** is full-bleed by contract: the launcher supplies the shape and crops to it, so transparency is not a rounded corner, it is a hole. Under a circular mask the old icon's corners were cropped anyway and nothing showed; under a squircle or rounded-square mask (Android's default varies by launcher, and Nothing OS uses its own) the mask reaches past the baked radius and the wallpaper shows through the corners.

So `icon-maskable-512.png` is the same artwork flattened onto the plate colour (`#1A2F6B`, which is also `theme_color`): full bleed, zero transparent pixels, ink untouched.

**The safe zone was measured, not assumed.** A maskable icon's guaranteed-visible area is a circle of 80% diameter: radius 204.8px at 512. The wordmark's bounding box is x 126–391, y 133–340, and its furthest corner is **182.6px** from centre, so it clears the safe zone with ~22px to spare and no launcher mask can clip it. That margin is real but not generous: the logo nearly fills the safe circle, which reads as a large icon rather than a clipped one. Shrinking it is a brand decision, not a correctness one, and is deliberately not made here.

**`monochrome` is a third purpose with a third contract: shape only.** Android themed icons tint a mask to match the wallpaper (on Nothing OS the entire launcher aesthetic *is* monochrome themed icons), and a launcher given no monochrome icon either dims the full-colour plate or excludes the app from the theme. The mask is alpha, not colour: the plate must go entirely and the glyph become the shape. So `icon-monochrome-512.png` is **not** the monogram recoloured: it is derived from the monogram render by unmixing every pixel back to its plate→ink ratio and writing that ratio as alpha (full-white ink, fractional alpha where the antialiasing blended into the plate). Same measurement discipline as `maskable`: the glyph's bounding box at 512 is x 126–392, y 133–340, furthest corner **183.0px** from centre against the same 204.8px safe radius: the identical ~22px margin, as it must be, because it is the same artwork.

#### The service worker: push-only, never a fetch handler

`web/public/sw.js` exists for exactly two events: `push` (parse the payload, `showNotification`) and `notificationclick` (focus an existing window on the payload's URL, or open one). **It must never gain a `fetch` handler.** Every route renders dynamically so its scripts carry the per-request CSP nonce (§ Route guard); a service worker that cached HTML would serve pages whose nonces no longer match the response header, and every script on them would be silently blocked: the app would break in the exact way that is hardest to see coming. This is also why **offline support is out**, recorded in `TODO.md` as architectural rather than deferred: offline *is* a `fetch` handler.

Three pieces of plumbing, each of which fails silently if forgotten:

- **`worker-src 'self'` is in the CSP explicitly.** Without it, worker scripts fall back to `script-src`; and this `script-src` is nonce-plus-`'strict-dynamic'`, under which `'self'` is *ignored*. A static `/sw.js` has no nonce, so the fallback blocks the very registration this section exists for. The directive is one token; debugging its absence is an evening.
- **`/sw.js` is excluded from the proxy matcher**, beside `robots.txt` and friends. The browser re-fetches a registered worker's script on its own schedule, including after the session cookie has expired; and a fetch that answers `307 /sign-in` is a failed update. Registration itself happens from the signed-in shell, but the update cycle must survive being signed out.
- **Registration lives in a tiny client component in the `(app)` shell** (`service-worker-registrar.tsx`, rendered by the `(app)` layout, DOM-less): the worker is only useful to a signed-in user, and registering from the marketing pages would install a worker for visitors who will never grant notification permission. The scope is the default `/`: the file sits at the origin root, so no `Service-Worker-Allowed` header is needed and `/dashboard` and the deep-linked `/applications/:id` are both in scope.

**The permission prompt fires only from `/settings`, never on load.** A denied notification permission is sticky: recovering it means the user spelunking through site settings, so the first ask has to be one they invited. The settings page's notifications section is the whole surface: its enable button calls `Notification.requestPermission()`, subscribes against the VAPID public key fetched from the API (§ Push notifications), and registers the subscription; disable unsubscribes in the browser first, then deletes the row. A denied state renders as an explanation of where to undo it, not a retry button that cannot work. Support is feature-detected the same way passkeys are (`usePushSupported`, `useSyncExternalStore` with a `false` server snapshot); an unsupported browser gets a sentence, not a broken toggle.

---

## Testing strategy

Mirroring Awano's Vitest + Playwright split, now on both sides of the stack.

| Layer | Tool | DB? | What it tests |
|---|---|---|---|
| Unit (`api/`) | RSpec, no DB | No | FSM logic, service logic in isolation |
| Request (`api/`) | RSpec request specs | Yes, real Postgres | Full HTTP stack: routing, auth, response shape |
| Unit (`web/`) | Vitest, no DOM | No | pure client logic (timezone survivability, excerpts) |
| E2E (`web/`) | Playwright | Yes | sign in → create → transition → timeline |

**`web/`'s unit seam is Vitest, settled in `v1.10.0`** (a `TODO.md` conditional whose trigger, the triage-cards excerpt logic, arrived). Config in `vitest.config.ts`: `node` environment (the logic under test touches no DOM), the `@/*` alias mirrored from `tsconfig`, and `include` scoped to co-located `app/**/*.test.ts` so it never picks up Playwright's `./e2e` specs. It runs in the `web` CI job's `verify` step (beside `tsc`), not the push-only Playwright job, so a PR sees it. What belongs here is client logic a request spec cannot reach: the `computeOverlap` DST arithmetic and JST interview helpers (`timezone.test.ts`), and the board triage excerpt. What does not: anything needing a real API, which stays a request spec, and anything needing a browser, which stays Playwright.

Unit specs for `ApplicationFSM` have zero database setup, pure Ruby: given these inputs, does `assert_transition!` raise? Fast, no factories. This mirrors Awano's `vi.mock`-based Vitest tests.

Request specs hit a real PostgreSQL database via `database_cleaner-active_record`. They carry `rswag` metadata, so `rake rswag:specs:swaggerize` generates the OpenAPI spec from the same file. Every request spec is wrapped in `prosopite` for N+1 detection.

**Do not mock the database in request specs.** Mocked tests pass while real migrations are broken. A real DB catches migration errors, constraint violations, and N+1 queries that mocks silently ignore.

**Push is mocked at the delivery boundary, and nowhere before it.** The seam is `WebPush.payload_send`: the one call that leaves the process. `PushDigestJob` specs stub it to assert payload shape, TTL, and the pruning contract (an `ExpiredSubscription` raise must destroy that row and still deliver to the user's other subscriptions); `FollowUpReminderJob` specs assert the job is *enqueued* per user with the claimed ids, mirroring `have_enqueued_mail`. The subscription endpoints need no mocking at all: they are ordinary request specs against real Postgres, plus the degradation case: with no VAPID env the subscribe endpoints answer `503 push_unavailable`.

**WebAuthn ceremonies are exercised with `WebAuthn::FakeClient`, in request specs, against the real database.** The DB rule above covers the tables but not the cryptography, so the seam is chosen deliberately (it was `TODO.md`'s open prerequisite): the `webauthn` gem's fake client performs real key generation and signing against the app's own challenge, so register-then-authenticate runs end to end (options request, ceremony, verify, `credentials` row, JWT dispatch) with no browser and no mocked verification. Two things the seam needs: the fake client's origin must match `WebAuthn.configuration.allowed_origins` (`http://localhost:3000`, the test-env `FRONTEND_URL` default), and the challenge must survive between the options request and the verify request: the test env's cache is `:null_store`, so passkey specs swap in a `MemoryStore` the same way the dashboard caching spec does.

The E2E suite used to open each run by registering a throwaway `e2e-${Date.now()}@example.com`, which is exactly the affordance § Registration is closed removed. It now signs in as **`e2e`**, an account `db/seeds.rb` creates alongside `demo` and leaves empty. Two accounts because they are load-bearing in opposite directions: `demo` must stay full (it is the portfolio walkthrough), and `e2e` must start empty (a spec that asserts on the first row of the list cannot share a fixture with 12 pre-loaded ones). Seeding is idempotent, so the CI job runs `db:seed` after `db:migrate`; locally the accounts survive across runs, and the specs assert on the row they just created rather than on the list being empty.

Two things about that account are easy to get wrong:

- **It must never exist in production.** `db/seeds.rb` is not a dev fixture: `Demo::ResetService` calls `load_seed` and `DemoResetJob` runs hourly in production (§ Background jobs), so anything unguarded there is live on prod within the hour. The `e2e` block is wrapped in `unless Rails.env.production?`. An unguarded one would be a second real account with a password nobody chose, the exact door § Registration is closed shuts. Its address is `@karirkalyan.test`, a reserved TLD that cannot receive mail, and both halves come from `E2E_EMAIL` / `E2E_PASSWORD` with defaults duplicated in `web/e2e/credentials.ts`. Change one side, change the other.
- **Only the `setup` project may sign in.** Playwright drives the *development* server, and Rack::Attack is enabled everywhere but test (§ Security): sign-in is throttled at 5/min per IP. `e2e/auth.setup.ts` signs in once, saves the session, and every spec inherits it through `storageState`, so the throttle counter sees one attempt per run no matter how many specs there are, which is what keeps a growing suite from throttling itself.

Coverage: SimpleCov, branch coverage on, 80% floor.

---

## Deployment (Railway)

**Two app services and one managed datastore.** No Redis. No worker service.

| Service | Root | Start command |
|---|---|---|
| `api` | `api/` | Dockerfile `CMD`: `rails server` (Puma, with the Solid Queue plugin) |
| `web` | `web/` | `npm run start` |
| PostgreSQL 18 | managed (`ghcr.io/railwayapp-templates/postgres-ssl:18`) | - |

Environment variables: `DATABASE_URL`, `DEVISE_JWT_SECRET_KEY`, `SECRET_KEY_BASE`, `FRONTEND_URL`, `SOLID_QUEUE_IN_PUMA` (**required**: without it no job ever runs), `HONEYBADGER_API_KEY`, `ANTHROPIC_API_KEY`, `SMTP_HOST`, `SMTP_PORT` (`2587`), `SMTP_USER`, `SMTP_PASS`, `MAILER_FROM`, `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (**optional**: absent keys degrade push to `503 push_unavailable` and the digest to email-only; per-environment pairs, generated with `bin/rails push:vapid`; § Push notifications).

`SECRET_KEY_BASE` is a random secret for signing cookies (`bin/rails secret`). Chosen over `RAILS_MASTER_KEY` because this app stores no secrets in `credentials.yml.enc`; sharing the dev master key with production is unnecessary. Without one of these, the app aborts with `Missing secret_key_base for 'production' environment`.

**Builder:** Railpack or a Dockerfile. Never Nixpacks: it is deprecated.

### Backups

The **Railway Hobby plan has no managed backups**, so the data is defended from outside this repository: the private [`karirkalyan-backups`](https://github.com/chairulakmal/karirkalyan-backups) repo runs a daily `pg_dump` on a GitHub-hosted runner at 05:15 JST and keeps the gzipped result as a GitHub Actions artifact on **60-day retention**, set explicitly in the workflow, because the platform default is 90 days and four sentences on `/privacy`, including the erasure promise, name the number 60. It is written here so a future reader can check the claim without cross-repo access; if that retention ever changes, the legal pages (both locales) change with it.

Two properties worth knowing, both load-bearing for the privacy page:

- **The dump is the full database**, which means **GitHub holds a copy of every resume**. That is why GitHub is one of the five named sub-processors in § Legal pages: the backup repo is private and the workflow is boring, which is exactly what makes it the disclosure a policy forgets.
- **It only dumps when the data changed.** The job fingerprints `users` / `applications` / `timeline_entries` (`count @ max(updated_at)`) and skips when the fingerprint matches the one the previous run committed, so `solid_queue` / `solid_cache` churn never triggers a dump. The fingerprint commit doubles as the keep-alive against GitHub's 60-day cron auto-disable.

A restore drill passed 2026-07-11: `db-dump-7` restored into a scratch Postgres 18.4 with zero errors, all 17 tables and every row intact. The drill steps live in the backups repo's README. The dump is deliberately **not** a live mirror on a free Postgres tier: a second live database is HA machinery for an app whose actual need is an undo button, and free tiers expire, pause idle databases, and add a version-compatibility surface to maintain.

### Production lessons, recorded so they are not relearned

- **No Thruster.** It fronted Puma on a different port, creating a double proxy (Railway → Thruster → Puma) that 502'd when Railway's port matched Thruster's but not Puma's. Railway is already the reverse proxy; the second layer was overhead, not value.
- **`Dockerfile` `CMD` overrides `Procfile`** unless Railway explicitly invokes the Procfile. Both must agree. This silently broke the old single-service Puma+Sidekiq setup: only Puma ran, jobs enqueued to Redis, nothing consumed them, and reminders never sent. Solid Queue in Puma removes the whole class of failure.
- **`bin/docker-entrypoint`** ran `db:prepare` only when args matched `./bin/rails server` literally. After switching to `bundle exec rails server -b 0.0.0.0 -p 8080` the condition stopped matching and migrations stopped running. Match against `*"rails server"*`.
- **Cloudflare custom domain** (`kk.chairulakmal.com`): grey cloud (DNS only) is required for Railway's Let's Encrypt ACME HTTP-01 challenge. Orange cloud intercepts `.well-known/acme-challenge/` and breaks provisioning.
- **DNSSEC** drifted after a Cloudflare key rotation (the DS record at the registrar no longer matched), causing SERVFAIL on validating resolvers. Disabled cleanly: remove the DS record at the registrar *first*, then disable DNSSEC in Cloudflare.

---

## Local development

**Prerequisites:** Docker, Ruby 3.4.9 (via mise), Node 24

Node is pinned to 24 in **one** place (`web/.nvmrc`), and everything else reads it: `actions/setup-node` via `node-version-file`, and Railpack when it builds the production image. `web/package.json` restates it as `engines.node` because Railpack consults that first. Keep them in step; a CI runtime that differs from production's is how the `npm ci` lockfile divergence bit twice: in v1.1.0, and again in the dependency refresh after v1.3.0.

Local Postgres tracks production's major version: both are **18**. A dev database a major version behind production is a bug waiting to be found in production, and the two drifted apart for exactly that reason once already: Railway was moved to `postgres-ssl:18` while `docker-compose.yml`, CI, and this file all still said 16.

The `postgres:18` image moved its data directory: `PGDATA` is now `/var/lib/postgresql/18/docker` and the declared volume is `/var/lib/postgresql`, not `/var/lib/postgresql/data`. `docker-compose.yml` mounts the new path: mounting the old one against an 18 image leaves Postgres writing outside the named volume, and the database silently empties on every `docker compose down`. Upgrading a machine that still has a 16 volume needs `docker compose down -v` and a fresh `db:setup` (dev data is disposable; the volume cannot be read by an 18 server).

```bash
cd api && docker compose up -d    # postgres 18 only; no Redis

cd api && bundle install && bin/rails db:create db:migrate db:seed && bin/rails server  # :3001
cd web && npm install && npm run dev                                                    # :3000
```

`db:seed` is **not optional** any more. Registration is closed (§ Registration is closed), so a freshly migrated database has no account and the app has no sign-up form to make one with: seeding is how you get a login. It creates the demo account, its 12 sample applications, and (outside production) the `e2e` account the Playwright suite signs in as. It is idempotent, so re-running it is safe and CI runs it after `db:migrate`. The operator's alternative is `bin/rails users:create`.

Jobs run inline via the `:async` adapter in development: there is no worker process to start.

---

## Versioning & releases

Semantic versioning, with **major redefined against the compatibility surfaces this project actually has**. The textbook rule (*major means you broke the API your consumers depend on*) does not fit: `web/` is the only client of `/api/v1` and it ships in the same commit, so there is no consumer to break and the major digit could never legitimately fire. A version scheme whose top digit is unreachable is not a scheme.

The surface that does exist, and that a solo operator feels at 2 a.m., is **rollback**. So:

| Level | Rule | Examples |
| --- | --- | --- |
| **major** | The previous image **cannot** be redeployed against the new database. Rolling back needs a plan. | An irreversible or destructive migration; `/api/v1` → `/api/v2`; removing or renaming a state in `ApplicationFSM` (stored `status` values stop validating); dropping a required env var. |
| **minor** | New user-visible capability, and rollback is still a redeploy. | A feature (ghost prediction, the Kanban board); a new endpoint; a new optional field or additive migration. |
| **patch** | No new capability. | Bug fix, security fix, dependency refresh, performance work. |

The test for major is mechanical: **could I deploy the previous release's image against the database this release leaves behind, and would it boot and serve?** If no, it is a major. The `positions` entity in `TODO.md` is the first plausible `2.0.0`: it adds a table *and* changes the state machine.

### The version number lives in exactly one place: the git tag

`git tag v1.3.0` and its GitHub Release are the source of truth. `web/package.json` carries a static `"version": "0.0.0"`, which is deliberate: the package is `private: true`, so npm never reads or publishes the field, and a number kept there would be a hand-copied duplicate of the tag, the same failure that killed `PLAN.md` and that the FSM's single `TRANSITIONS` table exists to prevent. `api/` has no version constant. There is nothing to keep in sync, so nothing can drift.

Releasing is therefore: land the work (with `SPEC.md` already updated, per the rule at the top of this document), move the `CHANGELOG.md` **Unreleased** block under a version heading, tag, and `gh release create`.

---

## Decisions log

Reversed decisions keep both entries. A spec that hides its own history teaches nothing.

### Registration closed, in v1.4.1

The app shipped with open sign-up because that is what `rails generate devise` hands you, not because anyone decided a stranger should be able to put their resume in this database. Once the question was asked out loud the answer was not close: the demo account tells the portfolio story better than an empty new one, and every real user the sign-up form could attract would arrive owing them a custodial promise this deployment cannot make. Closing it removed more code than it added. Full reasoning in § Registration is closed.

The alternatives considered and rejected: **an invite code** (the same custody problem, plus a mechanism to build), and **leaving it open and writing a careful privacy policy** (a policy is a promise, not a control; it does not make one `pg_dump` a backup strategy).

### No document version history

`applications.resume` is a single `bytea` column; re-uploading overwrites. Keeping the previous *n* versions was considered in v1.4.1 and rejected. Every retained version is another megabyte in the primary Postgres whose only backup is a daily dump, and the honest form of the feature is a `documents` table plus object storage, a real migration in service of a file nobody reads. The overwrite is also the *only* deletion path a user has for a document, which is worth more than an undo.

### Job queue: Solid Queue over Sidekiq *(reversal: supersedes the entry below)*

Solid Queue and Solid Cache run on the existing Postgres and add zero Railway services. That one change closed four separate findings at once: the recurring `FollowUpReminderJob` (Solid Queue recurring tasks), a Rack::Attack throttle store shared across Puma workers (Solid Cache), durable `deliver_later`, and the removal of a dead-feature caveat.

The cost is honest: Solid Queue is less observable than Sidekiq's dashboard, and its threads share Puma's connection pool, which is a real constraint (see Background jobs). At personal scale, two services and one Postgres beats three services, a Redis, and a worker that silently was not running.

### ~~Job queue: Sidekiq over Solid Queue~~ *(reversed in v1.0.0)*

> The original reasoning: Sidekiq is the standard in most Tokyo Rails shops and a more mature, observable runtime. It also *introduced* Redis, which then backed the production `Rails.cache` and the Rack::Attack throttle store.

What actually happened: under a Dockerfile build, Railway ignores the `Procfile`, so only Puma ran and nothing consumed the queue. Reminders and welcome emails silently never sent. The fix was either a dedicated `sidekiq` service (three services plus Redis) or removing Sidekiq. The second was better at this scale. **The industry-standard choice was the wrong choice here**; "what Tokyo shops use" is a poor tiebreaker for a single-user app's infrastructure.

### Serialiser: plain `as_json` override, no gem

Each model overrides `as_json` explicitly. Easy to read, nothing to explain, no magic. `Application#as_json` excludes `resume` and `cover_letter`.

### File storage: PostgreSQL `bytea`, 1 MB cap

Raw bytes in `bytea`. No Active Storage, no S3. Right-sized for personal scale: files are small, transactional consistency with the rest of the row is free, no presigned-URL complexity. The limit is enforced in the model, not at the database level.

Thumbnail previews were considered and rejected: they need `poppler`/`ghostscript` on the server plus extra storage, and are rarely useful in a personal tracker.

### File timestamps: `resume_updated_at` / `cover_letter_updated_at`

Two datetime columns set via `before_save` callbacks using dirty tracking (`will_save_change_to_resume?`), so they fire only when the binary actually changes. Rendered as "resume.pdf · uploaded 3 days ago"; no thumbnail needed.

This is the one place callbacks are used, and deliberately so: it is a property of the row, not business logic, and it must hold for seeds and factories too.

### Reminders surface both in-app and by email

A reminder writes a `TimelineEntry` on the detail page, and the same job sends an email. It started in-app only: for a tracker you check daily, a timeline entry avoids spam and unsubscribe handling. Email was added once the nudge needed to reach the user when the app was *closed*, which is the point of a reminder. The `TimelineEntry` remains the source of truth.

### AI URL pre-fill: Claude Haiku 4.5, server-side, SSRF-guarded

Runs entirely server-side in a service object, never from the browser, so the Anthropic key never leaves the server and rate limiting and the outbound-fetch guard live in one place. A tool/JSON schema rather than free-form text, so the fields are structured and need no parsing. Haiku 4.5 because extraction is a small job: a larger model would spend money for no benefit. Claude over the alternatives for native Japanese comprehension, which is what makes the feature useful for a Tokyo job search. Degrades gracefully: with no API key the endpoint returns `503` and the rest of the app is unaffected.

### Error localization keyed on HTTP status, not on an error code

The obvious design is for Rails to return a stable machine-readable code (`stale_record`, `invalid_credentials`) and for `web/` to look that code up in a message catalog. The API's codes stay the single source of truth, `web/` supplies presentation, and nothing is duplicated.

**That design was specified before anyone checked the response shape, and the shape does not support it.** Rails returns a free-text English sentence and an HTTP status: there is no code, anywhere. Adding one is an `api/` change, and v1.1.0 is `web/`-only by design (see `TODO.md`).

Rather than break the boundary for a frontend release, or invent a code by string-matching English sentences in `web/` (which is a parser for prose, and breaks the first time someone rewords a validation message), v1.1.0 localizes on the status. Coarse, but every string it produces is correct, and the two errors users actually see (`401` bad credentials, `409` stale `lock_version`) are exactly the ones a status distinguishes cleanly.

The cost is per-field `422` text staying English. The fix is real error codes, and it belongs in **v1.2.0**, which already opens with an `api/` change for the FSM transition table. One `api/` PR, two reasons.

*(Addendum, v1.2.0: both halves landed: every API error carries a stable `code` (`validation_failed` with per-field `details`), and `web/` now keys its catalog on the code, with the status map demoted to the fallback layer. See § Server-side error messages for the resolution order.)*

The general lesson is the one this file exists to enforce: a spec that describes a mechanism nobody verified is a bug in the spec, not a requirement on the code.

### Board data: bounded fetch-all over per-column cursors

The board follows the existing cursor-paginated index to exhaustion (`limit=100`, capped at 10 pages) rather than giving each column its own cursor with a "load more". Per-column pagination looks more scalable but is fake precision here: it costs seven initial requests instead of a handful, and it breaks the board's one job: showing the whole pipeline at a glance. A column that says "load more" is a column whose depth you cannot read at a glance, and glancing is the only reason to open a board instead of the list.

The `status` list filter (§ API contract) makes the per-column fetch **possible** (seven requests, `status=<one>` each), and it is still not worth making. Nothing above depended on that parameter's absence: one reason is a cost the parameter does not remove, the other is a fact about what a board is for, which no API shape can move. This is an option that is now cheap and still wrong, not an objection that was answered.

The cap keeps the pathological case (thousands of rows) from hanging the page; a personal tracker that hits it has outgrown a personal tracker. The truncation is stated on screen, not silent.

### Board drag-and-drop: native HTML5, no library

`dnd-kit` and friends buy touch support, keyboard dragging, and animation polish. The board doesn't need them: the card menu is already the keyboard path and the only complete one (drag can't reach the closed rail), which demotes drag to a pointer convenience; and a pointer convenience doesn't justify a dependency. Native `draggable`/`drop` events are ~30 lines. If touch dragging ever matters, the menu already works on touch today, and a library can replace the listeners without touching the data flow.

### No Company / Platform / Tag models

These add CRUD without adding new patterns. The goal is to show FSM, transactional writes, background jobs, and two-tier testing, not to maximise model count. The URL host already supports the job-board filter.

### DB cleaning: `database_cleaner-active_record`, transaction strategy

Wraps each spec in a transaction and rolls back. Fastest option; truncation is only needed for multi-connection scenarios this project does not have.

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
