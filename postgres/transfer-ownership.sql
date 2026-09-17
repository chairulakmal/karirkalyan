-- Moves every table, sequence and view in schema `public` from one role to
-- another. Run once, by notes/OPS.md § Move the app off the superuser.
--
-- REASSIGN OWNED BY would be the one-line version, but Postgres refuses it for
-- the bootstrap superuser ("cannot reassign ownership of objects owned by role
-- ... because they are required by the database system"), and in the official
-- image POSTGRES_USER *is* the bootstrap superuser. So this walks the catalog.
-- ALTER TABLE ... OWNER TO carries the table's indexes and its serial
-- sequences along; the sequence loop is for standalone ones. Extensions have
-- no OWNER TO and stay with the superuser, which the app does not need: it only
-- calls pgcrypto's functions, and CREATE EXTENSION IF NOT EXISTS is a no-op
-- once the extension exists.
--
-- Usage (psql interpolates :'from' / :'to' only from a script, not from -c):
--
--   psql -v from=karirkalyan -v to=karirkalyan_app -f - < postgres/transfer-ownership.sql
--
-- The final SELECT lists what is still owned by `from` inside `public`. The
-- expected output is zero rows.

\set ON_ERROR_STOP on

SELECT set_config('transfer.from', :'from', false) AS from_role,
       set_config('transfer.to',   :'to',   false) AS to_role \gset

DO $$
DECLARE
  r   record;
  src text := current_setting('transfer.from');
  dst text := current_setting('transfer.to');
BEGIN
  FOR r IN
    SELECT format('%I.%I', schemaname, tablename) AS obj
    FROM pg_tables WHERE schemaname = 'public' AND tableowner = src
  LOOP
    EXECUTE format('ALTER TABLE %s OWNER TO %I', r.obj, dst);
  END LOOP;

  FOR r IN
    SELECT format('%I.%I', schemaname, sequencename) AS obj
    FROM pg_sequences WHERE schemaname = 'public' AND sequenceowner = src
  LOOP
    EXECUTE format('ALTER SEQUENCE %s OWNER TO %I', r.obj, dst);
  END LOOP;

  FOR r IN
    SELECT format('%I.%I', schemaname, viewname) AS obj
    FROM pg_views WHERE schemaname = 'public' AND viewowner = src
  LOOP
    EXECUTE format('ALTER VIEW %s OWNER TO %I', r.obj, dst);
  END LOOP;
END $$;

SELECT 'still owned by ' || :'from' || ': ' || c.relkind::text || ' ' || c.relname AS leftover
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND pg_get_userbyid(c.relowner) = :'from'
  AND c.relkind IN ('r', 'S', 'v', 'm', 'p');
