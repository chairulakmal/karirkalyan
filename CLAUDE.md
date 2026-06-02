# KarirKalyan

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Full-stack job application tracker. Rails 8 API (`api/`) + Next.js 16 frontend (`web/`).

## Stack

- **Backend:** Rails 8 API-only, Ruby 3.4.9 (mise), PostgreSQL 16, Devise + devise-jwt
- **Frontend:** Next.js 16 App Router, Tailwind CSS, JWT in `httpOnly` cookie
- **Infra:** Sidekiq + Redis for background jobs, Railway for deployment

## Local Dev

```bash
docker compose up -d        # postgres + redis

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
