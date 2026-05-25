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

# Start the server on :3001
bin/rails server
```

API docs available at `http://localhost:3001/api-docs` once running.

## Running tests

```bash
# First time (or after a new migration): prepare the test database
bin/rails db:test:prepare

bundle exec rspec                          # full suite
bundle exec rspec spec/lib spec/services   # unit specs only (no DB, fast)
bundle exec rspec spec/requests            # request specs only (real PostgreSQL)
```

Two-tier strategy:
- `spec/lib/`, `spec/services/` — unit specs, no database, pure logic
- `spec/requests/` — request specs against a real PostgreSQL database (also the rswag source for OpenAPI generation)

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
