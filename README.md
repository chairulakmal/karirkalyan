# KarirKalyan

[![API CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml) [![Web CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[🇯🇵 日本語](README.ja.md)

A job application tracker with a Rails 8 API and a Next.js 16 kanban board. Every status change goes through a server-enforced finite state machine, and the client asks the API which moves are legal instead of keeping its own copy of the rules. Below: a live demo, the highlights, the stack, how to run it locally, and how it is tested; [ARCHITECTURE.md](ARCHITECTURE.md) walks the design decisions.

https://github.com/user-attachments/assets/862ca199-95e5-4e27-b9ef-ada7eb10a350

*30 seconds: drag a card to a new column, open the timeline to see the transition recorded, then find a quiet application flagged as ghost risk.*

<!-- SCREENSHOT: kanban board at /board, English locale, demo account data. Embed here once captured. -->

**Live demo:** [kk.chairulakmal.com](https://kk.chairulakmal.com). The demo account is one click ("Try demo account" on the sign-in page) and comes prefilled with 12 applications covering every state. API docs are served as Swagger UI at [`/api-docs`](https://api-production-4899.up.railway.app/api-docs).

## Highlights

- The state machine is a plain Ruby module, not a gem. [`api/app/lib/application_fsm.rb`](api/app/lib/application_fsm.rb) is a frozen `TRANSITIONS` array you can read in one pass. Every transition writes the new status and its timeline entry in one database transaction, and the frontend fetches the legal moves from `GET /api/v1/transitions` instead of restating the table in TypeScript. The rules exist in exactly one file.
- Optimistic locking turns a concurrent edit into a `409 Conflict` instead of a silent overwrite. Every write carries a `lock_version`; on `409` the board snaps the dragged card back and asks for a reload.
- Ghost prediction flags applications that have been quiet for longer than your own p90 reply time. The p90 is rebuilt from the timeline audit trail with a window function, so there is no new column and no new table. Until a stage has five recorded replies it uses a stated global default, and the UI says which basis it used.
- The Japan market layer records what generic trackers ignore. Each application carries the recruiter channel (direct, agency, referral), and the app warns before a duplicate submission: the first agency to submit you to a company owns that candidacy for roughly 12–18 months, and the fee follows the owner, so a second submission while a window is open is real damage the incumbents let you walk into. Compensation is stored as the 年収 structure (guaranteed months vs performance-tied bonus months), not one number; the posting's Japanese requirement (JLPT N1/N2, business, conversational, none) is a first-class filter; each application records whether the employer sponsors a work visa (unknown by default, which is itself a risk flag worth seeing) and which status of residence a sponsored role falls under; it also records how the company can actually employ a Japan resident (own entity, employer-of-record, contractor-only, or not at all), the filter that silently kills most global-remote roles; and the posting text is snapshotted at pre-fill time, so interview prep survives the posting being taken down. Nearly all of it, sponsorship and hiring entity included, is extracted by the same AI pass that reads company and role, so recording costs a review, not data entry; the status of residence is the one manual field, a single tap on the rare posting that names it.
- Two more Japan-specific reads decide whether an offer is even takeable. Whether a remote role is survivable from JST: store the company's home timezone and the overlap it demands, and the app maps its working day into your clock, marks when the window crosses midnight, and flags a 1am start before you apply, with a timezone-correct `.ics` export and a push the morning before an interview. And where you stand yourself: your own status of residence and its expiry drive a days-remaining warning and the Certificate-of-Eligibility lead time a job change needs (sourced to the current MOJ processing statistics). A public, no-auth Highly Skilled Professional points calculator estimates the visa score on the engineering track, its point table verified against the MOJ source and linked back to it.
- The dashboard and board earn their keep off the same audit trail. Response rate, ghost rate, and average time-in-stage as stat cards; the dashboard opens on the applications still in play (archived ones live on the board's closed rail, out of the working list); the filter state lives in the URL, so a filtered view is linkable and survives a reload; the two candidate-side board columns are triaged with a notes excerpt, the source it came from, and how long it has sat there, stalest-first; and cover-letter talking points are extracted as bullets from your resume against the posting (bullets, not a draft, because a generic AI letter is the wrong signal in this market).
- The daily follow-up digest goes out at 08:15 JST and skips weekends and Japanese national holidays, including New Year, Golden Week, and Obon. A skipped reminder is deferred to the next business day and sent exactly once, because the idempotency key is derived from the follow-up date, not the send date. Enable notifications on `/settings` and the same digest also lands as a push notification on the installed app: one batch, two channels, and a push failure retries without re-sending the email.
- The product is bilingual, English and Japanese, and CI enforces catalog parity. A missing Japanese key lints, typechecks, and builds clean, so `npm run lint:i18n` diffs the two catalogs and fails the build on any key present in only one language. Japanese text also breaks at phrase boundaries (文節) rather than mid-word: `word-break: auto-phrase` where the browser supports it, and server-side [BudouX](https://github.com/google/budoux) segmentation on the headings everywhere else.
- One PostgreSQL instance carries everything: background jobs (Solid Queue), cache and rate-limit counters (Solid Cache), and uploaded PDFs (`bytea` columns). No Redis, no object store, no separate worker service.
- Sign-in takes a passkey as well as a password. WebAuthn is wired into Devise by hand (the `webauthn` gem): discoverable credentials make the ceremony usernameless, and no authenticator restriction keeps third-party providers in the chain, so a passkey created on the desktop syncs to the phone through a password manager like Proton Pass. A verified assertion mints the same 1-day, JTI-revocable JWT as a password sign-in, sign-out still revokes every device, and the password form stays as the permanent fallback. Enrollment lives on `/settings`.
- Installed on Android, the app is a share target: share a posting from any app (LinkedIn, a mobile tab, a recruiter's email) and land in the new-application form with the AI pre-fill already reading it; a share with no link in it seeds the paste box instead. One install note: install once via **Chrome**, because share-sheet integration lives in the WebAPK and Brave has no minting server: a Brave install is a home-screen shortcut where the feature silently doesn't exist. Sharing *from* Brave works fine.
- Once installed it behaves like an app, not a site in a frame: phone widths get a bottom tab bar padded for the gesture bar, long-pressing the launcher icon offers New application and Board shortcuts, and a `monochrome` manifest icon lets Android themed icons tint the monogram instead of dimming the full-colour plate.

## Stack

| Layer | What the code pins |
|---|---|
| API | Rails 8.1 (API-only), Ruby 3.4.9, Devise + devise-jwt |
| Frontend | Next.js 16.2, React 19.2, TypeScript 5, Tailwind CSS, next-intl |
| Database | PostgreSQL 18, Docker locally, Railway managed in production |
| Tests | RSpec (unit and request tiers), Playwright 1.60 end to end |

## Running locally

Prerequisites: Docker, Ruby 3.4.9, Node 24.

```bash
# 1. PostgreSQL 18 (the only container)
cd api && docker compose up -d

# 2. API on :3001
bundle install
bin/rails db:create db:migrate
bin/rails db:seed        # required: registration is closed, so the seed is how you get a login
bin/rails server

# 3. Frontend on :3000, in a second terminal
cd web && npm install && npm run dev
```

Open [localhost:3000](http://localhost:3000) and sign in with the seeded demo account, `demo@karirkalyan.com` / `oretachinomachida`. Background jobs run in-process in development, so there is no worker to start. Env vars and deeper setup notes live in [api/README.md](api/README.md) and [web/README.md](web/README.md).

Run the test suites:

```bash
# API, from api/
bin/rails db:test:prepare
bundle exec rspec                          # full suite
bundle exec rspec spec/lib spec/services   # unit specs, no database
bundle exec rspec spec/requests            # request specs against a real PostgreSQL

# Frontend, from web/
npm run lint && npm run lint:i18n && npx tsc --noEmit
npm run test:e2e                           # Playwright; needs Postgres up and the seed loaded
```

## Testing and CI

The API test suite has two tiers. Unit specs (`spec/lib`, `spec/services`) run with no database. Request specs (`spec/requests`) hit a real PostgreSQL and double as the source for the OpenAPI spec via rswag, so the API docs and the tests cannot drift apart. SimpleCov enforces an 80% line minimum with branch coverage on, and prosopite fails any request spec that triggers an N+1 query.

The frontend has a Playwright smoke suite ([`web/e2e/`](web/e2e)) that drives both apps through the critical paths: create an application, transition its status, attach a resume.

CI is two path-aware workflows. [`api.yml`](.github/workflows/api.yml) runs RuboCop, Brakeman, bundler-audit, and RSpec. [`web.yml`](.github/workflows/web.yml) runs ESLint, the i18n parity check, `tsc`, the production build, and the Playwright suite against a real Rails API seeded inside the job.

## Architecture

[ARCHITECTURE.md](ARCHITECTURE.md) walks through the decisions with file paths: the state machine and its single transition table, the transactional write path and the `409` contract, ghost prediction derived from the audit trail, holiday-aware digest scheduling, the bilingual catalog setup, and the single-Postgres design. Each section states the choice, the reasoning, and the trade-off accepted. [SPEC.md](SPEC.md) is the full technical spec and the project's source of truth, kept in sync with the code by policy.
