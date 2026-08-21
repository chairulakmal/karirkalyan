# KarirKalyan

**Track your career, not just job applications.**

[![API CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml) [![Web CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[🇯🇵 日本語](README.ja.md)

A job application tracker with a Rails 8 API and a Next.js 16 kanban board. Every status change goes through a server-enforced finite state machine, and the client asks the API which moves are legal instead of keeping its own copy of the rules. Below: a live demo, the highlights, the stack, how to run it locally, and how it is tested; [ARCHITECTURE.md](ARCHITECTURE.md) walks the design decisions.

https://github.com/user-attachments/assets/862ca199-95e5-4e27-b9ef-ada7eb10a350

*30 seconds: drag a card to a new column, open the timeline to see the transition recorded, then find a quiet application flagged as ghost risk.*

<!-- SCREENSHOT: kanban board at /board, English locale, demo account data. Embed here once captured. -->

**Live demo:** [kk.chairulakmal.com](https://kk.chairulakmal.com). The demo account is one click ("Try demo account" on the sign-in page) and comes prefilled with 12 applications spread across the pipeline, from `wishlist` through to `accepted`. API docs are served as Swagger UI at [`/api-docs`](https://kk-api.chairulakmal.com/api-docs).

## Highlights

- Every write carries a `lock_version`. A concurrent edit returns `409 Conflict` instead of silently overwriting, and the board undoes a rejected drag and asks you to reload. Details: [ARCHITECTURE.md § The state machine](ARCHITECTURE.md#the-state-machine-is-a-plain-ruby-module) and [§ The write path of a transition](ARCHITECTURE.md#the-write-path-of-a-transition).
- Ghost prediction flags applications that have gone quiet: 15 working days after applying, 10 after a phone screen. Weekends and Japanese holidays don't count against the company. Details: [ARCHITECTURE.md § Ghost prediction](ARCHITECTURE.md#ghost-prediction-is-derived-not-stored).
- A daily follow-up digest goes out at 08:15 JST. It skips weekends and Japanese holidays (New Year, Golden Week, Obon); a skipped day moves to the next business day and still sends only once. Turn on notifications on `/settings` to get the same digest as a push, with its own retry if delivery fails. Details: [ARCHITECTURE.md § Digest scheduling](ARCHITECTURE.md#digest-scheduling-defers-never-drops).
- The app is bilingual: English and Japanese. CI checks that the two catalogs stay in sync and that the state machine still lives in one file (`lint:i18n`, `lint:fsm`). Japanese text also wraps at phrase boundaries (文節) instead of mid-word, using `word-break: auto-phrase` where supported and server-side [BudouX](https://github.com/google/budoux) segmentation otherwise. Details: [ARCHITECTURE.md § i18n parity](ARCHITECTURE.md#i18n-parity-is-a-ci-check-not-a-convention).
- One PostgreSQL instance handles background jobs, caching, and uploaded PDFs. No Redis, no object store, no separate worker service. Trade-offs: [ARCHITECTURE.md § One PostgreSQL instance](ARCHITECTURE.md#one-postgresql-instance-no-redis).
- Sign-in also works with a passkey. WebAuthn is wired directly into Devise (the `webauthn` gem), so a passkey made on desktop syncs to your phone through a password manager like Proton Pass. The password form stays as a fallback; enroll a passkey on `/settings`. Details: [ARCHITECTURE.md § The JWT never reaches the browser](ARCHITECTURE.md#the-jwt-never-reaches-the-browser).
- On Android, the app is a share target. Share a job posting from any app (LinkedIn, a browser tab, a recruiter's email) and it opens the new-application form with AI pre-fill already reading it; a share with no link fills the paste box instead. Install through **Chrome**: the share menu needs the WebAPK, which Brave doesn't build, so a Brave install is just a shortcut without this feature. Sharing *from* Brave still works.
- Once installed, it behaves like a real app, not a website in a browser frame. On phones it shows a bottom tab bar. Long-press the launcher icon for New application and Board shortcuts. A `monochrome` icon lets Android tint the logo instead of dimming it.

## Stack

| Layer | What the code pins |
|---|---|
| API | Rails 8.1 (API-only), Ruby 3.4.9, Devise + devise-jwt |
| Frontend | Next.js 16.2, React 19.2, TypeScript 5, Tailwind CSS, next-intl |
| Database | PostgreSQL 18 in Docker, both locally and in production |
| Deployment | Docker Compose + Cloudflare Tunnel, self-hosted (`SPEC.md` § Deployment) |
| Tests | RSpec (unit and request tiers), Vitest (`web/` units), Playwright 1.60 end to end |

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
npm run lint && npm run lint:i18n && npm run lint:fsm && npx tsc --noEmit && npm test
npm run test:e2e                           # Playwright; needs Postgres up and the seed loaded
```

## Testing and CI

The API test suite has two tiers. Unit specs (`spec/lib`, `spec/services`) run with no database. Request specs (`spec/requests`) hit a real PostgreSQL and double as the source for the OpenAPI spec via rswag, so the API docs and the tests cannot drift apart. SimpleCov enforces an 80% line minimum with branch coverage on, and prosopite fails any request spec that triggers an N+1 query.

The frontend has a Playwright smoke suite ([`web/e2e/`](web/e2e)) that drives both apps through the critical paths: create an application, transition its status, attach a resume.

CI is two path-aware workflows. [`api.yml`](.github/workflows/api.yml) runs RuboCop, Brakeman, bundler-audit, and RSpec. [`web.yml`](.github/workflows/web.yml) runs ESLint, the i18n parity check, the FSM-copy check, `tsc`, the Vitest unit suite, the production build, and the Playwright suite against a real Rails API seeded inside the job.

## Architecture

[ARCHITECTURE.md](ARCHITECTURE.md) walks through the decisions with file paths: the state machine and its single transition table, the transactional write path and the `409` contract, ghost prediction derived from the audit trail, holiday-aware digest scheduling, the bilingual catalog setup, and the single-Postgres design. Each section states the choice, the reasoning, and the trade-off accepted. [SPEC.md](SPEC.md) is the full technical spec and the project's source of truth, kept in sync with the code by policy.
