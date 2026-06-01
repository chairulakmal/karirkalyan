# KarirKalyan — Architecture & Design

> A full-stack job application tracker: Rails 8 API + Next.js 16 frontend.
>
> I work mostly in TypeScript and Next.js. I built KarirKalyan to learn Rails the way I'd actually use it in production, so this document is less a feature list and more a record of the decisions I made and the reasoning behind each one.

---

## Build Checklist

- [x] Phase 1 — Rails API foundation (Gemfile, CORS, routes, migrations, models, FSM, RSpec config, factories)
- [x] Phase 2 — Service layer + specs (TransitionService, FSM, job, auth + applications + dashboard request specs, swagger_helper, Devise initializer stub)
- [x] Phase 3 — Controllers (ApplicationController, Auth, Applications, DashboardController)
- [x] Phase 4 — API docs (rswag generate swagger.yaml)
- [x] Phase 5 — Next.js frontend (auth flow, applications list, detail + timeline, file upload UI)
- [x] Phase 6 — Deploy (Railway services, env vars, custom domain, SSL)
- [x] Phase 7 — Job-search enhancements (Tokyo market)
- [x] Phase 8 — API maturity & final portfolio polish
- [~] Phase 9 — Product depth — email delivery + reminders shipped; analytics and AI assists are the roadmap

---

## Phase Details

### Phase 1 — Rails API foundation
Scaffold with `rails new api --api --skip-test`. Update Gemfile: add Sidekiq, devise + devise-jwt, rspec-rails, factory_bot_rails, faker, database_cleaner-active_record, rswag-api/ui/specs; remove solid_queue and solid_cache. Configure CORS to expose the `Authorization` header and read the allowed origin from `FRONTEND_URL`. Set `config.active_job.queue_adapter = :sidekiq` in `application.rb`. Write routes for Devise auth, applications CRUD + member actions (`transition`, `resume`, `cover_letter`), dashboard, and rswag mounts. Write all migrations (pgcrypto extension, users, applications, timeline_entries, file timestamps). Write models and the `ApplicationFSM` PORO. Configure RSpec with DatabaseCleaner transaction strategy, FactoryBot syntax helpers, and a shared `auth_headers_for` helper for request specs. Write factories for users, applications, and timeline_entries.

### Phase 2 — Service layer + specs ✓
`Applications::TransitionService` — FSM assertion, then status update + TimelineEntry creation in one transaction. `FollowUpReminderJob` — queries `follow_up_at = today`, non-terminal status, writes `TimelineEntry` with idempotency key `"reminder-{id}-{date}"`. Unit specs for FSM (31 examples, no DB) and TransitionService (doubles only). Job spec covers happy path, idempotency, skip cases.

Request specs written (37 examples) — will pass once Phase 3 controllers exist:
- `spec/requests/api/v1/auth_spec.rb` — sign_up, sign_in, sign_out
- `spec/requests/api/v1/applications_spec.rb` — CRUD, transition, file upload/download, auth scoping
- `spec/requests/api/v1/dashboard_spec.rb` — stats aggregation, empty state

Supporting infrastructure added: `spec/swagger_helper.rb` (rswag/OpenAPI 3.0.1 config), `jwt_for(user)` helper (generates JWT directly, no controller dependency), `fake_pdf` helper (Tempfile with PDF magic bytes). Devise initializer stub added (`config/initializers/devise.rb`) — enough to boot the app; full JWT config already wired. Inflections updated so Zeitwerk autoloads `ApplicationFSM` correctly. FSM expanded: added `wishlist`, `final_round`, `withdrawn`, `declined` states; `ghosted` made revivable (`ghosted → applied`).

### Phase 3 — Controllers ✓
`ApplicationController` rescues `ApplicationFSM::InvalidTransitionError` → 422 and `ActiveRecord::StaleObjectError` → 409. `Api::V1::Auth::SessionsController` returns the JWT in the `Authorization` response header (issued by `devise-jwt` via the dispatch matcher); `destroy` overridden for API mode (no flash, no `respond_to`). `Api::V1::Auth::RegistrationsController` overrides `create` to skip Devise's automatic `sign_up` (which writes to session). `Api::V1::ApplicationsController` covers CRUD, transition (applies `lock_version` from params before calling `TransitionService` so the 409 path fires), resume + cover_letter (served via `send_data`). `Api::V1::DashboardController` is pure SQL aggregation. Devise initializer sets `config.navigational_formats = []` so the gem behaves as a pure JSON API (otherwise `*/*` is treated as navigational and `set_flash_message!` errors). 79 specs green.

### Phase 4 — API docs ✓
Added `config/initializers/rswag_api.rb` (`openapi_root = Rails.root/'swagger'`) and `rswag_ui.rb` (`openapi_endpoint '/api-docs/v1/swagger.yaml'`). Generated via `RAILS_ENV=test bundle exec rake rswag:specs:swaggerize` — emits `swagger/v1/swagger.yaml` with all 9 endpoints (auth ×3, applications CRUD + transition + resume + cover_letter, dashboard). Swagger UI live at `GET /api-docs` (redirects to `/api-docs/index.html`); raw YAML at `GET /api-docs/v1/swagger.yaml`. Both verified 200 against a booted server.

