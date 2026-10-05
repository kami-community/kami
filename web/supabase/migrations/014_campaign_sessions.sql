-- Campaign sessions are created and enriched server-side.
--
-- * One goals column (goals_list duplicated goals).
-- * The founder's "That's us" confirmation is stored, not kept in browser storage.
-- * Hermes session ids are derived per agent run, so agent_sessions no longer needs one.
-- * The dossier lives in brand_profiles.raw_dossier; the copies in icp_buckets and
--   the legacy opportunities/activity/messages tables are no longer written or read.

update agent_sessions
set goals = goals_list
where goals_list is not null and jsonb_typeof(goals_list) = 'array' and goals_list <> '[]'::jsonb;
alter table agent_sessions drop column if exists goals_list;

alter table agent_sessions add column if not exists dossier_confirmed_at timestamptz;
alter table agent_sessions alter column hermes_session_id drop not null;

drop table if exists opportunities;
drop table if exists icp_buckets;
drop table if exists activity_events;
drop table if exists messages;
