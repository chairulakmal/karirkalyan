# KarirKalyan: Rails API

This is the operational README for `api/`, KarirKalyan's Rails 8 API-only backend. It explains how to run it, deploy it, and test it. The most important line in it is the seed command: registration is closed, so `bin/rails db:seed` is the only way to get a login. It covers the stack, local setup, deployment environment variables, background jobs and scheduled reminders, caching, the AI pre-fill and its safety limits, the demo data and its hourly reset, running the tests, regenerating the API docs, the key files, and the route table. How the system works, and why it was built that way, is in [`SPEC.md`](../SPEC.md). This file is what you type.

## Stack

- Ruby 3.4.9
- Rails 8.1, API-only
- PostgreSQL 18
- Devise + devise-jwt (JTI revocation)
- Solid Queue + Solid Cache: both Postgres-backed, no Redis
- Anthropic SDK: Claude Haiku 4.5 for AI job-URL pre-fill
- RSpec + FactoryBot + rswag

## Local setup

**Prerequisites:** Docker, Ruby 3.4.9, Bundler

```bash
# Start PostgreSQL (docker-compose.yml lives here, reads .env automatically).
# Postgres is the only container: Solid Queue and Solid Cache use it too.
docker compose up -d

# Install dependencies and set up the database
bundle install
bin/rails db:create db:migrate
bin/rails db:seed             # required: creates the demo account (+ 12 sample applications)
                              # and, outside production, the `e2e` account Playwright signs in as.
                              # Registration is closed: seeding is how you get a login.

# Start the server on :3001
bin/rails server
```

API docs available at `http://localhost:3001/api-docs` once running.

In development, jobs run inside the web server process through the `:async` adapter (`config/environments/development.rb`). That adapter is an in-memory thread pool, not Rails' separate `:inline` adapter, so there is **no worker process to start** next to `rails server`. To run Solid Queue itself in development, set `SOLID_QUEUE_IN_PUMA=1` and remove that adapter line.

## Deployment env vars

| Variable | Source |
|---|---|
| `DB_USERNAME` / `DB_PASSWORD` / `DB_NAME` | Root `.env` (`.env.prod.example`), which also configures the `postgres` service itself. Read as separate values by `config/database.yml`, so no character needs URL-escaping. To rotate the password you must run `ALTER USER` inside the container *and* edit this file. `.env.prod.example` gives the correct order. |
| `DB_HOST` | Set to the `postgres` service name by `docker-compose.prod.yml`. The only one of the five that is a property of the topology rather than the credentials. |
| `SOLID_QUEUE_IN_PUMA` | Set to `1`. **Required**: `config/puma.rb` loads `plugin :solid_queue` only when this variable is set. Without the plugin, no job runs at all, and there is no separate worker service that could run them instead. |
| `DEVISE_JWT_SECRET_KEY` | Generate: `ruby -e "require 'securerandom'; puts SecureRandom.hex(64)"` |
| `FRONTEND_URL` | URL of the deployed `web` service (also used as the link host in reminder emails) |
| `SECRET_KEY_BASE` | Generate: `bin/rails secret`. Preferred over `RAILS_MASTER_KEY`: this app stores no secrets in `credentials.yml.enc`, so sharing the master key with production is unnecessary. |
| `SMTP_HOST` | SMTP server for outbound mail. Resend: `smtp.resend.com`. The mailer is provider-agnostic: any SMTP host works. |
| `SMTP_PORT` | SMTP port. Defaults to `587` (STARTTLS). Production uses `2587`, Resend's alternate STARTTLS port, kept from the Railway-era setup since many networks block outbound 587/465; `2465` is the implicit-TLS alternate. |
| `SMTP_USER` | SMTP username. For Resend this is the literal string `resend`. |
| `SMTP_PASS` | SMTP password / API key. For Resend, a `re_…` API key. |
| `MAILER_FROM` | `From:` address for outbound mail, e.g. `KarirKalyan <reminders@kk.chairulakmal.com>`. Must be on a domain verified with the SMTP provider. |
| `ANTHROPIC_API_KEY` | Anthropic API key (pay-as-you-go, from console.anthropic.com) for the AI job-URL pre-fill. Pre-fill is a synchronous request, not a background job. If unset, `POST /applications/prefill` returns `503` and the rest of the app is unaffected. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push VAPID keypair for the push digest. Generate: `bin/rails push:vapid`, one pair **per environment** (a dev key must never be able to sign a push to the production user), never committed. If unset, the push endpoints return `503 push_unavailable`, the follow-up digest stays email-only, and the rest of the app is unaffected. |
| `HONEYBADGER_API_KEY` | Error reporting (`config/honeybadger.yml`). |

