-- ═══════════════════════════════════════════════════════════════════════════
-- Close the second door into the register.
--
-- Run this in the Supabase SQL editor, as the project owner.
-- Verified against production on 12 August 2026. Nothing here has been run for
-- you: revoking privileges on a live database is your call, not the tooling's.
--
-- ── What is wrong ─────────────────────────────────────────────────────────
--
--   · 34 tables in `public`, row-level security enabled on 0 of them
--   · 0 RLS policies exist
--   · `anon` and `authenticated` each hold
--     SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     on all 34
--   · the PostgREST Data API is enabled on `public`
--
-- Confirmed live, not inferred: a single unauthenticated GET with the
-- publishable key returned rows from `user`, `session`, `application`,
-- `audit_event`, `document` and `party`. The publishable key is by design
-- shipped to the browser — it is in the client bundle of every page.
--
-- The effect is that every guarantee in CLAUDE.md is reachable around. Session
-- tokens, password hashes, encrypted national IDs and the whole case file are
-- readable, and — because the grants include INSERT and UPDATE — writable, by
-- anyone who opens the site and reads the JavaScript. The application's
-- authorisation is not weak; it is simply not the only way in.
--
-- The audit table has its own trigger guards, so a DELETE against it is
-- refused at the database. That is the only table where that is true.
--
-- ── Order matters ─────────────────────────────────────────────────────────
--
-- Revoke first, then enable RLS. Doing it the other way round leaves a window
-- in which the grants still stand and only the policies are missing.
--
-- The application is unaffected by any of this: it connects with the `postgres`
-- role through Prisma and has never used the anon key for data access. The one
-- place the publishable key appears is the Supabase JS client, which this
-- project does not use for reads.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Take the privileges away ───────────────────────────────────────────
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke usage on schema public from anon, authenticated;

-- And stop them being granted again to every table created from now on.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ── 2. Turn row-level security on, and force it ───────────────────────────
-- FORCE matters: without it the table owner bypasses RLS, and in a Supabase
-- project several roles are effectively owners. With no policies defined, this
-- is deny-by-default, which is the correct posture for a register whose only
-- legitimate reader is the application's own connection.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname <> '_prisma_migrations'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('alter table public.%I force  row level security', t.relname);
  end loop;
end
$$;

commit;

-- ── 3. Check it took ──────────────────────────────────────────────────────
-- Expect: rls_enabled = rls_forced = the table count, and no rows from the
-- grants query at all.
select count(*)::int                                        as tables,
       count(*) filter (where c.relrowsecurity)::int        as rls_enabled,
       count(*) filter (where c.relforcerowsecurity)::int    as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname <> '_prisma_migrations';

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated');

-- ═══════════════════════════════════════════════════════════════════════════
-- ── Then, in the dashboard, and in this order ─────────────────────────────
--
--   1. Settings → API → Data API: set the exposed schemas to none, or disable
--      the Data API entirely. This project does not use PostgREST for anything.
--      Belt as well as braces: the grants above are the braces.
--
--   2. Settings → API → rotate the publishable / anon key. The current one has
--      been readable in a public deployment for as long as the site has been
--      up, and must be treated as known.
--
--   3. Invalidate every session, because session tokens were readable through
--      the open door. Against the database:
--
--        delete from session;
--
--      Sessions are the one thing this product is allowed to delete — see the
--      note on the Session model — and everyone simply signs in again.
--
--   4. Reset the demonstration accounts' passwords, since the `account` table's
--      password hashes were readable too. For seeded demonstration accounts on
--      a demonstration deployment this is housekeeping rather than an incident;
--      treat it as an incident the moment a real person holds an account here.
--
-- ── What this does not do ─────────────────────────────────────────────────
--
-- It does not make the deployment a production government system. It closes
-- one door that should never have been open. The list of what else is
-- outstanding is in docs/QA_BUSINESS_REPORT.md §Remaining.
-- ═══════════════════════════════════════════════════════════════════════════
