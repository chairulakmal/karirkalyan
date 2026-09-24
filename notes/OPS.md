# Operational Runbook: KarirKalyan

The runbook for operating KarirKalyan in production: the tasks an operator runs by hand against the live stack. The one thing to know before running anything here is that **every command below is irreversible and hits real user data**, so read the caveat under each heading first. It covers destroying a single user account, resetting the demo account, and the two environment facts those commands depend on. Deployment itself is not here: `SPEC.md` § Deployment describes the stack, and the archived Railway-era runbook lives in [`HISTORY.md`](HISTORY.md).

Production runs self-hosted under Docker, behind a Cloudflare Tunnel. Run Rails tasks against prod via `docker compose -f docker-compose.prod.yml exec api ...`, from the repo root on the host machine.

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

Deletes the data of `demo@karirkalyan.com` (applications, timeline, agencies, passkeys, push subscriptions), signs out every demo session by rotating its `jti`, then reseeds. The user row and its id are kept, so the per-account throttles do not reset. Real users untouched. Backed by `Demo::ResetService`; see `api/README.md` → "Demo data".

## Move the app off the superuser

**Done on production 2026-09-24.** Kept for the case that needs it again: a restore from a dump taken before that date, into a database whose tables the superuser still owns. A fresh volume does not need it, because `postgres/initdb/10-app-role.sh` creates the role.

One-time, on the live database, in this order. `api` keeps running as the superuser until step 6, so nothing before the deploy causes downtime. A wrong value in the `.env` edits does not let `api` boot against bad credentials: the `postgres` healthcheck authenticates as the app role and reports `unhealthy` instead. Requires the compose change that introduced `.env.postgres` to be merged, since step 6 relies on it.

1. Pick a password for the new role and keep it for step 5. `openssl rand -base64 32` is fine.
2. Create the role and hand it the database. `\password` prompts without echo, so the password never lands in shell history:

   ```bash
   docker compose -f docker-compose.prod.yml exec postgres psql -U karirkalyan -d api_production
   ```

   ```sql
   CREATE ROLE karirkalyan_app LOGIN;
   \password karirkalyan_app
   ALTER DATABASE api_production OWNER TO karirkalyan_app;
   \q
   ```

3. Transfer every table and sequence. `REASSIGN OWNED` refuses the bootstrap superuser, so the script walks the catalog instead. It ends by listing what the superuser still owns inside `public`; expect zero rows. The `pgcrypto` extension stays with the superuser on purpose (extensions have no `OWNER TO`, and the app only calls its functions).

   ```bash
   docker compose -f docker-compose.prod.yml exec -T postgres \
     psql -U karirkalyan -d api_production -v from=karirkalyan -v to=karirkalyan_app -f - \
     < postgres/transfer-ownership.sql
   ```

4. Create `.env.postgres` from `.env.postgres.example`: `POSTGRES_USER=karirkalyan`, and the current `DB_PASSWORD` value as `POSTGRES_PASSWORD`. Then `chmod 600 .env.postgres`. Without this file the next compose command fails on a missing `env_file`.
5. Edit `.env`: `DB_USERNAME=karirkalyan_app`, `DB_PASSWORD=` the password from step 1.
6. `bin/deploy`. Compose recreates `postgres` (its environment changed) and `api` (its credentials changed). `postgres` turns healthy only once the app role authenticates; `api` then runs `db:prepare` as the new owner of every table.
7. Verify that Rails is connected as the plain role:

   ```bash
   docker compose -f docker-compose.prod.yml exec api bin/rails runner \
     'p ActiveRecord::Base.connection.select_rows("select current_user, rolsuper from pg_roles where rolname = current_user")'
   ```

   Expect `[["karirkalyan_app", false]]`.

The backups runner keeps using the superuser over the container's Unix socket (`docker exec`), so nothing in `karirkalyan-backups` changes. To roll back after step 6, put the old `DB_USERNAME` / `DB_PASSWORD` back in `.env` and deploy again; ownership does not need reversing, because a superuser can act on any object regardless of who owns it.
