# KarirKalyan — Rails API

Rails 8 API-only backend for KarirKalyan. Handles auth, application tracking, background reminders, and dashboard aggregations.

## Stack

- Ruby 3.4.9
- Rails 8.1, API-only
- PostgreSQL 18
- Devise + devise-jwt (JTI revocation)
- Solid Queue + Solid Cache — both Postgres-backed, no Redis
- Anthropic SDK — Claude Haiku 4.5 for AI job-URL pre-fill
- RSpec + FactoryBot + rswag

## Local setup

**Prerequisites:** Docker, Ruby 3.4.9, Bundler

```bash
# Start PostgreSQL (docker-compose.yml lives here, reads .env automatically).
# Postgres is the only container — Solid Queue and Solid Cache use it too.
docker compose up -d

# Install dependencies and set up the database
bundle install
bin/rails db:create db:migrate
bin/rails db:seed             # required: creates the demo account (+ 12 sample applications)
                              # and, outside production, the `e2e` account Playwright signs in as.
                              # Registration is closed — seeding is how you get a login.

# Start the server on :3001
bin/rails server
```

API docs available at `http://localhost:3001/api-docs` once running.

Jobs run in-process in development via the `:async` adapter (`config/environments/development.rb`) — an in-memory thread pool, not Rails' separate `:inline` adapter — so there is **no worker process to start** alongside `rails server`. To exercise Solid Queue for real, set `SOLID_QUEUE_IN_PUMA=1` and drop that line.

## Deployment env vars

| Variable | Source |
|---|---|
| `DATABASE_URL` | Railway managed Postgres (reference variable) |
| `SOLID_QUEUE_IN_PUMA` | Set to `1`. **Required** — `config/puma.rb` only loads `plugin :solid_queue` when it is present, and without the plugin no job ever runs (no separate worker service exists to pick up the slack). |
| `DEVISE_JWT_SECRET_KEY` | Generate: `ruby -e "require 'securerandom'; puts SecureRandom.hex(64)"` |
| `FRONTEND_URL` | URL of the deployed `web` service (also used as the link host in reminder emails) |
| `SECRET_KEY_BASE` | Generate: `bin/rails secret`. Preferred over `RAILS_MASTER_KEY` — this app stores no secrets in `credentials.yml.enc`, so sharing the master key with production is unnecessary. |
| `SMTP_HOST` | SMTP server for outbound mail. Resend: `smtp.resend.com`. The mailer is provider-agnostic — any SMTP host works. |
| `SMTP_PORT` | SMTP port. Defaults to `587` (STARTTLS). **On Railway use `2587`** — Railway blocks outbound 587/465; `2587`/`2465` are Resend's alternate ports. |
| `SMTP_USER` | SMTP username. For Resend this is the literal string `resend`. |
| `SMTP_PASS` | SMTP password / API key. For Resend, a `re_…` API key. |
| `MAILER_FROM` | `From:` address for outbound mail, e.g. `KarirKalyan <reminders@kk.chairulakmal.com>`. Must be on a domain verified with the SMTP provider. |
| `ANTHROPIC_API_KEY` | Anthropic API key (pay-as-you-go, from console.anthropic.com) for the AI job-URL pre-fill. Pre-fill is a synchronous request, not a background job. If unset, `POST /applications/prefill` returns `503` and the rest of the app is unaffected. |
| `HONEYBADGER_API_KEY` | Error reporting (`config/honeybadger.yml`). |

### Background jobs & scheduled reminders

Jobs run on **Solid Queue**, backed by the same PostgreSQL database — no Redis, and no separate worker service. In production the supervisor, dispatcher, and workers run **inside the Puma process** via `plugin :solid_queue` (`config/puma.rb`), which loads only when `SOLID_QUEUE_IN_PUMA` is set. Worker/dispatcher tuning lives in `config/queue.yml`.

Recurring work is declared in `config/recurring.yml`:

| Task | Schedule | What it does |
|---|---|---|
| `follow_up_reminders` | `15 8 * * * Asia/Tokyo` — 08:15 JST, the user's morning | `FollowUpReminderJob` |
| `reset_demo_account` | hourly, at :42 | `DemoResetJob` — see [Demo data](#demo-data) |
| `clear_solid_queue_finished_jobs` | hourly, at :12 | Keeps the jobs table from growing unbounded |

`FollowUpReminderJob`: it collects every application whose `follow_up_at` has fallen due (reaching back 30 days, so nothing that was held is lost), writes a `TimelineEntry` per application (the exactly-once idempotency anchor), groups the winners **by user**, and enqueues one `FollowUpMailer.digest` via `deliver_later` on the `mailers` queue — one email per user per day, not one per application. Decoupling delivery means a transient SMTP failure retries the email without ever duplicating the timeline entry.

The job **holds** on any day `JapanCalendar` does not call a business day: weekends, national holidays (via the `holidays` gem, so 春分の日 tracks the equinox and 振替休日 is applied), New Year, Golden Week, Obon. Held is not dropped — the idempotency key is derived from `follow_up_at`, **not** from the day the job runs, so the next business day picks the reminder up and sends it exactly once. The same property means an overdue application is not re-nudged every morning, and moving `follow_up_at` re-arms it.

There is **no job dashboard**. The `Sidekiq::Web` mount was removed with Sidekiq; inspect the queue in `psql` (`solid_queue_*` tables) or add Mission Control if it's ever worth a screen.

Locally, mail is **not** sent by default — preview rendered email at `http://localhost:3001/rails/mailers`. Set the `SMTP_*` env vars in development to send real mail (e.g. to test Resend end-to-end).

### Caching

Production `Rails.cache` is `:solid_cache_store` — Postgres-backed, so throttle counters and cached values are shared across all Puma workers with no extra service (`config/cache.yml`; development uses `:memory_store`). Two things ride on it:

- **Rack::Attack throttle counters** (`Rack::Attack.cache.store = Rails.cache`), which have to be shared across processes to actually throttle anything.
- **The dashboard's aggregation query**, cached for 12 hours under a key derived from the user's application count + latest `updated_at`, so it self-invalidates on any change (`app/controllers/api/v1/dashboard_controller.rb`).

### AI job-URL pre-fill

`POST /api/v1/applications/prefill` takes a job-posting URL and returns `{ company, role, notes }` for the user to review and edit before saving — the AI fills the form, it never writes to the database. Logic lives in `Applications::UrlPrefillService`: it fetches the page, strips the HTML to text, and asks **Claude Haiku 4.5** (official `anthropic` gem) to extract the fields via a tool/JSON schema, so the response is structured data rather than free text to parse. Claude reads Japanese postings natively — the same flow works on a Wantedly listing, a Greenhouse page, or a company careers site without a per-site parser, which is the point for a Tokyo job search.

Because the server fetches a user-supplied URL, two safeguards apply:
- **SSRF guard** — the host is resolved and any private / loopback / link-local address (including the cloud metadata endpoint `169.254.169.254`) is refused, re-checked on every redirect hop.
- **Cost & abuse control** — the endpoint is auth-gated and rate-limited via Rack::Attack (10/min per IP), with a body-size cap on the fetch and a character cap on the text sent to Claude to bound token usage.

Errors are typed and mapped to HTTP status: bad/private URL → `422`, missing `ANTHROPIC_API_KEY` → `503`, AI failure → `502`. The model only ever receives text the server already fetched — Anthropic's server-side web-search/fetch tools are deliberately **not** used, which keeps the SSRF guard, rate limiting, and cost under the app's control. Haiku 4.5 is chosen because extraction is a small, well-defined task: a typical posting costs a fraction of a cent.

**Fetch behaviour & limitations.** The fetch sends an honest, identifying `User-Agent` (`KarirKalyan-Prefill/1.0 (+https://kk.chairulakmal.com)`) rather than impersonating a browser — a site that wants to recognise the request can. Because it's a plain server-side `Net::HTTP` GET, it works on pages that serve their content as static HTML, but it will **not** reliably fetch every site, and that's by design rather than a bug:

- **Bot-managed sites** (Cloudflare / Akamai challenge pages) return a `403` or a JS-challenge page instead of content.
- **Aggressive anti-scraping** (e.g. LinkedIn) returns a login wall — effectively unfetchable server-side without authentication.
- **JS-rendered SPAs** return a near-empty HTML shell, since the job text is loaded by client-side JavaScript the server doesn't execute.

In every one of these cases the failure is graceful: a challenge/403 surfaces as `FetchError` ("couldn't fetch that page") and an empty shell as `FetchError` ("no readable text"), so the user simply falls back to filling the form by hand. Defeating bot management or rendering SPAs would mean a headless browser or a third-party scraping API — heavier infrastructure that isn't worth it for a personal tracker, so the limitation is accepted deliberately.

The service also does **not** consult `robots.txt`. This is a single, user-initiated fetch of a URL the user themselves pasted — closer to a link-preview "unfurl" than to autonomous crawling — so it's treated as out of scope; it would be the first thing to add if pre-fill ever fetched URLs on its own.

## Demo data

The "Try demo account" button signs every visitor into one shared user (`demo@karirkalyan.com`), so its data drifts as people explore. In production the `reset_demo_account` recurring task wipes it back to a clean seed **every hour at :42** (`DemoResetJob` → `Demo::ResetService`), scoped to the demo user — real accounts are never touched.

Seeds are idempotent (`find_or_create_by!`), but only *create* — they won't refresh rows that already exist, which is why the reset destroys before reseeding rather than re-running seeds on top.

```bash
bin/rails db:seed       # idempotent: adds any missing demo data, never duplicates
bin/rails demo:reset    # full refresh: destroys the demo user (cascades to its
                        # applications + timeline) and reseeds — real users untouched
```

The hourly task makes a manual reset rarely necessary, but on Railway you can force one via `railway ssh --service api bin/rails demo:reset`. Note that `db:reset`/`db:drop` do **not** work on Railway's managed Postgres (the role can't drop the connected database) — `demo:reset` sidesteps that by deleting only the demo user's records. Logic lives in `Demo::ResetService`.