### Background jobs & scheduled reminders

Jobs run on **Solid Queue**, backed by the same PostgreSQL database: no Redis, and no separate worker service. In production the supervisor, dispatcher, and workers run **inside the Puma process** via `plugin :solid_queue` (`config/puma.rb`), which loads only when `SOLID_QUEUE_IN_PUMA` is set. Worker/dispatcher tuning lives in `config/queue.yml`.

Recurring work is declared in `config/recurring.yml`:

| Task | Schedule | What it does |
|---|---|---|
| `follow_up_reminders` | `15 8 * * * Asia/Tokyo` (08:15 JST, the user's morning) | `FollowUpReminderJob` |
| `reset_demo_account` | hourly, at :42 | `DemoResetJob`; see [Demo data](#demo-data) |
| `clear_solid_queue_finished_jobs` | hourly, at :12 | Keeps the jobs table from growing unbounded |

`FollowUpReminderJob` runs in four steps:

1. It collects every application whose `follow_up_at` has come due, looking back up to 30 days, so a reminder held on an earlier day is not lost.
2. It writes one `TimelineEntry` per application. That row is the anchor that makes each reminder send exactly once.
3. It takes the applications whose `TimelineEntry` was created successfully in step 2, groups them **by user**, and enqueues one `FollowUpMailer.digest` per user through `deliver_later` on the `mailers` queue. The result is one email per user per day, not one email per application.
4. The same per-user batch also goes to a second channel: one `PushDigestJob` per user sends the digest as a Web Push notification (`web-push` gem, VAPID) to every enrolled device.

The timeline row is the only exactly-once anchor, and delivery is kept separate from it. A temporary SMTP failure therefore retries the email without writing a second timeline entry, a push failure retries without sending the email again, and a subscription that the push service reports as gone (`404` / `410`) deletes itself.

The job **holds** the reminder on any day that `JapanCalendar` does not count as a business day: weekends, national holidays (through the `holidays` gem, so 春分の日 follows the equinox and 振替休日 is applied), New Year, Golden Week, and Obon. Held is not dropped. The idempotency key comes from `follow_up_at`, **not** from the day the job runs, so the run on the next business day finds the reminder and sends it exactly once. The same property means an overdue application is not reminded again every morning. Setting `follow_up_at` to a new date arms the reminder again.

There is **no job dashboard**. The `Sidekiq::Web` mount was removed together with Sidekiq. Inspect the queue in `psql` (the `solid_queue_*` tables), or add Mission Control if a dedicated screen ever becomes worth building.

Locally, mail is **not** sent by default: preview rendered email at `http://localhost:3001/rails/mailers`. Set the `SMTP_*` env vars in development to send real mail (e.g. to test Resend end-to-end).

### Caching

Production `Rails.cache` is `:solid_cache_store`, which is backed by Postgres. Throttle counters and cached values are therefore shared across all Puma workers with no extra service (`config/cache.yml`; development uses `:memory_store`). Two things depend on it:

- **Rack::Attack throttle counters** (`Rack::Attack.cache.store = Rails.cache`). These counters must be shared across processes, or the throttle does not work.
- **The dashboard's aggregation query**, cached for 12 hours under a key derived from the user's application count + latest `updated_at`, so it self-invalidates on any change (`app/controllers/api/v1/dashboard_controller.rb`).

### AI job-URL pre-fill

`POST /api/v1/applications/prefill` takes a job posting as a **`url` or as pasted `text`**. The paste path was added in `v1.6.0`, for postings that the fetcher cannot read. The endpoint returns structured fields for the user to review and edit before saving: `company`, `role`, `notes`, plus the Japan-market set added in `v1.8.0`–`v1.9.0` (`channel`, `agency`, `japanese_level`, `sponsorship`, `hiring_entity`, `company_timezone`, `overlap_hours_required`, and the four 年収 compensation fields). `url` and `posting_text` are merged on top. **The AI fills the form. It never writes to the database.**

The logic lives in `Applications::UrlPrefillService`. It fetches the page, strips the HTML down to text, and asks **Claude Haiku 4.5** (the official `anthropic` gem) to extract the fields. The request uses a tool with a JSON schema, so the answer comes back as structured data instead of free text that would have to be parsed. Claude reads Japanese postings directly, so the same flow works on a Wantedly listing, a Greenhouse page, or a company careers site, with no parser written for each site. That is the whole point for a Tokyo job search.

Because the server fetches a user-supplied URL, two safeguards apply:
- **SSRF guard**: the host is resolved, and any private, loopback, or link-local address is refused, including the cloud metadata endpoint `169.254.169.254`. The check runs again after every redirect. One internal address rejects the whole URL. The connection is then pinned to an address that passed the check (`http.ipaddr`), so Net::HTTP cannot resolve the host again to a different address between the check and the connection.
- **Cost & abuse control**: the endpoint is auth-gated and rate-limited via Rack::Attack (10/min per IP), with a body-size cap on the fetch and a character cap on the text sent to Claude to bound token usage.

Errors are typed, because these six failures ask the user to do six different things:

| What went wrong | Response | Notes |
|---|---|---|
| The URL is malformed, or it points to a private address | `422` `invalid_url` | The SSRF guard above rejects it. |
| A site refuses an automated reader | `422` `prefill_blocked` | The URL is correct. Retrying gives the same result. |
| The page cannot be fetched at all | `502` `prefill_unreachable` | An upstream `429` also lands here. That refusal is temporary, so a retry is worth asking for. |
| The page was fetched, but produced nothing usable | `502` `prefill_failed` | Either the page held no text, or the AI extraction failed. |
| Pasted text is longer than `MAX_TEXT_CHARS` after stripping to text | `422` `prefill_paste_too_long` | Only the paste path can raise this. A fetched page over the limit is truncated silently, because the user never saw its length. |
| `ANTHROPIC_API_KEY` is missing | `503` `prefill_unavailable` | Pre-fill is off; the rest of the app is unaffected. |

The model only ever receives text that the server has already fetched. Anthropic's server-side web-search and web-fetch tools are deliberately **not** used, which keeps the SSRF guard, the rate limiting, and the cost under this app's control. Haiku 4.5 is the chosen model because extraction is a small, well-defined task: a typical posting costs a fraction of a cent.

**Fetch behavior and limitations.** The fetch sends an honest `User-Agent` that identifies the app (`KarirKalyan-Prefill/1.0 (+https://kk.chairulakmal.com)`). It does not pretend to be a browser, so a site that wants to recognize the request can do so. The fetch is a plain server-side `Net::HTTP` GET. It works on pages that serve their content as static HTML. It will **not** fetch every site reliably, and that limit is deliberate:

- **Bot-managed sites** (Cloudflare / Akamai challenge pages) return a `403` or a JS-challenge page instead of content.
- **Aggressive anti-scraping** (e.g. LinkedIn) returns a login wall: effectively unfetchable server-side without authentication.
- **JS-rendered SPAs** return a near-empty HTML shell, since the job text is loaded by client-side JavaScript the server doesn't execute.

In all three cases the failure is graceful, and it names which case happened. A challenge page or a `403` (or a `cf-mitigated` header on any status) becomes `BlockedError` → `prefill_blocked`. An empty HTML shell becomes `UnreadableError` → `prefill_failed`. Both messages ask the user to fill the form manually, because both failures are permanent. Earlier versions reported all of these as "your URL is malformed", which was wrong: the URL is correct. Defeating bot management, or rendering a single-page app, would require a headless browser or a third-party scraping service. That is heavier infrastructure than a personal tracker justifies, so the limit is accepted deliberately.

The service also does **not** read `robots.txt`. This is one fetch, started by the user, of a URL that the user pasted. It is closer to the link preview a chat app generates than to a crawler that visits pages on its own, so `robots.txt` is treated as out of scope. It would be the first thing to add if pre-fill ever fetched URLs by itself.

## Demo data

The "Try demo account" button signs every visitor into one shared user (`demo@karirkalyan.com`), so its data changes as people explore. In production, the `reset_demo_account` recurring task returns it to a clean seed **every hour at :42** (`DemoResetJob` → `Demo::ResetService`). The task is scoped to the demo user, so real accounts are never touched.

Seeds are idempotent (`find_or_create_by!`), but they only *create*. They do not refresh rows that already exist. That is why the reset destroys the demo user first and then reseeds, instead of running the seeds again on top of the old rows.

```bash
bin/rails db:seed       # idempotent: adds any missing demo data, never duplicates
bin/rails demo:reset    # full refresh: destroys the demo user (cascades to its
                        # applications + timeline) and reseeds; real users untouched
```

The hourly task makes a manual reset rarely necessary, but you can force one with `docker compose -f docker-compose.prod.yml exec api bin/rails demo:reset`. `demo:reset` deletes only the demo user's records; it does not use `db:reset` or `db:drop`. The Railway-era Postgres required this scoped approach, because its role could not drop the connected database. It is still the right approach here, because the demo user's records are the only data that should ever be erased. The logic lives in `Demo::ResetService`.

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
- `spec/lib/`, `spec/services/`: unit specs, no database, pure logic
- `spec/requests/`: request specs against a real PostgreSQL database (also the rswag source for OpenAPI generation)

**Coverage:** SimpleCov runs by default and writes to `/coverage/` (gitignored). Open `coverage/index.html` in a browser after a run. Branch coverage enabled; 80% line minimum enforced.

**N+1 detection:** an N+1 query is one where the code runs a separate query for every row instead of one query for all rows. `prosopite` wraps every request spec and raises `Prosopite::NPlusOneQueriesError` when it finds one. Opt out for a single spec with `RSpec.describe "...", type: :request, skip_n_plus_one: true do` (use sparingly; usually a real signal).

## Regenerating API docs

```bash
bin/rails rswag:specs:swaggerize
```

Outputs to `swagger/v1/swagger.yaml`.

## Key files

| File | Purpose |
|---|---|
| `app/lib/application_fsm.rb` | FSM: `TRANSITIONS` array + `assert_transition!` |
| `app/lib/japan_calendar.rb` | The only definition of a business day in Japan: holidays, New Year, Golden Week, Obon |
| `app/services/applications/transition_service.rb` | Status change + audit entry in one transaction |
| `app/services/applications/url_prefill_service.rb` | AI URL pre-fill: fetch + strip + Claude extraction, SSRF-guarded |
| `app/services/exports/applications_csv.rb` | CSV export: formula-injection escaped, `force_quotes` |
| `app/services/exports/account_archive.rb` | Full-account zip: `account.json` + resumes + cover letters |
| `app/jobs/follow_up_reminder_job.rb` | Daily Solid Queue recurring job with idempotency key |
| `config/recurring.yml` | Recurring-task schedule (reminders, demo reset, job cleanup) |
| `spec/requests/api/v1/applications_spec.rb` | Request specs; also source for OpenAPI generation |

## API routes

```
POST   /api/v1/auth/sign_in
DELETE /api/v1/auth/sign_out
DELETE /api/v1/auth/account                # erases the account and everything under it
POST   /api/v1/auth/passkey/options        # WebAuthn assertion options (usernameless ceremony)
POST   /api/v1/auth/passkey                # verify the assertion; answers with the same
                                           #   Authorization header as sign_in

# There is no sign-up route: registration is closed (SPEC.md § Registration is
# closed). Accounts are made with `bin/rails users:create EMAIL=… PASSWORD=…`.

GET    /api/v1/applications
POST   /api/v1/applications
POST   /api/v1/applications/prefill        # AI pre-fill (Claude); url or pasted text
GET    /api/v1/applications/ownership_check # agency duplicate-submission warning
GET    /api/v1/applications/:id
PATCH  /api/v1/applications/:id
DELETE /api/v1/applications/:id
PATCH  /api/v1/applications/:id/transition
POST   /api/v1/applications/:id/talking_points  # cover-letter bullets (resume x posting)
GET    /api/v1/applications/:id/interview  # .ics VEVENT for interview_at (text/calendar)
GET    /api/v1/applications/:id/resume
GET    /api/v1/applications/:id/cover_letter

GET    /api/v1/passkeys                  # the account's enrolled passkeys
POST   /api/v1/passkeys/options          # WebAuthn creation options
POST   /api/v1/passkeys                  # register a new passkey
DELETE /api/v1/passkeys/:id

GET    /api/v1/push_subscriptions/public_key   # the VAPID public key the browser subscribes with
POST   /api/v1/push_subscriptions
DELETE /api/v1/push_subscriptions        # endpoint in the body, not an id: the browser
                                         #   knows its endpoint, not our row id

GET    /api/v1/exports/applications      # CSV of every application (text/csv)
GET    /api/v1/exports/account           # full account: JSON + uploaded PDFs (application/zip)

GET    /api/v1/transitions               # the FSM transition table; the board reads this
                                         #   instead of mirroring it in TypeScript
GET    /api/v1/dashboard
GET    /api/v1/me
PATCH  /api/v1/me                        # residence status / expiry

GET    /up                               # deep health check: pings Postgres; no OpenAPI path
GET    /api-docs
```