### Phase 5 — Next.js frontend ✓
**Auth flow** is fully server-side: the browser never sees the JWT. The sign-in/sign-up forms POST plain credentials to Next route handlers (`app/api/auth/session/route.ts`, `app/api/auth/register/route.ts`), which proxy to Rails, capture the JWT from the `Authorization` response header, and store it in an `httpOnly` cookie named `session`. Sign-out (`DELETE /api/auth/session`) hits Rails to rotate the JTI, then clears the cookie. **Route guard** is `web/proxy.ts` (Next 16 renamed `middleware.ts` → `proxy.ts`): redirects `/` → `/dashboard` or `/sign-in` based on cookie presence; protects all app routes; bounces authenticated users away from the auth pages. **Data layer:** `app/lib/api.ts` provides a server-side `apiFetch` helper that reads the cookie and attaches `Authorization: Bearer …`; mutations (`app/lib/actions.ts`) are server actions calling `apiFetch` + `revalidatePath`. JSON and multipart bodies both work — `apiFetch` detects `FormData` and leaves `Content-Type` to fetch so the boundary is set correctly. **File download proxy** at `app/api/applications/[id]/{resume,cover_letter}/route.ts` streams the PDF body straight back to the browser while passing through `Content-Type` / `X-Content-Type-Options` headers — JWT stays server-side. **Pages:** `(app)/dashboard` lists applications with status badges + follow-up indicator + stats summary; `(app)/applications/new` is a server-action-backed form; `(app)/applications/[id]` shows detail + timeline + FSM-driven transition buttons (rendered from `valid_next_states`) + inline file upload with "uploaded N days ago" via `Intl.RelativeTimeFormat`. Tailwind v4, no UI library, no form library, no state management — server components and server actions throughout. Smoke-tested end-to-end (register → sign-in → list → detail → file proxy → sign-out → guard redirect).

### Phase 6 — Deploy ✓
Created a Railway project with `api` (rooted at `api/`), `web` (rooted at `web/`), managed PostgreSQL, and managed Redis. At this point I ran Puma and Sidekiq from a single `api` service via the `Procfile` — which I later found doesn't work under a Dockerfile build and split into a dedicated `sidekiq` service (see the Deployment section). Env vars: `DATABASE_URL`, `REDIS_URL`, `DEVISE_JWT_SECRET_KEY`, `FRONTEND_URL`, `SECRET_KEY_BASE`.

`SECRET_KEY_BASE` is a random secret for signing cookies — generated with `bin/rails secret`. Chosen over `RAILS_MASTER_KEY` because this app stores no secrets in `credentials.yml.enc`; sharing the dev master key with production is unnecessary. Without one of these the app aborts with `Missing secret_key_base for 'production' environment`.

**Production stack debugging notes:**
- Removed Thruster from the `Procfile` and `Dockerfile` `CMD`. Thruster fronted Puma on a different port, creating a double-proxy (Railway → Thruster → Puma) that caused 502s when Railway's port matched Thruster's but not Puma's. Railway is already the reverse proxy; the second layer was overhead, not value.
- `Dockerfile` `CMD` overrides `Procfile` unless Railway explicitly invokes the Procfile. Both must agree on the start command.
- `bin/docker-entrypoint` ran `db:prepare` only if the args matched `./bin/rails server` literally. After switching to `bundle exec rails server -b 0.0.0.0 -p 8080`, the condition stopped matching and migrations stopped running. Fixed by matching against `*"rails server"*`.
- Cloudflare custom domain (`kk.chairulakmal.com`): grey cloud (DNS only) required for Railway's Let's Encrypt ACME HTTP-01 challenge; orange cloud intercepts the `.well-known/acme-challenge/` request and breaks provisioning.
- DNSSEC was previously set up but had drifted (Cloudflare key rotation; DS at Njalla no longer matched), causing SERVFAIL on validating resolvers (1.1.1.1, most VPN DNS). Disabled cleanly — remove DS at registrar first, then disable DNSSEC in Cloudflare.

### Phase 7 — Job-search enhancements (Tokyo market)

Polish that signals production-readiness and Tokyo-market awareness to a Rails recruiter. Prioritised by effort-to-impact ratio. None of these are required to use the app; they exist purely to make the GitHub repo a stronger interview asset.

**Tier 1 — High impact, low effort** ✓

- [x] **CI runs RSpec.** Single `check` job at `.github/workflows/api.yml` runs Brakeman, bundler-audit, Rubocop, and the full RSpec suite (87 examples) against Postgres 16 + Redis 7 service containers.
- [x] **CI for `web/`.** Single `check` job at `.github/workflows/web.yml` runs ESLint, `tsc --noEmit`, and `next build` on Node 22 (matches Railway).
- [x] **README badges.** API CI, Web CI, MIT license badges at top of root README.
- [x] **Repo-root `.github/`.** Workflows, `PULL_REQUEST_TEMPLATE.md`, and `ISSUE_TEMPLATE/{bug_report,feature_request}.md` live at repo root. Old `api/.github/` (which GitHub silently ignored) was deleted. `dependabot.yml` removed — `bundler-audit` in CI covers CVEs without the PR noise.
- [x] **"Codebase tour" section in root README.** Annotated tree of the 10 most important files in reading order.
- [x] **Brakeman ignore** at `api/config/brakeman.ignore` documenting why `lock_version` is intentionally permitted (optimistic locking pattern). 0 security warnings, 1 ignored.
- [x] **Rubocop autocorrect** applied across 9 files (whitespace-only). 0 offenses.
- [x] **LICENSE** updated from `kai` placeholder to full attribution.

**Tier 2 — Production-readiness signals**

- [x] **`/up` health endpoint with dependency checks.** `HealthController` at `app/controllers/health_controller.rb` pings Postgres + Redis. Returns 200 with `{status: "ok", checks: {...}}` when healthy, 503 + `degraded` when any dep is down. Replaces Rails 8 default (which only checks boot). 3 specs in `spec/requests/health_spec.rb`. Railway healthchecks now fail fast on dependency loss.
- [x] **Structured JSON logging.** `lograge` (gem) configured at `config/initializers/lograge.rb` for production only. Single-line JSON entries with `time`, `request_id`, controller, action, params, status, duration. `request_id` already exposed as a log tag in `production.rb`; payload carries it through for cross-service tracing.
- [x] **SimpleCov for coverage.** Loaded at the top of `spec/spec_helper.rb` so it instruments before any app code. `add_filter` excludes `/spec/`, `/config/`, `/db/`, `/bin/`; branch coverage enabled; 80% minimum line threshold. `/coverage/` gitignored. Current: **99.44% line / 90.48% branch**. Skippable with `COVERAGE=false` if needed.
- [x] **N+1 detection in test env.** `prosopite` (with `pg_query`) wraps every `type: :request` example via `spec/support/prosopite.rb`. Raises `Prosopite::NPlusOneQueriesError` on detection. Per-spec opt-out via `skip_n_plus_one: true` metadata (used on the Rack::Attack throttling spec which intentionally repeats the same query to trigger rate limiting).
- [x] **Honeybadger.** `gem "honeybadger"` added to Gemfile. Config at `config/honeybadger.yml` — reports in production only (test/development suppressed). API key read from `HONEYBADGER_API_KEY` env var (never hardcoded). Set in Railway `api` service.
- [x] **One Playwright E2E test.** `web/e2e/smoke.spec.ts` covers sign up → dashboard → create application → transition to `applied` → see timeline entry. Playwright's `webServer` config auto-boots Rails (`:3001`) and Next.js (`:3000`) with `reuseExistingServer: true` for fast local re-runs. Each test uses a unique email so no DB cleanup is needed between runs. Full flow runs in ~2 seconds. Scripts: `npm run test:e2e` (headless) and `test:e2e:ui` (interactive). Browsers installed into `~/.cache/ms-playwright/`, not the repo. **CI approach (Phase 8):** runs as a second job (`e2e`, `needs: check`) inside the existing `web.yml` — no standalone workflow. Triggers only on `push` to `main` (not PRs) to preserve free-tier CI minutes. Needs Postgres + Redis service containers + Ruby setup alongside existing Node steps; Chromium cached via `actions/cache`.

