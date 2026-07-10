# KarirKalyan

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Full-stack job application tracker. Rails 8 API (`api/`) + Next.js 16 frontend (`web/`).

## Status

**v1.0.1 released** 2026-07-10 (tag `v1.0.1`). Security review and its fixes; every finding
from that pass and from the initial v1.0.0 review is resolved.

**v1.1.0 is the next release** — Japanese UI (i18n), then a homepage + about/docs revamp,
then a Kanban board view of the FSM. That order matters; `TODO.md` explains why.
Open work lives in `TODO.md`; shipped work lives in `CHANGELOG.md`. Read `TODO.md` before
starting work.

## Branching & PRs

How much ceremony a change gets depends on what kind of change it is:

| Change type | Branch + PR? |
| --- | --- |
| Features | **Must** — always a feature branch and a PR |
| Security fixes | **Must** — always a feature branch and a PR |
| Bug fixes | **Should** — default to a PR; skip only for something trivial |
| Chores | **May** — a PR is fine, so is committing straight to `main` |
| Docs | **No** — commit directly to `main`, no branch, no PR |

"Docs" means documentation only: `*.md`, comments, `llms.txt`. A change that touches docs
*and* code is not a docs change — classify it by the code.

### What actually enforces this

`main` is governed by a **ruleset** named `conserve-main`, not classic branch protection —
`gh api repos/.../branches/main/protection` returns a misleading `404`. Inspect it with
`gh api repos/chairulakmal/karirkalyan/rules/branches/main`.

It requires a pull request (0 approvals), requires the `Lint, security & test` and
`Lint, typecheck & build` checks, and blocks deletion and force-pushes. The **Admin**
repository role has `bypass_mode: always`, so Akmal can push straight to `main` — that is
what makes the docs row above possible. The bypass applies to *every* rule, so the table is
still discipline rather than a wall: don't reach for it outside the docs row.

## Subagents

Delegate to a subagent when the task genuinely warrants it — a wide search whose file
dumps you don't need, or a review that benefits from a cold read of the diff:

- **`Explore`** — broad searches across `api/` and `web/` when you need the conclusion,
  not the file contents.
- **`code-reviewer`** — senior review of a finished unit of TypeScript or Rails work.
  Worth running on anything headed for a PR under the table above.
- **`docs-auditor`** — check docs against implementation after a behavior change.

Not for tasks you can do inline. Each subagent starts cold and re-derives context you
already have, so a multi-part task is not by itself a reason to spawn one.

## Stack

- **Backend:** Rails 8 API-only, Ruby 3.4.9 (mise), PostgreSQL 16, Devise + devise-jwt
- **Frontend:** Next.js 16 App Router, Tailwind CSS, JWT in `httpOnly` cookie
- **Jobs & cache:** Solid Queue + Solid Cache — Postgres-backed, single database, no
  Redis/Sidekiq. Replaced Sidekiq/Redis to keep Railway to two services + one Postgres.
- **Infra:** Railway for deployment

## Background jobs (Solid Queue)

- **Adapter:** `:solid_queue` in production (`config/application.rb`); `:async` in
  development, `:test` in test.
- **Workers run inside Puma** — `config/puma.rb` has `plugin :solid_queue if
  ENV["SOLID_QUEUE_IN_PUMA"]`; that env var must be set on the Railway `api` service.
  No separate worker service.
- **Recurring jobs:** `config/recurring.yml` — `FollowUpReminderJob` daily at
  08:15 JST (cron `15 8 * * * Asia/Tokyo`), plus hourly finished-job cleanup.
- **Single-DB:** queue/cache tables live in the primary Postgres via a normal
  migration; there are no `db/queue_schema.rb`/`db/cache_schema.rb` files and no
  `connects_to`/`database:` config. Keep it that way unless the app outgrows it.
- **Cache:** `:solid_cache_store` in production; Rack::Attack throttle counters go
  through `Rails.cache`, so they're shared across Puma workers.
- **DB pool:** `database.yml` sets `max_connections` to `RAILS_MAX_THREADS + 6` —
  Solid Queue's ~5 threads share the pool with Puma's request threads and it
  exits (stopping Puma with it) if the pool is smaller than its thread count.

## Local Dev

```bash
docker compose up -d        # postgres only

cd api && bundle install && bin/rails db:create db:migrate && bin/rails server  # :3001
cd web && npm install && npm run dev                                            # :3000
```

## Key Conventions

**State machine** — `app/lib/application_fsm.rb` is a plain PORO with a `TRANSITIONS` array. Status changes go through `Applications::TransitionService`, never via direct attribute writes.

**Service objects** — explicit call sites in `app/services/`. No model callbacks for business logic.

**Testing — two tiers:**
- Unit specs (no DB): `spec/lib/`, `spec/services/` — test pure logic in isolation
- Request specs (real DB): `spec/requests/` — full HTTP stack, also source for rswag OpenAPI generation

Do not mock the database in request specs. Request specs must hit a real PostgreSQL database.

**File storage** — resume/cover letter stored as `bytea` in PostgreSQL (≤ 1 MB). Served via `send_data` at dedicated download endpoints, excluded from standard JSON serialisation.

**Auth** — JWT issued by Rails in `Authorization` header; Next.js `/api/auth/session` route receives it and sets an `httpOnly` cookie. Token never reaches client-side JS.

**Optimistic locking** — `lock_version` column on `applications`. Return `409` on `StaleObjectError`.

**Idempotent jobs** — reminder job writes `TimelineEntry` with `idempotency_key = "reminder-{id}-{date}"` and no-ops if key already exists.

## API Routes

```
POST   /api/v1/auth/sign_up|sign_in
DELETE /api/v1/auth/sign_out

GET|POST        /api/v1/applications
POST            /api/v1/applications/prefill          # AI URL pre-fill (Claude)
GET|PATCH|DELETE /api/v1/applications/:id
PATCH           /api/v1/applications/:id/transition
GET             /api/v1/applications/:id/resume
GET             /api/v1/applications/:id/cover_letter
GET             /api/v1/dashboard
GET             /api-docs
```
