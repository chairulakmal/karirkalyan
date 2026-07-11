# KarirKalyan

[![API CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/api.yml)
[![Web CI](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml/badge.svg)](https://github.com/chairulakmal/karirkalyan/actions/workflows/web.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[🇯🇵 日本語](README.ja.md)

A full-stack job application tracker — Rails 8 API + Next.js 16 frontend.

**Live:** [kk.chairulakmal.com](https://kk.chairulakmal.com) · **API docs:** Swagger UI at [`/api-docs`](https://api-production-4899.up.railway.app/api-docs) on the API service

**Demo account** — click **Try demo account** on the [sign-in page](https://kk.chairulakmal.com/sign-in) to explore a prefilled Tokyo tech job search (12 mock applications across Marcari, Vine Corp, Rokuton, and more — all FSM states covered). Prefer signing in manually? `demo@karirkalyan.com` / `oretachinomachida`.

---

## Technical highlights

| Concern | Approach |
|---|---|
| State machine | Custom PORO — no gem; transitions are a plain array, easy to audit |
| Audit trail | `TimelineEntry` written atomically with every status change |
| Auth | Devise + devise-jwt with JTI revocation — stateless JWT with real logout |
| Concurrency | Optimistic locking (`lock_version`) → `409 Conflict` |
| Background jobs | Solid Queue (Postgres-backed, runs inside Puma — no extra service); idempotency key pattern (at-least-once safe) |
| Email | ActionMailer over SMTP (Resend) — welcome email on sign-up + daily follow-up reminder at 08:15 JST (Solid Queue recurring task) |
| AI pre-fill | Paste a job URL → Claude Haiku 4.5 extracts company/role/notes for review before saving; server-side service, SSRF-guarded + rate-limited, reads Japanese postings natively |
| Caching | Solid Cache (Postgres-backed) — Rack::Attack throttle counters shared across all Puma workers, no Redis |
| File storage | PostgreSQL `bytea`, 1 MB cap, PDF magic-byte validation |
| Dashboard | Pure SQL aggregation — no N+1, no records loaded into Ruby |
| Ghost prediction | Flags applications that have gone quiet for longer than *your own* p90 reply time, reconstructed from the audit trail with a window function — no new column, no new table. Falls back to a global default until you have five replies at a stage, and says which it used |
| Kanban board | Drag a card, run an FSM transition — optimistic, with a `409` snap-back. The board fetches the transition table from `GET /api/v1/transitions` rather than mirroring it in TypeScript; a card menu lists every legal next state as the accessible path |
| API docs | rswag — request specs and OpenAPI spec share one source |
| Testing | Unit specs (no DB) + request specs (real PostgreSQL) |
| i18n | The product ships in English *and* Japanese — not just a translated README. next-intl with ICU message catalogs; `ja` is prefixed, `en` is bare, so every page keeps one canonical URL, with `hreflang` and the sitemap to match |
| Pagination | Cursor-based (`?after=<base64_cursor>&limit=20`) |

---

## Finite State Machine

The FSM lives in [`app/lib/application_fsm.rb`](api/app/lib/application_fsm.rb) — a plain Ruby module with a `TRANSITIONS` array. No gem. Open the file and you can read every allowed transition in one pass.

The state model follows industry-standard ATS pipelines (Greenhouse, Lever, Workday) for the recruiter-driven stages, combined with the candidate-side states (`wishlist`, `withdrawn`, `ghosted`) that personal trackers like Huntr and Teal add on top.

```mermaid
flowchart LR
    subgraph pipeline [Interview pipeline]
        direction LR
        applied --> phone_screen --> technical --> final_round
    end

    wishlist --> draft --> applied
    final_round --> offer

    offer --> accepted
    offer --> declined
    offer --> rejected
    pipeline -- company passes --> rejected
    pipeline -- no response --> ghosted
```

Several transitions are omitted from the diagram to keep it readable: any non-terminal state can also move to `withdrawn` (candidate exits early) or `archived` (housekeeping); `ghosted → applied` covers the company reaching back out; and `rejected → applied` / `withdrawn → applied` cover re-engagement after a negative outcome.

### States

| State | Owner | Meaning |
|---|---|---|
| `wishlist` | candidate | Saved role of interest — not yet applied |
| `draft` | candidate | Application in progress (resume/cover letter being prepared) |
| `applied` | candidate | Application submitted |
| `phone_screen` | recruiter | Recruiter screen scheduled or completed |
| `technical` | recruiter | Technical interview (coding, take-home, etc.) |
| `final_round` | recruiter | Onsite / final-round interview |
| `offer` | company | Offer extended |
| `accepted` | candidate | Offer accepted — terminal |
| `declined` | candidate | Offer received but declined — terminal |
| `rejected` | company | Company declined the candidate — revivable to `applied` |
| `ghosted` | — | No response after a reasonable window — revivable to `applied` |
| `withdrawn` | candidate | Candidate withdrew before any decision — revivable to `applied` |
| `archived` | candidate | Hidden from default views without losing history — terminal |

**Design notes:**
- `rejected`, `ghosted`, and `withdrawn` are not hard terminal — each can transition back to `applied`. Recruiters rescind rejections; companies reach back out to ghosted candidates; candidates re-engage after withdrawing. Every reversal is logged in the `TimelineEntry` audit trail, so the history stays intact.
- Only `accepted`, `declined`, and `archived` are hard terminal. You don't un-accept a job offer, and a candidate declining an offer is a deliberate final outcome, not a mistake.
- `rejected` (company-initiated), `declined` (candidate refuses offer), and `withdrawn` (candidate exits early) are kept distinct. Collapsing them into one "closed" state loses the signal a recruiter looks for in cohort analytics.
- Any non-hard-terminal state can move to `archived` for housekeeping without deleting timeline history.

Status changes go through `Applications::TransitionService`, which asserts the transition before touching the database, then writes the status update and a `TimelineEntry` in a single transaction. Direct attribute writes to `status` are not used anywhere.

**Creation vs. transitions.** The FSM governs *changes*; *creation* sets the initial state. Since people add jobs at whatever stage they're really at, a new application can start in one of three entry states — `wishlist`, `draft`, or `applied` — chosen on the form. `status` is never mass-assignable (the entry value is validated against a curated allow-list), so creation can't be used to jump straight to a later stage; everything past the entry states is reachable only by transitioning. When you add a job you've already applied to, an optional applied date backdates `applied_at` so the dashboard's timing metrics stay accurate.

---

Also see [Awano](https://github.com/chairulakmal/awano) — a Next.js multi-tenant support desk using the same patterns (FSM, transactional audit trail, service layer, two-tier testing) in a different stack.

---

## Authentication

JWT auth via Devise + devise-jwt. Sign-in issues a JWT in the `Authorization` header; the Next.js `/api/auth/session` route captures it and stores it in an `httpOnly` cookie ([`web/app/api/auth/session/route.ts`](web/app/api/auth/session/route.ts)) — the token never reaches client-side JS.

- **Single session per user.** Revocation uses devise-jwt's `JTIMatcher` strategy — one `jti` column on `users` ([`api/app/models/user.rb`](api/app/models/user.rb)), not a per-token allowlist. Signing out rotates the JTI, which invalidates every outstanding token for that user at once — there's no per-device session, so signing out on one device signs you out everywhere. This is deliberate, not a bug.
- **1-day expiry, no refresh flow.** Tokens expire after `1.day` (`jwt.expiration_time` in [`api/config/initializers/devise.rb`](api/config/initializers/devise.rb)); the session cookie's `maxAge` matches. There's no refresh-token endpoint — once a token expires, the API returns `401` and the frontend clears the cookie and redirects to sign-in via `/api/auth/expired` ([`web/app/lib/api.ts`](web/app/lib/api.ts)). Re-authenticating is the only way back in.

---

## Codebase tour

A 90-second walkthrough for reviewers landing cold. Read these files in order and you'll have the whole picture.

```
api/
  app/lib/application_fsm.rb              ← FSM: a TRANSITIONS array, no gem, read top to bottom
  app/services/applications/
    transition_service.rb                 ← Status change + audit row in one DB transaction
  app/queries/applications/
    ghost_risk_query.rb                   ← Reads stage dwell times out of the audit trail (window function)
  app/jobs/follow_up_reminder_job.rb      ← Idempotent recurring job (idempotency_key pattern)
  app/controllers/api/v1/
    applications_controller.rb            ← REST + transition + binary file download
    dashboard_controller.rb               ← Pure SQL aggregation — no N+1, no records loaded
  app/models/
    application.rb                        ← FSM-controlled status, bytea file columns + magic-byte validation
    timeline_entry.rb                     ← Append-only audit log
  spec/
    lib/, services/                       ← Unit specs — no DB, fast
    requests/                             ← Real-DB specs — also the rswag source for OpenAPI

web/
  proxy.ts                                ← Auth route guard (Next.js 16 renamed middleware.ts)
  app/api/auth/session/route.ts           ← Receives JWT from Rails, sets httpOnly cookie
  app/lib/api.ts                          ← Server-side fetch helper — JWT never reaches the browser
  i18n/navigation.ts                      ← Locale-aware Link/router — import these, not next/link
  app/[locale]/(app)/dashboard/page.tsx         ← Applications list + stats
  app/[locale]/(app)/applications/[id]/page.tsx ← Detail + timeline + FSM-driven transition buttons
  app/[locale]/(app)/board/board.tsx            ← Kanban board — drag = transition, legality read from the API
```

Architecture rationale for every decision lives in [SPEC.md](SPEC.md), the technical source of
truth for this project.

---

## Run it locally

Two apps, one repo:

```
api/   ← Rails 8 API           → :3001
web/   ← Next.js 16 frontend   → :3000
```

**Prerequisites:** Docker, Ruby 3.4.9, Node 24

```bash
# 1. Postgres 18 (the only container — no Redis)
cd api && docker compose up -d

# 2. API on :3001
bundle install
bin/rails db:create db:migrate
bin/rails db:seed          # optional — demo account + 12 sample applications
bin/rails server

# 3. Frontend on :3000, in a second terminal
cd web && npm install && npm run dev
```

Open [localhost:3000](http://localhost:3000). Background jobs run inline in development (the `:async` adapter), so there is no worker process to start.

More detail — env vars, tests, demo-data reset — is in [api/README.md](api/README.md) and [web/README.md](web/README.md).

---

## Where to find what

| Looking for | Go to |
|---|---|
| API endpoint shapes, params, responses | [`/api-docs`](https://api-production-4899.up.railway.app/api-docs) (Swagger UI) or `api/swagger/v1/swagger.yaml` |
| Architecture, data model, API contract, design rationale | [SPEC.md](SPEC.md) |
| Shipped work, release by release | [CHANGELOG.md](CHANGELOG.md) |
| Open work and the roadmap | [TODO.md](TODO.md) |
| Local setup and running tests | [api/README.md](api/README.md), [web/README.md](web/README.md) |

---

## Why Rails API + Next.js

Rails does what Rails is good at — data integrity, background jobs, serving an API. Putting Next.js in front of it buys one thing that a pure client-side bundler like Vite cannot: a server. The JWT is exchanged in a Next.js route handler and stored in an `httpOnly` cookie, so it never touches client-side JavaScript and an XSS bug cannot exfiltrate it. Without a server layer you would have to build one anyway just to set that cookie.

Next.js is also the stack of the other portfolio project, [Awano](https://github.com/chairulakmal/awano) (a multi-tenant support desk). Read the two side by side and you'll see the same patterns — FSM, transactional audit trail, service layer, two-tier testing — expressed once in Rails and once in Next.js.

---

## Stack

- **Backend:** Rails 8 API-only, Ruby 3.4.9, PostgreSQL 18, Devise + devise-jwt
- **Frontend:** Next.js 16 App Router, Tailwind CSS
- **Infra:** Docker Compose (local); Railway (production) — managed PostgreSQL 18, same major as local; Solid Queue + Solid Cache on the same Postgres (no Redis)