**Tier 3 — Tokyo-specific differentiators**

- **`README.ja.md`.** Even a brief Japanese translation of the top section. Doesn't have to be flawless — the signal is "I'm serious about working here." Highest-leverage single change for the Tokyo market; almost no one bothers. *→ Phase 8.*
- **i18n scaffolding.** Add `rails-i18n` on the API and `next-intl` on the web. Wire at least one user-facing string in both locales with a locale switcher. Cultural-awareness signal. *Deprioritised — complex, marginal signal vs. effort.*
- **JST-aware reminders.** Add `user.timezone` (default `"Asia/Tokyo"`) and have `FollowUpReminderJob` fire in the user's local morning. Mention in the README. *Deprioritised — requires migration + job rework; low ROI for portfolio.*
- **Seed data with Japanese tech companies.** `db/seeds.rb` populated with Mercari, Sansan, freee, Money Forward, GMO, etc. instead of "Acme Corp". Hiring managers see it in screenshots and demo videos. *→ Phase 8.*

**Deliberately deprioritised**

- Feature expansion (Company / Platform / Tag models — adds CRUD without new patterns; the `source` string already covers it)
- Kubernetes / Terraform — overkill for project scale; reads as cargo-culting
- Heavy refactors — the architecture is already clean; further changes hit diminishing returns
- i18n scaffolding — complex, marginal signal vs. effort at this stage
- JST-aware reminders — requires migration + job rework; not worth the noise before other gaps are closed

---

### Phase 8 — API maturity & final portfolio polish

Closes the remaining gaps identified by post-Phase-7 gap analysis. All items fit inside existing CI workflows — no new workflow files.

**Gap analysis findings (new items not in Phase 7):**

- [x] **Cursor-based pagination on `GET /applications`.** Currently loads every record with no limit. Add `?after=<base64_cursor>&limit=20` query params; response wraps records in `{ data: [...], meta: { next_cursor, has_more } }`. Manual implementation (~20 lines, no gem) — shows understanding rather than gem reach. Clamp limit 1–100. Add 3 RSpec examples: first page, second page via cursor, has_more flag.

- [x] **Error envelope consistency.** `ApplicationController#rescue_from` and Rack::Attack already return `{ error: string }`. But `ApplicationsController#create` and `#update` return `{ errors: [...] }` on validation failure. Standardise: join validation messages into a single `{ error: "..." }` string. Update corresponding spec assertions and simplify frontend error extraction in `web/app/lib/api.ts` from `body.error ?? body.errors?.join(", ")` to `body.error ?? text`.

**Carried from Phase 7:**

- [x] **Honeybadger error tracking.** `gem "honeybadger"` in Gemfile. `config/honeybadger.yml` — API key from `HONEYBADGER_API_KEY` env var. Reports production only; suppressed in test/development.

- [x] **Playwright E2E in CI (via `web.yml`).** Add a second job `e2e` to `.github/workflows/web.yml` (not a standalone file). `needs: check` so it runs after lint/tsc/build passes. Triggers only on `push` to `main` — not on PRs — to save free-tier minutes. Job needs: Postgres 16 + Redis 7 service containers, Ruby setup (`ruby/setup-ruby@v1` with `bundler-cache: true`), `db:create db:migrate` for a disposable dev DB, Chromium via `npx playwright install --with-deps chromium` cached with `actions/cache`. `webServer` in `playwright.config.ts` already boots Rails + Next.js; CI sets `RAILS_ENV=development` and `DATABASE_URL` pointing to the service container.

- [x] **Demo account + "Try demo" login shortcut.** `api/db/seeds.rb` — idempotent (`find_or_create_by!`). Demo user `demo@karirkalyan.com` / `oretachinomachida`. 12 applications using recognisable mock company names (Marcari/Mercari, Vine Corp/LINE, Rokuton/Rakuten, BeNA Games/DeNA, CyberFactor/CyberAgent, Cansan/Sansan, greeo/freee, Funds Forward/Money Forward, SlickHR/SmartHR, Cybozo/Cybozu, Wantfully/Wantedly, Cogpal/Cookpad) — realistic 2026 Tokyo tech job search spread across all FSM states. Timeline entries written directly with `idempotency_key: "seed-<slug>-<n>"` (bypasses TransitionService, safe for historical seed data). One application has `follow_up_at` in the future (Vine Corp offer pending). Frontend: "Try demo account" button added to sign-in form (`web/app/(auth)/sign-in/sign-in-form.tsx`) — separated by "or" divider, calls `/api/auth/session` directly with demo credentials, redirects to dashboard.

- [x] **`README.ja.md`.** Japanese translation: project purpose, live URL, tech stack table, how to run locally, one-paragraph "why API + Next.js", pointer to English README for full architectural notes. Add `[🇯🇵 日本語](README.ja.md)` line to `README.md` just below the badge row.

**Files changed in Phase 8:**

