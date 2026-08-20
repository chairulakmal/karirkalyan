# Operational Runbook: KarirKalyan

Production runs self-hosted under Docker, behind a Cloudflare Tunnel (`SPEC.md` § Deployment; through 2026-08-19 it ran on Railway, archived below). Run Rails tasks against prod via `docker compose -f docker-compose.prod.yml exec api ...`, run from the repo root on the host machine.

## Destroy a single user account

Irreversible. Cascades to the user's applications and timeline entries (`dependent: :destroy` on both associations).

```bash
docker compose -f docker-compose.prod.yml exec api \
  bin/rails runner "User.find_by(email: 'user@example.com')&.destroy!"
```

Or interactively:

```bash
docker compose -f docker-compose.prod.yml exec api bash
# then at the container prompt:
bin/rails runner "User.find_by(email: 'user@example.com')&.destroy!"
```

## Reset the demo account

Requires the `demo:reset` task to be deployed (`bin/deploy` after merging).

```bash
docker compose -f docker-compose.prod.yml exec api bin/rails demo:reset
```

Destroys `demo@karirkalyan.com` and its cascaded data, then reseeds. Real users untouched. Backed by `Demo::ResetService`; see `api/README.md` → "Demo data".

---

## Legacy: Railway deployment (through 2026-08-19)

Production ran on Railway from launch through `v1.11.1`; `SPEC.md` § Deployment now describes the Docker + Cloudflare Tunnel setup that replaced it. Kept here for the operational lessons, not because Railway is coming back.

> **Railway managed Postgres caveat:** `db:drop` / `db:reset` do **not** work, since the connecting role can't drop the database it's attached to. Use targeted destroys or `DISABLE_DATABASE_ENVIRONMENT_CHECK=1 bin/rails db:schema:load` for a full table rebuild. Rails tasks against prod ran via `railway ssh --service api`, the direct predecessor of the `docker compose exec` commands above.

**Two app services and one managed datastore.** No Redis. No worker service.

| Service | Root | Start command |
|---|---|---|
| `api` | `api/` | Dockerfile `CMD`: `rails server` (Puma, with the Solid Queue plugin) |
| `web` | `web/` | `npm run start` |
| PostgreSQL 18 | managed (`ghcr.io/railwayapp-templates/postgres-ssl:18`) | - |

**Builder:** Railpack or a Dockerfile. Never Nixpacks: it is deprecated.

**Deploys were path-scoped, and the scoping lived outside this repository.** Each service carried Railway watch patterns covering its own tree, so a merge touching only `web/` redeployed only `web`, and a docs-only merge redeployed neither: verified 2026-08-05 against `0e60c3d` (`web/`-only, `SKIPPED` on `api`, `SUCCESS` on `web`) and `5a71efc` (docs, `SKIPPED` on both). There was no `railway.json`, so nothing in the repo asserted this and no test could catch its loss. If the patterns were ever cleared the symptom was silent: every merge deployed both services, which is the deploy overlap the 2026-07 memory investigation traced every observed spike to.

**Backups.** The Railway Hobby plan had no managed backups, so a GitHub Actions runner ran a daily `pg_dump` against Railway's public Postgres at 05:15 JST and kept the gzipped result as a GitHub Actions artifact on 60-day retention. The self-hosted replacement flips the direction (dump computed locally, pushed out) rather than the destination; see `SPEC.md` § Backups for the current version.

**Production lessons, archived alongside the deployment they describe:**

- **`Dockerfile` `CMD` overrides `Procfile`** unless Railway explicitly invokes the Procfile. Both had to agree. This silently broke the old single-service Puma+Sidekiq setup: only Puma ran, jobs enqueued to Redis, nothing consumed them, and reminders never sent. Solid Queue in Puma removed the whole class of failure, and removing Railway removes the Procfile-vs-Dockerfile ambiguity itself, since Docker Compose never reads a Procfile.
- **Cloudflare custom domain** (`kk.chairulakmal.com`): grey cloud (DNS only) was required for Railway's Let's Encrypt ACME HTTP-01 challenge. Orange cloud intercepted `.well-known/acme-challenge/` and broke provisioning. The Cloudflare Tunnel that replaced Railway has no ACME challenge to protect, so the domain now runs orange-cloud instead (`SPEC.md` § Deployment).
