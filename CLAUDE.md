# KarirKalyan

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Full-stack job application tracker. Rails 8 API (`api/`) + Next.js 16 frontend (`web/`).

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
