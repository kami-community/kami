-- Explicit API role privileges.
--
-- Newer Supabase projects no longer grant table access to the API roles by
-- default. Kami's server talks to PostgREST as `service_role` only, so grant it
-- everything in `public` (now and for future tables) and make sure the public
-- `anon` / `authenticated` roles have nothing — RLS stays on as a second lock.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all routines in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on routines from anon, authenticated;
