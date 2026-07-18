# KarirKalyan

[![API CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml) [![Web CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[🇯🇵 日本語](README.ja.md)

A job application tracker with a Rails 8 API and a Next.js 16 kanban board. Every status change goes through a server-enforced finite state machine, and the client asks the API which moves are legal instead of keeping its own copy of the rules.

https://github.com/user-attachments/assets/862ca199-95e5-4e27-b9ef-ada7eb10a350

*30 seconds: drag a card to a new column, open the timeline to see the transition recorded, then find a quiet application flagged as ghost risk.*

<!-- SCREENSHOT: kanban board at /board, English locale, demo account data. Embed here once captured. -->

**Live demo:** [kk.chairulakmal.com](https://kk.chairulakmal.com). The demo account is one click ("Try demo account" on the sign-in page) and comes prefilled with 12 applications covering every state. API docs are served as Swagger UI at [`/api-docs`](https://api-production-4899.up.railway.app/api-docs).

## Highlights

- The state machine is a plain Ruby module, not a gem. [`api/app/lib/application_fsm.rb`](api/app/lib/application_fsm.rb) is a frozen `TRANSITIONS` array you can read in one pass. Every transition writes the new status and its timeline entry in one database transaction, and the frontend fetches the legal moves from `GET /api/v1/transitions` instead of restating the table in TypeScript. The rules exist in exactly one file.
- Optimistic locking turns a concurrent edit into a `409 Conflict` instead of a silent overwrite. Every write carries a `lock_version`; on `409` the board snaps the dragged card back and asks for a reload.
- Ghost prediction flags applications that have been quiet for longer than your own p90 reply time. The p90 is rebuilt from the timeline audit trail with a window function, so there is no new column and no new table. Until a stage has five recorded replies it uses a stated global default, and the UI says which basis it used.
- The daily follow-up digest goes out at 08:15 JST and skips weekends and Japanese national holidays, including New Year, Golden Week, and Obon. A skipped reminder is deferred to the next business day and sent exactly once, because the idempotency key is derived from the follow-up date, not the send date.
- The product is bilingual, English and Japanese, and CI enforces catalog parity. A missing Japanese key lints, typechecks, and builds clean, so `npm run lint:i18n` diffs the two catalogs and fails the build on any key present in only one language.
- One PostgreSQL instance carries everything: background jobs (Solid Queue), cache and rate-limit counters (Solid Cache), and uploaded PDFs (`bytea` columns). No Redis, no object store, no separate worker service.
- Installed on Android, the app is a share target: share a posting from any app — LinkedIn, a mobile tab, a recruiter's email — and land in the new-application form with the AI pre-fill already reading it; a share with no link in it seeds the paste box instead. One install note: install once via **Chrome**, because share-sheet integration lives in the WebAPK and Brave has no minting server — a Brave install is a home-screen shortcut where the feature silently doesn't exist. Sharing *from* Brave works fine.

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
