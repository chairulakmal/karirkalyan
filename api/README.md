# KarirKalyan — Rails API

Rails 8 API-only backend for KarirKalyan. Handles auth, application tracking, background reminders, and dashboard aggregations.

## Stack

- Ruby 3.4.9
- Rails 8.1, API-only
- PostgreSQL 16
- Devise + devise-jwt (JTI revocation)
- Sidekiq + sidekiq-cron
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
| `SMTP_PORT` | SMTP port. Defaults to `587` (STARTTLS). |
| `SMTP_USER` | SMTP username. For Resend this is the literal string `resend`. |
| `SMTP_PASS` | SMTP password / API key. For Resend, a `re_…` API key. |
| `MAILER_FROM` | `From:` address for outbound mail, e.g. `KarirKalyan <reminders@kk.chairulakmal.com>`. Must be on a domain verified with the SMTP provider. |

### Email & scheduled reminders

`FollowUpReminderJob` runs daily via **sidekiq-cron** (`config/sidekiq_cron.yml`, loaded by `config/initializers/sidekiq.rb` in the Sidekiq server process only) at `15 23 * * *` UTC — 08:15 JST, the user's morning. For each application whose `follow_up_at` falls due, it writes a `TimelineEntry` (the exactly-once idempotency anchor) and enqueues a `FollowUpMailer.reminder` email via `deliver_later` on the `mailers` queue. Decoupling delivery means a transient SMTP failure retries the email without ever duplicating the timeline entry.

Locally, mail is **not** sent by default — preview rendered email at `http://localhost:3001/rails/mailers`. Set the `SMTP_*` env vars in development to send real mail (e.g. to test Resend end-to-end).

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
| `app/jobs/follow_up_reminder_job.rb` | Daily Sidekiq job with idempotency key |
| `spec/requests/api/v1/applications_spec.rb` | Request specs — also source for OpenAPI generation |

## API routes

```
POST   /api/v1/auth/sign_up
POST   /api/v1/auth/sign_in
DELETE /api/v1/auth/sign_out

GET    /api/v1/applications
POST   /api/v1/applications
GET    /api/v1/applications/:id
PATCH  /api/v1/applications/:id
DELETE /api/v1/applications/:id
PATCH  /api/v1/applications/:id/transition
GET    /api/v1/applications/:id/resume
GET    /api/v1/applications/:id/cover_letter
GET    /api/v1/dashboard

GET    /api-docs
```