| File | Change |
|---|---|
| `api/db/seeds.rb` | Demo seed: 12 mock Japanese companies, all FSM states |
| `web/app/(auth)/sign-in/sign-in-form.tsx` | "Try demo account" button with direct API sign-in |
| `README.md` | Languages line → README.ja.md |
| `README.ja.md` | New file |
| `api/Gemfile` + `api/config/honeybadger.yml` | Honeybadger gem + config (done) |
| `api/app/controllers/api/v1/applications_controller.rb` | Cursor pagination on index; `{ error: }` on create/update |
| `api/spec/requests/api/v1/applications_spec.rb` | 3 new pagination examples; update error shape assertions |
| `web/app/(app)/dashboard/page.tsx` | Unwrap paginated response envelope |
| `web/app/lib/api.ts` | Simplify error extraction to `body.error` |
| `.github/workflows/web.yml` | Add `e2e` job (push-to-main only, needs Postgres + Redis + Ruby) |

---

### Phase 9 — Product depth (dogfood + portfolio signal)

Four features I scoped after Phase 8 to make the app genuinely useful for a real job search. The first is built; the rest are the direction I'd take it next.

---

**1. Email delivery — ActionMailer + Sidekiq** *(built — Resend SMTP)*

The follow-up reminder job wrote a `TimelineEntry` but never notified the user off-screen. Two gaps were closed:

- **ActionMailer wiring.** The railtie was disabled (`--api` default) — re-enabled in `config/application.rb`. Per-env config added: production sends via SMTP (Resend) reading `SMTP_*` env vars; development previews only (live SMTP opt-in via env); test collects in `ActionMailer::Base.deliveries` with the ActiveJob `:test` adapter. `ApplicationMailer` + `FollowUpMailer#reminder` with self-contained HTML + plain-text views (on-brand cobalt/linen palette).
- **Scheduling gap (discovered).** `sidekiq-cron` was in the Gemfile but **no schedule was loaded anywhere** — the reminder job never fired in production. The leftover `config/recurring.yml` was a dead SolidQueue artifact (removed). Added `config/sidekiq_cron.yml` + `config/initializers/sidekiq.rb` (loads in the Sidekiq server process only). Runs `15 23 * * *` UTC = 08:15 JST — the user's morning, a small Tokyo-market touch.

`FollowUpReminderJob` writes the `TimelineEntry` (exactly-once idempotency anchor) then `FollowUpMailer.reminder(application).deliver_later` — delivery decoupled onto the `mailers` queue so a transient SMTP failure retries the email without duplicating the timeline entry. Mailer preview at `/rails/mailers`. Specs: 6 mailer examples + 3 job email-enqueue examples (`have_enqueued_mail`). Full suite 115 examples, 0 failures, 99.5% line coverage.

Env vars (documented in `api/README.md`): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAILER_FROM`. One lesson worth recording: Railway blocks outbound SMTP on ports 587/465, so production uses Resend's alternate STARTTLS port `2587`. The `From:` domain has to be verified in Resend first, and the jobs run in a dedicated `sidekiq` service — without it, mail enqueues but never sends.

---

**2. Analytics dashboard — funnel + conversion stats**

The FSM + timeline data already exists. Surface it as a second dashboard view showing:
- Application funnel: count per status, stacked or step-chart
- Response rate: `(phone_screen + technical + final_round + offer) / applied * 100`
- Ghosting rate: `ghosted / applied * 100`
- Avg days applied → first response (applied_at → first phone_screen timeline entry)
- Avg days applied → offer (applied_at → offer timeline entry)

Backend: extend `GET /api/v1/dashboard` (or add `GET /api/v1/dashboard/analytics`) with SQL aggregations — one query each, no Ruby loops. Timeline-based averages use `EXTRACT(EPOCH FROM ...)` on joined rows.

Frontend: one chart component (consider Recharts or a lightweight SVG bar chart with no library). Stats cards for the rate metrics. Placed as a second tab or collapsible section on the dashboard.

No new models. No migrations.

---

**3. AI job URL pre-fill — Claude API**

User pastes a job posting URL into a field on the new-application form. On "Import":
1. Next.js server action fetches the URL's HTML server-side (avoids CORS)
2. Strips to readable text (title, meta description, visible body — skip nav/footer/scripts)
3. Passes to Claude (`claude-haiku-4-5`) with a structured prompt: extract `company`, `role`, and a 2–3 sentence `notes` summary (stack, team, key requirements)
4. Returns `{ company, role, notes }` JSON → pre-fills the form fields; user reviews before submitting

Implementation:
- `npm install @anthropic-ai/sdk` in `web/`
- New server action `parseJobPosting(url: string)` — fetch → strip HTML → Claude call → return structured data
- `ANTHROPIC_API_KEY` env var (Railway `web` service)
- "Paste job URL" field + "Import" button above the company/role fields; button shows loading state; fields populate on success; user can still edit everything
- Falls back gracefully: if fetch fails or Claude returns malformed JSON, show an error and let the user fill fields manually
- Cost: ~2–5k tokens per parse at Haiku pricing — fractions of a cent each

Handles Japanese job postings natively (Claude reads Japanese without extra configuration). Works across Wantedly, Greenhouse, company career pages without site-specific parsers.

---

**4. AI cover letter / notes assist — Claude API**

On the application detail page, a "Draft with AI" button alongside the notes textarea. Takes the application's `company`, `role`, and any existing `notes`, optionally the uploaded resume bytes, and prompts Claude to:
- Draft a tailored cover letter paragraph (3–4 sentences)
- Suggest interview prep notes (likely questions, key talking points based on the role)

Output appears in a side panel or modal — user copies what they want into the notes field or downloads as text. Nothing is saved automatically; the user remains in control.

Implementation:
- Streaming response (`claude-sonnet-4-6`) for perceived speed — pipe `ReadableStream` from the server action to the client via React's experimental `use(stream)` or a simple textarea append loop
- Prompt includes: role, company, notes, resume text (extracted from the PDF bytes server-side using a basic text extraction — `pdf-parse` npm package)
- `ANTHROPIC_API_KEY` reused from feature 3
- No new DB columns

Paired with the URL pre-fill, the whole new-application flow becomes: paste a job URL → import the fields → draft a cover letter → attach a resume, in one pass. It's the feature I'm most interested in building next.

---

**Deliberately deferred from Phase 9:**
- Email notifications for status transitions (not just reminders) — low signal-to-noise for personal use
- Bulk operations (archive all ghosted) — useful but not impressive
- i18n / locale switcher — effort disproportionate to signal at this stage

---

## Decisions Log

### Job queue — Sidekiq over Solid Queue
Solid Queue is the Rails 8 default (Postgres-backed, no Redis). I chose Sidekiq because it's the standard in most Tokyo Rails shops and it's a more mature, observable runtime than Solid Queue. Sidekiq is also what *introduces* Redis as a dependency; the app then reuses that Redis for the production `Rails.cache` (`:redis_cache_store`) and, through it, the Rack::Attack throttle store. (JWT revocation does **not** use Redis — it's the `users.jti` column in Postgres.)

### DB cleaning — `database_cleaner-active_record` transaction strategy
Wraps each spec in a transaction and rolls back. Fastest option. Truncation is only needed for multi-connection scenarios, which this project doesn't have.

### Serialiser — plain `as_json` override, no gem
No serialiser gem. Each model overrides `as_json` explicitly. Easy to read, nothing to explain, no magic. `Application#as_json` excludes `resume` and `cover_letter` (binary columns served via dedicated download endpoints instead).

