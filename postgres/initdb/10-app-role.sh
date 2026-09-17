#!/usr/bin/env bash
# Runs once, when the postgres container initializes an EMPTY data directory
# (the image runs every executable *.sh in /docker-entrypoint-initdb.d at that
# moment and never again). It creates the role the app connects as, so a
# from-scratch boot ends in the same state as the live database: `api` is not
# a superuser. Keep the file executable: a non-executable one is *sourced*
# into the entrypoint's shell instead, where `set -u` would outlive this file.
#
# On an existing volume this file does nothing; the live role was created by
# hand following notes/OPS.md § Move the app off the superuser.
#
# APP_DB_USER / APP_DB_PASSWORD are interpolated into the postgres service's
# environment from the root .env (DB_USERNAME / DB_PASSWORD), the same values
# `api` reads. POSTGRES_USER / POSTGRES_DB come from .env.postgres.
#
# psql's :'var' and :"var" forms quote the values, so a password may contain
# any character.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v db="$POSTGRES_DB" -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password';
ALTER DATABASE :"db" OWNER TO :"app_user";
SQL
