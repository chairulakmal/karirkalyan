# KarirKalyan

A full-stack job application tracker — Rails 8 API + Next.js 16 frontend.

Built to demonstrate Rails backend engineering for the Tokyo job market: state machines, transactional audit trails, background jobs, and a two-tier test strategy, all in a codebase a Rails engineer can read end-to-end.

**Live:** [karirkalyan.chairulakmal.com](https://karirkalyan.chairulakmal.com) · **API docs:** `/api-docs`

---

## What this project demonstrates

| Concern | Approach |
|---|---|
| State machine | Custom PORO — no gem; transitions are a plain array you can read |
| Audit trail | `TimelineEntry` written atomically with every status change |
| Auth | Devise + devise-jwt with JTI revocation (real logout) |
| Concurrency | Optimistic locking (`lock_version`) → `409 Conflict` |
| Background jobs | Sidekiq + idempotency key (at-least-once safe) |
| File storage | PostgreSQL `bytea`, 1 MB cap — no object storage for personal scale |
| Dashboard | Pure SQL aggregation — no N+1, no records loaded into Ruby |
| API docs | rswag — request specs and OpenAPI spec share one source |
| Testing | Unit specs (no DB) + request specs (real PostgreSQL) |

This project intentionally mirrors [Awano](https://github.com/chairulakmal/awano), a Next.js multi-tenant support desk. The same patterns — FSM, transactional audit trail, service layer, two-tier testing — expressed in two different stacks.

---

## Stack

- **Backend:** Rails 8 API-only, Ruby 3.4.9, PostgreSQL 16, Devise + devise-jwt, Sidekiq
- **Frontend:** Next.js 16 App Router, Tailwind CSS
- **Infra:** Docker Compose (local), Railway (production)

---

## Repo layout

```
api/   ← Rails 8 API
web/   ← Next.js 16 frontend
```

See [api/README.md](api/README.md) and [web/README.md](web/README.md) for setup instructions.