### File storage — PostgreSQL `bytea`, 1 MB cap
Resume and cover letter stored as raw bytes in `bytea` columns. No Active Storage, no S3. Right-sized for personal-use scale — files are small, transactional consistency with the rest of the row is free, no presigned URL complexity.

### PDF validation — magic byte check in model, `accept=".pdf"` in frontend
Two layers: the Rails model checks that the first 4 bytes of the uploaded binary are `%PDF` (the PDF magic number). This is the reliable guard — it can't be spoofed by renaming a file. The frontend adds `accept=".pdf"` on the file input as a UX convenience only. Thumbnail preview was considered and rejected — requires `poppler`/`ghostscript` on the server, extra storage, and is rarely useful in a personal tracker.

### File timestamps — `resume_updated_at` / `cover_letter_updated_at`
Two datetime columns on `applications`, set via `before_save` callbacks using ActiveRecord dirty tracking (`will_save_change_to_resume?`). Only fires when the binary column actually changes. Displayed in the frontend as "resume.pdf · uploaded 3 days ago" — no thumbnail needed.

### Separate `api` and `sidekiq` services on Railway
I started with a single `api` service meant to run both Puma and Sidekiq from the `Procfile` — simpler and cheaper at personal scale. It turned out not to work: when a Dockerfile is present, Railway runs the Dockerfile's `CMD` and ignores the `Procfile` entirely, so only Puma ran. Jobs enqueued to Redis but nothing consumed them, which meant the welcome email and follow-up reminders silently never sent. The fix was a dedicated `sidekiq` service built from the same image, with `bundle exec sidekiq -C config/sidekiq.yml` as its start command and `api`'s environment mirrored via `${{api.*}}` variable references. The upside of the accident: web and worker now restart independently, which is the setup I'd want in production anyway.

### Reminders surface both in-app and by email
A follow-up reminder writes a `TimelineEntry` on the application detail page, and the same job also sends an email (Phase 9). I started in-app only — for a tracker you check daily, a timeline entry is enough and avoids spam and unsubscribe handling. I added email once I wanted the nudge to reach me when the app *wasn't* open, which is the point of a reminder. The `TimelineEntry` is still the source of truth (written first, with the idempotency key); the email is decoupled onto its own queue so a delivery failure retries without duplicating the entry.

### No Company / Platform / Tag models
These would add CRUD without adding new patterns. The portfolio goal is to demonstrate FSM, transactional writes, background jobs, and two-tier testing — not to maximise model count. A `source` string column on `applications` is sufficient for tracking job platforms.

---

## What I focused on

The goal was to understand how Rails actually works, not just how to wire up a CRUD app. Each row below is a concern I cared about, the approach I took, and why it matters:

| Concern | Approach | Why it matters |
|---|---|---|
| State machine | Custom PORO — no gem | Keeps logic visible; shows understanding over convenience |
| Audit trail | Transactional `TimelineEntry` on every status change | Data integrity, not just logging |
| Auth | Devise + devise-jwt with JTI revocation | Stateless JWT with a real logout mechanism |
| Concurrency | Optimistic locking (`lock_version`) | Shows awareness of concurrent writes |
| Background jobs | Sidekiq + idempotency key | Defensive job design, at-least-once delivery |
| File storage | PostgreSQL `bytea` columns, 1 MB limit | Right-sized decision — no object storage overhead for personal-scale files |
| Query design | SQL aggregation for dashboard stats | No N+1, no loading records into Ruby unnecessarily |
| API docs | rswag — specs double as OpenAPI source | Tests and docs stay in sync |
| Testing | Unit specs (no DB) + request specs (real DB) | Two-tier strategy matching Awano's Vitest + Playwright |