## Running tests

```bash
# First time (or after a new migration): prepare the test database
bin/rails db:test:prepare

bundle exec rspec                          # full suite (coverage + N+1 detection on by default)
bundle exec rspec spec/lib spec/services   # unit specs only (no DB, fast)
bundle exec rspec spec/requests            # request specs only (real PostgreSQL)
COVERAGE=false bundle exec rspec           # skip SimpleCov for a faster run
```

Two-tier strategy:
- `spec/lib/`, `spec/services/` — unit specs, no database, pure logic
- `spec/requests/` — request specs against a real PostgreSQL database (also the rswag source for OpenAPI generation)

**Coverage:** SimpleCov runs by default and writes to `/coverage/` (gitignored). Open `coverage/index.html` in a browser after a run. Branch coverage enabled; 80% line minimum enforced.

**N+1 detection:** `prosopite` wraps every request spec and raises `Prosopite::NPlusOneQueriesError` on detection. Opt-out per spec with `RSpec.describe "...", type: :request, skip_n_plus_one: true do` (use sparingly — usually a real signal).

## Regenerating API docs

```bash
bin/rails rswag:specs:swaggerize
```

Outputs to `swagger/v1/swagger.yaml`.

## Key files

| File | Purpose |
|---|---|
| `app/lib/application_fsm.rb` | FSM — `TRANSITIONS` array + `assert_transition!` |
| `app/lib/japan_calendar.rb` | The only definition of a business day in Japan — holidays, New Year, Golden Week, Obon |
| `app/services/applications/transition_service.rb` | Status change + audit entry in one transaction |
| `app/services/applications/url_prefill_service.rb` | AI URL pre-fill — fetch + strip + Claude extraction, SSRF-guarded |
| `app/services/exports/applications_csv.rb` | CSV export — formula-injection escaped, `force_quotes` |
| `app/services/exports/account_archive.rb` | Full-account zip — `account.json` + resumes + cover letters |
| `app/jobs/follow_up_reminder_job.rb` | Daily Solid Queue recurring job with idempotency key |
| `config/recurring.yml` | Recurring-task schedule (reminders, demo reset, job cleanup) |
| `spec/requests/api/v1/applications_spec.rb` | Request specs — also source for OpenAPI generation |

## API routes

```
POST   /api/v1/auth/sign_in
DELETE /api/v1/auth/sign_out
DELETE /api/v1/auth/account                # erases the account and everything under it

# There is no sign-up route — registration is closed (SPEC.md § Registration is
# closed). Accounts are made with `bin/rails users:create EMAIL=… PASSWORD=…`.

GET    /api/v1/applications
POST   /api/v1/applications
POST   /api/v1/applications/prefill        # AI URL pre-fill (Claude)
GET    /api/v1/applications/:id
PATCH  /api/v1/applications/:id
DELETE /api/v1/applications/:id
PATCH  /api/v1/applications/:id/transition
GET    /api/v1/applications/:id/resume
GET    /api/v1/applications/:id/cover_letter

GET    /api/v1/exports/applications      # CSV of every application — text/csv
GET    /api/v1/exports/account           # full account: JSON + uploaded PDFs — application/zip

GET    /api/v1/transitions               # the FSM transition table — the board reads this
                                         #   instead of mirroring it in TypeScript
GET    /api/v1/dashboard
GET    /api/v1/me

GET    /up                               # deep health check — pings Postgres; no OpenAPI path
GET    /api-docs
```
