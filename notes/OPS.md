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

Destroys `demo@karirkalyan.com` and its cascaded data, then reseeds. Real users untouched. Backed by `Demo::ResetService`; see `api/README.md` → "Demo data".