This project intentionally mirrors [Awano](https://github.com/chairulakmal/awano), a Next.js multi-tenant support desk. A reviewer can compare both and see the same engineering thinking — FSM, transactional audit trail, service layer, two-tier testing — expressed in two different stacks.

---

## Architecture

```
karirkalyan/
  api/    ← Rails 8 API-only
  web/    ← Next.js 16 frontend
  docker-compose.yml  ← postgres + redis for local dev
```

### Why API + separate frontend?

The Rails backend is the portfolio piece. The Next.js frontend exists so the app is genuinely usable day-to-day — tracking a real job search. Separating them also demonstrates knowing when Rails is the right tool (data integrity, background jobs, API) and when it isn't (rich interactive UI).

---

## Tech Stack Decisions

### Backend (`api/`)

| Technology | Decision | Alternative considered | Reason |
|---|---|---|---|
| Rails 8 API-only | ✓ | Full-stack Rails | No HTML views needed; clean API contract |
| Ruby 3.4.9 (via mise) | ✓ | System Ruby | Reproducible versions across machines; mise is the modern standard |
| PostgreSQL 16 | ✓ | SQLite | Foreign keys, `EXTRACT()` for date math, production-grade |
| Devise + devise-jwt | ✓ | Roll own JWT | Proven auth layer; JTI revocation solves the logout problem |
| Custom PORO FSM | ✓ | `state_machines` gem | Visible logic — the transitions table is the documentation |
| Service objects | ✓ | Fat models / callbacks | Explicit call sites; easy to test in isolation |
| Sidekiq + sidekiq-cron | ✓ | Rails built-in Solid Queue | Sidekiq is the Tokyo industry standard; it brings Redis, which also backs the prod cache + Rack::Attack |
| PostgreSQL `bytea` for files | ✓ | Active Storage + S3 | Files are ≤ 1 MB per application; no object storage overhead for personal scale |
| RSpec + FactoryBot | ✓ | Minitest | Industry standard in Tokyo Rails shops |
| rswag | ✓ | Hand-written OpenAPI | Specs and docs share one source of truth |

**Why `--skip-test` on `rails new`?** Rails generates a `test/` folder for Minitest by default. Since this project uses RSpec, that folder would just be dead weight — two test directories with one doing nothing. `--skip-test` keeps the repo clean and signals the intentional choice.

### Frontend (`web/`)

| Technology | Decision | Alternative considered | Reason |
|---|---|---|---|
| Next.js 16 (App Router) | ✓ | Vite + React | See tradeoff below |
| JWT in `httpOnly` cookie | ✓ | `localStorage` | Token never touches client JS — XSS-proof |
| Tailwind CSS | ✓ | — | Utility-first; fast to build, easy to read |
| Railway (separate service) | ✓ | — | Same Railway project as the API; independent deploy |

#### Next.js 16 vs Vite — why Next.js wins here

Vite is a pure client-side bundler. It has no server component, which means there's nowhere to securely receive a JWT and set an `httpOnly` cookie — you'd need to add a separate Express or Hono server just for that. Next.js API routes (`/api/auth/session`) handle this in the same process with no extra moving part.

The second reason: Next.js 16 is already live in this portfolio at [awano.chairulakmal.com](https://awano.chairulakmal.com). Using the same framework for both projects lets a recruiter compare Rails vs Next.js patterns side-by-side, rather than also comparing two different frontend toolchains.

Vite would be the right call if this were a public-facing app where a stateless token in `localStorage` was acceptable, or if a cookie server were already in place.

---

## Data Model

### `users`
Managed by Devise. The `jti` column stores the current token ID — rotated on sign-out to invalidate existing tokens.

```
users
  id
  email              string, not null, unique
  encrypted_password string, not null
  jti                string, not null, unique   ← JWT revocation
  created_at, updated_at
```

### `applications`
The core entity. `status` is FSM-controlled — it can only be changed through `TransitionService`, never via a direct attribute write. `resume` and `cover_letter` are PostgreSQL `bytea` columns — stored in the database directly, capped at 1 MB each in the model, excluded from index/show serialisation (a dedicated download endpoint sends them with `send_data`).

```
applications
  id
  user_id           FK → users, not null
  company           string, not null
  role              string, not null
  url               string
  status            string, not null, default: "draft"   ← FSM-controlled
  follow_up_at      datetime                             ← user-set reminder
  applied_at        datetime                             ← set automatically on draft→applied
  notes             text
  resume            bytea                                ← raw file bytes, ≤ 1 MB
  cover_letter      bytea                                ← raw file bytes, ≤ 1 MB
  lock_version      integer, default: 0                  ← optimistic locking
  created_at, updated_at
```

### `timeline_entries`
Append-only audit log. Every status change writes one row atomically with the status update — they succeed or fail together.

```
timeline_entries
  id
  application_id    FK → applications, not null
  actor_id          FK → users, not null
  from_status       string, not null
  to_status         string, not null
  note              text
  idempotency_key   string, unique    ← prevents duplicate reminder entries on Sidekiq retry
  created_at, updated_at
```

---

## State Machine Design

### Why a custom PORO instead of a gem

The `state_machines` gem is mature but opaque — behaviour lives in DSL macros and callbacks, not in a file you can read top to bottom. The custom PORO approach means: open `application_fsm.rb`, read the `TRANSITIONS` array, know exactly what's allowed. This mirrors the pattern in Awano's `fsm.ts`.

### States & Transitions

The state model follows industry-standard ATS pipelines (Greenhouse, Lever, Workday) for the recruiter-driven stages, combined with candidate-side states (`wishlist`, `withdrawn`, `ghosted`) common in personal trackers like Huntr and Teal.

```
wishlist ──→ draft ──→ applied ──→ phone_screen ──→ technical ──→ final_round ──→ offer ──→ accepted
                            ↘           ↘               ↘             ↘            ↘
                        rejected     rejected        rejected     rejected      rejected
                        ghosted      ghosted         ghosted      ghosted       declined
                                       ↑ ↓
                                  (ghosted → applied to revive)

   withdrawn ← (any non-terminal stage, candidate-initiated)
```

Any non-terminal state can also transition to `archived` (housekeeping — remove clutter without deleting history).

**Terminal states** (no further transitions): `accepted`, `rejected`, `declined`, `withdrawn`, `archived`

`ghosted` is not terminal — transition back to `applied` if a company reaches out again.

**Why `rejected`, `declined`, and `withdrawn` are distinct states:**
- `rejected` — company-initiated, candidate didn't get the offer
- `declined` — candidate-initiated after receiving an offer
- `withdrawn` — candidate-initiated before any decision

Collapsing them into one "closed" state loses the signal a recruiter looks for in cohort analytics — the breakdown matters more than the count.

### TRANSITIONS constant — `app/lib/application_fsm.rb`

```ruby
module ApplicationFSM
  class InvalidTransitionError < StandardError; end

  TRANSITIONS = [
    { from: "wishlist",     to: "draft"        },
    { from: "draft",        to: "applied"      },

    { from: "applied",      to: "phone_screen" },
    { from: "phone_screen", to: "technical"    },
    { from: "technical",    to: "final_round"  },
    { from: "final_round",  to: "offer"        },
    { from: "offer",        to: "accepted"     },
    { from: "offer",        to: "declined"     },

    { from: "applied",      to: "rejected"     },
    { from: "phone_screen", to: "rejected"     },
    { from: "technical",    to: "rejected"     },
    { from: "final_round",  to: "rejected"     },
    { from: "offer",        to: "rejected"     },

    { from: "applied",      to: "ghosted"      },
    { from: "phone_screen", to: "ghosted"      },
    { from: "technical",    to: "ghosted"      },
    { from: "final_round",  to: "ghosted"      },
    { from: "ghosted",      to: "applied"      },

    { from: "wishlist",     to: "withdrawn"    },
    { from: "draft",        to: "withdrawn"    },
    { from: "applied",      to: "withdrawn"    },
    { from: "phone_screen", to: "withdrawn"    },
    { from: "technical",    to: "withdrawn"    },
    { from: "final_round",  to: "withdrawn"    },
  ].freeze

  TERMINAL_STATES = %w[accepted rejected declined withdrawn archived].freeze
  VALID_STATES    = (TRANSITIONS.flat_map { |t| [t[:from], t[:to]] } + TERMINAL_STATES).uniq.freeze

  def self.assert_transition!(from, to)
    return if to == "archived" && !TERMINAL_STATES.include?(from)
    unless TRANSITIONS.any? { |t| t[:from] == from && t[:to] == to }
      raise InvalidTransitionError, "No valid transition from '#{from}' to '#{to}'"
    end
  end

  def self.valid_next_states(from)
    return [] if TERMINAL_STATES.include?(from)
    nexts = TRANSITIONS.select { |t| t[:from] == from }.map { |t| t[:to] }
    nexts << "archived" unless nexts.empty?
    nexts
  end
end
```

---

## Service Layer

### Why service objects instead of fat models or callbacks

ActiveRecord callbacks (`after_save`, `before_update`) fire on every save — including seeds, test factories, and admin imports. Logic that should only run on an explicit user action ends up running everywhere, requiring escape hatches. Service objects have explicit call sites: the behaviour only runs when `TransitionService.new(...).call` is called.

This mirrors Awano's `transitionStatus()` function in `src/lib/tickets/service.ts` — a plain function with an explicit call site, not a side effect.

### `Applications::TransitionService` — `app/services/applications/transition_service.rb`

```ruby
module Applications
  class TransitionService
    def initialize(application:, to:, actor:)
      @application = application
      @to          = to
      @actor       = actor
    end

    def call
      # Assert before touching the database — mirrors Awano's assertTransition()
      ApplicationFSM.assert_transition!(@application.status, @to)

      # Status update + audit entry in one transaction — mirrors Prisma $transaction
      ActiveRecord::Base.transaction do
        @application.update!(
          status:     @to,
          applied_at: (@to == "applied" ? Time.current : @application.applied_at)
        )
        @application.timeline_entries.create!(
          actor:       @actor,
          from_status: @application.status_before_last_save,
          to_status:   @to
        )
      end

      @application
    end
  end
end
```

Key points:
- `assert_transition!` raises before any DB write — no partial state
- `applied_at` is set automatically on `draft → applied`, not supplied by the client
- `status_before_last_save` uses ActiveRecord's dirty tracking — accurate even if callbacks run
- The `ActiveRecord::Base.transaction` block mirrors Prisma's `$transaction` — both or neither

---

## Notable Engineering Decisions

### Optimistic Locking

Adding a `lock_version:integer` column activates Rails' built-in optimistic locking. If two requests read the same record and both try to write, the second one gets `ActiveRecord::StaleObjectError`. Returned to the client as `409 Conflict`. No extra library — one column, one `rescue_from`.

### Idempotent Background Jobs

Sidekiq guarantees at-least-once delivery — a job may run more than once if the worker crashes mid-execution. The reminder job writes a `TimelineEntry` with an `idempotency_key` of `"reminder-{id}-{date}"` generated at enqueue time. Before doing any work, the job checks for an existing entry with that key and no-ops if found. Same pattern as Stripe idempotency keys.

### Dashboard via Pure SQL

`GET /api/v1/dashboard` returns counts by status and average days from apply to offer. Implemented with `.group(:status).count` and `.average("EXTRACT(...)")` — two queries, no Ruby loops over records. The goal: show awareness of N+1 patterns and query design.

### File Storage via PostgreSQL `bytea`

Resume and cover letter files are stored as raw bytes in `bytea` columns, not in S3 or Active Storage. The tradeoff: at ≤ 1 MB per file and personal-use scale, the database is the right place — no extra service, no presigned URL complexity, transactional consistency with the rest of the row. The 1 MB limit is enforced in the Rails model with a `validates` block, not at the database level. Binary columns are excluded from the standard JSON serialiser; a dedicated `GET /api/v1/applications/:id/resume` endpoint serves the file via `send_data`.

### JWT Storage on the Frontend

The Rails API issues a JWT in the `Authorization` response header. The Next.js frontend exchanges it through a thin API route (`/api/auth/session`) that sets an `httpOnly` cookie. The token never touches client-side JavaScript — not `localStorage`, not a JS-readable cookie. This avoids XSS-based token theft. This pattern requires a server component (Next.js API route); it's one of the reasons Vite was not chosen for the frontend.

---

## File Layout

```
karirkalyan/
  docker-compose.yml                  ← postgres 16 + redis 8 for local dev

api/
  Procfile                            ← local multi-process dev only (foreman); ignored by Railway
  Dockerfile                          ← production image for Railway
  Gemfile                             ← Sidekiq, Devise+JWT, RSpec stack, rswag, Honeybadger

  app/
    controllers/
      application_controller.rb       ← rescue_from FSM error + StaleObjectError
      api/v1/
        auth/
          sessions_controller.rb      ← Devise JWT sign-in / sign-out
          registrations_controller.rb ← sign-up
        applications_controller.rb    ← CRUD + transition + file download
        dashboard_controller.rb       ← SQL aggregation
    models/
      user.rb                         ← Devise + JTI revocation
      application.rb                  ← FSM status, bytea files, file timestamps, PDF validation
      timeline_entry.rb               ← append-only audit log
    services/
      applications/
        transition_service.rb         ← FSM assert → transaction
    jobs/
      follow_up_reminder_job.rb       ← daily Sidekiq job, idempotency key
    lib/
      application_fsm.rb              ← TRANSITIONS + assert_transition!

  config/
    sidekiq.yml                       ← queues: default, mailers
    database.yml                      ← dev/test point to docker-compose postgres
    honeybadger.yml                   ← error tracking, API key from env
    initializers/
      cors.rb                         ← FRONTEND_URL origin, exposes Authorization header
      devise.rb                       ← JWT secret + JTI revocation strategy

  db/migrate/
    ..._enable_pgcrypto.rb
    ..._devise_create_users.rb
    ..._create_applications.rb
    ..._create_timeline_entries.rb
    ..._add_file_timestamps_to_applications.rb

  spec/
    rails_helper.rb                   ← DatabaseCleaner, FactoryBot
    support/
      auth_helpers.rb                 ← auth_headers_for(user) for request specs
      prosopite.rb                    ← N+1 detection for request specs
    factories/
      users.rb / applications.rb / timeline_entries.rb
    lib/
      application_fsm_spec.rb         ← pure Ruby, no DB
    services/applications/
      transition_service_spec.rb      ← doubles only, no DB
    jobs/
      follow_up_reminder_job_spec.rb  ← real DB
    requests/api/v1/
      auth_spec.rb                    ← sign_up, sign_in, sign_out
      applications_spec.rb            ← CRUD + transition + file upload/download
      dashboard_spec.rb               ← stats aggregation
      health_spec.rb                  ← /up endpoint, dependency checks

  swagger/
    v1/swagger.yaml                   ← auto-generated from request specs

web/
  e2e/
    smoke.spec.ts                     ← sign up → dashboard → create → transition → timeline
  app/
    (app)/dashboard/
      page.tsx                        ← applications list + stats summary
    (app)/applications/[id]/
      page.tsx                        ← detail + timeline + transition buttons + file upload
    api/
      auth/session/route.ts           ← receives JWT, sets httpOnly cookie
      auth/register/route.ts          ← sign-up proxy
      applications/[id]/resume/
        route.ts                      ← file download proxy (JWT stays server-side)
      applications/[id]/cover_letter/
        route.ts                      ← file download proxy
  proxy.ts                            ← route guard (Next.js 16 middleware rename)
```

---

## Testing Strategy

Two-tier, mirroring Awano's Vitest + Playwright split:

| Layer | Tool | DB? | What it tests |
|---|---|---|---|
| Unit | RSpec, mocked AR | No | FSM logic, service logic in isolation |
| Integration | RSpec request specs | Yes (real) | Full HTTP stack — routing, auth, response shape |

Unit specs for `ApplicationFSM` have zero database setup. They test pure Ruby: given these inputs, does `assert_transition!` raise or not? Fast, no factories needed. This mirrors Awano's `vi.mock`-based unit tests in Vitest — isolate the logic, skip the infrastructure.

Request specs for `ApplicationsController` hit a real PostgreSQL database via `DatabaseCleaner`. They also carry `rswag` metadata, so running `bin/rails rswag:specs:swaggerize` generates the OpenAPI spec from the same file. This mirrors Awano's Playwright tests — real HTTP, real database, real assertions.

**Why not mock the database in request specs?** Mocked tests can pass while real migrations are broken. Request specs with a real DB catch migration errors, constraint violations, and N+1 queries that mocks would silently ignore.

---

## API Endpoints

```
POST   /api/v1/auth/sign_up
POST   /api/v1/auth/sign_in
DELETE /api/v1/auth/sign_out

GET    /api/v1/applications                       ← paginated, cursor-based
POST   /api/v1/applications
GET    /api/v1/applications/:id
PATCH  /api/v1/applications/:id
DELETE /api/v1/applications/:id
PATCH  /api/v1/applications/:id/transition        ← FSM transition
GET    /api/v1/applications/:id/resume            ← send_data binary download
GET    /api/v1/applications/:id/cover_letter      ← send_data binary download
GET    /api/v1/dashboard                          ← stats aggregation
GET    /api/v1/me                                 ← authenticated user's profile

GET    /api-docs                                  ← Swagger UI (rswag)
```

---

## Local Development

**Prerequisites:** Docker, Ruby 3.4.9 (via mise), Node 20+

```bash
# Infrastructure
docker compose up -d          # postgres + redis

# Backend
cd api
bundle install
bin/rails db:create db:migrate
bin/rails server              # :3001

# Frontend
cd web
npm install
npm run dev                   # :3000
```

---

## Deployment (Railway)

One Railway project, three app services plus two managed datastores:

| Service | Root | Start command |
|---|---|---|
| `api` | `api/` | Dockerfile `CMD` — `rails server` (Puma) |
| `sidekiq` | `api/` | `bundle exec sidekiq -C config/sidekiq.yml` (start-command override, same image as `api`) |
| `web` | `web/` | `npm run start` |
| PostgreSQL | managed | — |
| Redis | managed | — |

`api` and `sidekiq` build from the same Dockerfile; `sidekiq` mirrors `api`'s environment via `${{api.*}}` variable references, so the secrets live in one place. The `Procfile` is used only for local multi-process dev (`foreman`) — under a Dockerfile build, Railway ignores it.

Environment variables: `DATABASE_URL`, `REDIS_URL`, `DEVISE_JWT_SECRET_KEY`, `SECRET_KEY_BASE`, `FRONTEND_URL`, `HONEYBADGER_API_KEY`, `SMTP_HOST`, `SMTP_PORT` (`2587` — Railway blocks 587/465), `SMTP_USER`, `SMTP_PASS`, `MAILER_FROM`, plus `SIDEKIQ_USERNAME` / `SIDEKIQ_PASSWORD` for the `/sidekiq` dashboard.
