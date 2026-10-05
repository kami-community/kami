-- Lock down every table in the public schema.
--
-- Kami's server uses the service-role key, which bypasses RLS. Enabling RLS with
-- no policies means the public anon key (and PostgREST) can read or write nothing.
-- Re-run after adding tables, or enable RLS in each new migration.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
