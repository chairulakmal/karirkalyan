# KarirKalyan — Rails API

Rails 8 API-only backend for KarirKalyan. Handles auth, application tracking, background reminders, and dashboard aggregations.

## Stack

- Ruby 3.4.9
- Rails 8.1, API-only
- PostgreSQL 16
- Devise + devise-jwt (JTI revocation)
- Sidekiq + sidekiq-cron
- Anthropic SDK — Claude Haiku 4.5 for AI job-URL pre-fill
- RSpec + FactoryBot + rswag

## Local setup

**Prerequisites:** Docker, Ruby 3.4.9, Bundler

```bash
# Start PostgreSQL and Redis (docker-compose.yml lives here, reads .env automatically)
docker compose up -d

# Install dependencies and set up the database
bundle install
bin/rails db:create db:migrate
bin/rails db:seed             # optional: loads demo account + 12 sample applications

# Start the server on :3001
bin/rails server
```

API docs available at `http://localhost:3001/api-docs` once running.

## Deployment env vars

| Variable | Source |
|---|---|
| `DATABASE_URL` | Railway managed Postgres (reference variable) |
| `REDIS_URL` | Railway managed Redis (reference variable) |
| `DEVISE_JWT_SECRET_KEY` | Generate: `ruby -e "require 'securerandom'; puts SecureRandom.hex(64)"` |
| `FRONTEND_URL` | URL of the deployed `web` service (also used as the link host in reminder emails) |
| `SECRET_KEY_BASE` | Generate: `bin/rails secret`. Preferred over `RAILS_MASTER_KEY` — this app stores no secrets in `credentials.yml.enc`, so sharing the master key with production is unnecessary. |
| `SMTP_HOST` | SMTP server for outbound mail. Resend: `smtp.resend.com`. The mailer is provider-agnostic — any SMTP host works. |
| `SMTP_PORT` | SMTP port. Defaults to `587` (STARTTLS). **On Railway use `2587`** — Railway blocks outbound 587/465; `2587`/`2465` are Resend's alternate ports. |
| `SMTP_USER` | SMTP username. For Resend this is the literal string `resend`. |
| `SMTP_PASS` | SMTP password / API key. For Resend, a `re_…` API key. |
| `MAILER_FROM` | `From:` address for outbound mail, e.g. `KarirKalyan <reminders@kk.chairulakmal.com>`. Must be on a domain verified with the SMTP provider. |
| `ANTHROPIC_API_KEY` | Anthropic API key (pay-as-you-go, from console.anthropic.com) for the AI job-URL pre-fill. **Only the `api` service needs it** — pre-fill is a synchronous request, not a Sidekiq job. If unset, `POST /applications/prefill` returns `503` and the rest of the app is unaffected. |
| `SIDEKIQ_USERNAME` | HTTP basic-auth user for the `/sidekiq` dashboard. **Required in production** — the dashboard fails closed (401) if unset. |
| `SIDEKIQ_PASSWORD` | HTTP basic-auth password for `/sidekiq`. |

### Email & scheduled reminders

`FollowUpReminderJob` runs daily via **sidekiq-cron** (`config/sidekiq_cron.yml`, loaded by `config/initializers/sidekiq.rb` in the Sidekiq server process only) at `15 23 * * *` UTC — 08:15 JST, the user's morning. For each application whose `follow_up_at` falls due, it writes a `TimelineEntry` (the exactly-once idempotency anchor) and enqueues a `FollowUpMailer.reminder` email via `deliver_later` on the `mailers` queue. Decoupling delivery means a transient SMTP failure retries the email without ever duplicating the timeline entry.

**Production topology:** background jobs run in a dedicated Railway **`sidekiq`** service (the same Docker image as `api`, with a `bundle exec sidekiq -C config/sidekiq.yml` Start Command override). The `api` service only *enqueues* — nothing processes the queue without the `sidekiq` service running. It mirrors `api`'s env via `${{api.*}}` variable references.

Locally, mail is **not** sent by default — preview rendered email at `http://localhost:3001/rails/mailers`. Set the `SMTP_*` env vars in development to send real mail (e.g. to test Resend end-to-end).

### Sidekiq dashboard

Live job/queue/retry/cron view at `GET /sidekiq` (`Sidekiq::Web`). Protected by HTTP basic auth in production via `SIDEKIQ_USERNAME` / `SIDEKIQ_PASSWORD` (fails closed if unset); open on localhost in dev. API-only Rails omits the session middleware Sidekiq::Web's CSRF protection needs, so it's mounted with its own cookie session (`config/routes.rb`).

### Caching

Production `Rails.cache` is `:redis_cache_store` (same Redis as Sidekiq), shared across Puma workers and also backing Rack::Attack's throttle counters. The dashboard's heavy aggregation query is cached with a key derived from the user's application count + latest `updated_at`, so it self-invalidates on any change. Short client timeouts + an `error_handler` mean an unreachable Redis degrades to a cache miss rather than erroring the request.

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

The "Try demo account" button signs every visitor into one shared user (`demo@karirkalyan.com`), so its data drifts as people explore. Seeds are idempotent (`find_or_create_by!`), but only *create* — they won't refresh rows that already exist.

```bash
bin/rails db:seed       # idempotent: adds any missing demo data, never duplicates
bin/rails demo:reset    # full refresh: destroys the demo user (cascades to its
                        # applications + timeline) and reseeds — real users untouched
```

On Railway, run the reset against production via `railway ssh --service api bin/rails demo:reset`. Note that `db:reset`/`db:drop` do **not** work on Railway's managed Postgres (the role can't drop the connected database) — `demo:reset` sidesteps that by deleting only the demo user's records. Logic lives in `Demo::ResetService`.

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
| `app/services/applications/transition_service.rb` | Status change + audit entry in one transaction |
| `app/services/applications/url_prefill_service.rb` | AI URL pre-fill — fetch + strip + Claude extraction, SSRF-guarded |
| `app/jobs/follow_up_reminder_job.rb` | Daily Sidekiq job with idempotency key |
| `spec/requests/api/v1/applications_spec.rb` | Request specs — also source for OpenAPI generation |

## API routes

```
POST   /api/v1/auth/sign_up
POST   /api/v1/auth/sign_in
DELETE /api/v1/auth/sign_out

GET    /api/v1/applications
POST   /api/v1/applications
POST   /api/v1/applications/prefill        # AI URL pre-fill (Claude)
GET    /api/v1/applications/:id
PATCH  /api/v1/applications/:id
DELETE /api/v1/applications/:id
PATCH  /api/v1/applications/:id/transition
GET    /api/v1/applications/:id/resume
GET    /api/v1/applications/:id/cover_letter
GET    /api/v1/dashboard

GET    /api-docs
```
