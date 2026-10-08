-- Kami schema. One campaign (`agent_sessions`) owns every other row.
-- Applied automatically on startup when DATABASE_URL is set (web/lib/db/migrate.ts).
-- A database that already has this shape is recorded and left untouched.

create table if not exists kami_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

-- Campaign ---------------------------------------------------------------------

create table agent_sessions (
  id uuid primary key default gen_random_uuid(),
  hermes_session_id text unique,
  domain text not null,
  canonical_domain text,
  goals jsonb not null default '[]',
  stage text,
  status text not null default 'running',
  paused boolean not null default false,
  domain_validated_at timestamptz,
  domain_check jsonb,
  research_snapshot jsonb,
  dossier_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column agent_sessions.canonical_domain is 'Validated registrable host (no www)';
comment on column agent_sessions.domain_check is 'DomainIdentity JSON or invalid reason';
comment on column agent_sessions.research_snapshot is 'Provenance-tagged research used to draft the dossier';
comment on column agent_sessions.dossier_confirmed_at is 'When the founder confirmed the dossier (That''s us)';
comment on column agent_sessions.paused is 'Campaign kill switch. Sends, posts and DMs stop while true';

create table brand_profiles (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references agent_sessions (id) on delete cascade,
  company text,
  brand_voice text,
  positioning text,
  tone jsonb,
  competitor_analysis jsonb,
  raw_dossier jsonb,
  created_at timestamptz not null default now()
);

create table connected_accounts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  platform text not null check (platform in ('x', 'instagram')),
  handle text,
  status text not null default 'pending',
  external_user_id text,
  oauth jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, platform)
);

-- Sales ------------------------------------------------------------------------

create table sales_campaigns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references agent_sessions (id) on delete cascade,
  client_id text,
  offer text not null,
  icp jsonb not null default '{}',
  geo text,
  exclusions text[],
  deal_range jsonb,
  approved_claims text[],
  target_quantity integer default 50,
  sender_identity jsonb,
  daily_send_cap integer not null default 35,
  allowed_channels text[] not null default '{email}',
  autonomous_paused boolean not null default false,
  auto_followups boolean not null default true,
  require_first_send_approval boolean not null default true,
  pipeline_stage text not null default 'researching',
  segments jsonb,
  segments_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column sales_campaigns.segments is 'Confirmed outbound segments (SalesSegment[])';
comment on column sales_campaigns.segments_confirmed_at is 'Discovery is blocked until the founder confirms segments';

create table sales_plans (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  sales_campaign_id uuid references sales_campaigns (id) on delete cascade,
  version integer not null default 1,
  motions jsonb not null default '[]',
  tiers jsonb not null default '[]',
  channel_rationale text,
  risks text[],
  prerequisites text[],
  estimated_activity jsonb,
  approval_scope text[],
  status text not null default 'draft',
  revise_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_campaign_id, version)
);
create index sales_plans_session_idx on sales_plans (session_id, created_at desc);
create index sales_plans_campaign_status_idx on sales_plans (sales_campaign_id, status);

create table sales_accounts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  sales_campaign_id uuid references sales_campaigns (id) on delete cascade,
  client_id text,
  name text not null,
  domain text,
  industry text,
  size text,
  geo text,
  segment_key text,
  pipeline_stage text not null default 'researching',
  tier smallint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sales_accounts_session_domain_idx
  on sales_accounts (session_id, lower(coalesce(domain, name)));
create index sales_accounts_session_stage_idx on sales_accounts (session_id, pipeline_stage);

comment on column sales_accounts.segment_key is 'Which confirmed segment this account was discovered under';

create table sales_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  sales_campaign_id uuid references sales_campaigns (id) on delete set null,
  segment_snapshot jsonb,
  warnings text[],
  accounts_discovered integer not null default 0,
  created_at timestamptz not null default now()
);
create index sales_discovery_runs_session_idx on sales_discovery_runs (session_id, created_at desc);

create table sales_account_signals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  account_id uuid not null references sales_accounts (id) on delete cascade,
  discovery_run_id uuid references sales_discovery_runs (id) on delete set null,
  provider text not null,
  signal_type text not null,
  detail text not null,
  source_url text,
  observed_at timestamptz,
  captured_at timestamptz not null default now(),
  confidence numeric,
  evidence_text text,
  created_at timestamptz not null default now()
);
create index sales_account_signals_account_idx on sales_account_signals (account_id, captured_at desc);

create table sales_contacts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  sales_campaign_id uuid references sales_campaigns (id) on delete set null,
  account_id uuid references sales_accounts (id) on delete set null,
  name text,
  title text,
  email text,
  handle text,
  channel text,
  email_verification text,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sales_contacts_session_email_idx
  on sales_contacts (session_id, lower(email)) where email is not null;
create unique index sales_contacts_session_handle_channel_idx
  on sales_contacts (session_id, lower(handle), channel) where handle is not null and channel is not null;
create index sales_contacts_account_idx on sales_contacts (account_id);

create table sales_buying_group_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  account_id uuid not null references sales_accounts (id) on delete cascade,
  contact_id uuid not null references sales_contacts (id) on delete cascade,
  role text not null,
  evidence_refs text[],
  confidence numeric,
  created_at timestamptz not null default now(),
  unique (account_id, contact_id, role)
);
create index sales_buying_group_account_idx on sales_buying_group_members (account_id);

create table sales_lead_scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  account_id uuid references sales_accounts (id) on delete cascade,
  contact_id uuid references sales_contacts (id) on delete cascade,
  discovery_run_id uuid references sales_discovery_runs (id) on delete set null,
  model_version text not null default 'v1',
  factors jsonb not null default '{}',
  explanation text not null,
  evidence_refs text[],
  recommended_tier smallint,
  recommended_channel text,
  created_at timestamptz not null default now()
);
create index sales_lead_scores_account_idx on sales_lead_scores (account_id, created_at desc);
create index sales_lead_scores_contact_idx on sales_lead_scores (contact_id, created_at desc);

create table sales_sequences (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  sales_campaign_id uuid references sales_campaigns (id) on delete cascade,
  name text not null,
  channel text not null,
  steps jsonb not null default '[]',
  stop_on_reply boolean not null default true,
  stop_on_bounce boolean not null default true,
  stop_on_unsubscribe boolean not null default true,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sales_sequences_session_idx on sales_sequences (session_id, status);

create table sales_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  sequence_id uuid not null references sales_sequences (id) on delete cascade,
  contact_id uuid not null references sales_contacts (id) on delete cascade,
  account_id uuid references sales_accounts (id) on delete set null,
  status text not null default 'draft',
  current_step integer not null default 0,
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sales_sequence_enrollments_session_idx on sales_sequence_enrollments (session_id, status);

create table sales_touchpoints (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  enrollment_id uuid not null references sales_sequence_enrollments (id) on delete cascade,
  channel text not null,
  step integer not null,
  status text not null default 'drafted',
  draft_id text,
  draft_subject text,
  draft_body text,
  draft_cta text,
  draft_metadata jsonb,
  reviewer_verdict jsonb,
  approved_at timestamptz,
  provider_receipt_id uuid,
  sent_at timestamptz,
  immutable boolean not null default true,
  created_at timestamptz not null default now()
);
create index sales_touchpoints_enrollment_idx on sales_touchpoints (enrollment_id, step);

create table sales_conversations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  account_id uuid references sales_accounts (id) on delete set null,
  contact_id uuid references sales_contacts (id) on delete set null,
  channel text not null,
  status text not null default 'open',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sales_conversations_session_idx on sales_conversations (session_id, updated_at desc);

create table sales_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references sales_conversations (id) on delete cascade,
  direction text not null,
  content text not null,
  provider_message_id text,
  classification_id uuid,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index sales_conversation_messages_conv_idx
  on sales_conversation_messages (conversation_id, sent_at);

create table sales_reply_classifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  message_id uuid not null references sales_conversation_messages (id) on delete cascade,
  label text not null,
  confidence numeric,
  escalation_required boolean not null default false,
  draft_response text,
  created_at timestamptz not null default now()
);
create index sales_reply_classifications_message_idx on sales_reply_classifications (message_id);

create table sales_meetings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  account_id uuid references sales_accounts (id) on delete set null,
  contact_id uuid references sales_contacts (id) on delete set null,
  conversation_id uuid references sales_conversations (id) on delete set null,
  title text,
  status text not null default 'proposed',
  proposed_at timestamptz,
  scheduled_at timestamptz,
  ends_at timestamptz,
  time_zone text,
  attendee_email text,
  meeting_link text,
  calendar_event_id text,
  provider_receipt jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'scheduled' or calendar_event_id is not null)
);
create index sales_meetings_session_status_idx on sales_meetings (session_id, status);

create table sales_tasks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  account_id uuid references sales_accounts (id) on delete set null,
  contact_id uuid references sales_contacts (id) on delete set null,
  conversation_id uuid references sales_conversations (id) on delete set null,
  title text not null,
  description text,
  status text not null default 'open',
  priority text not null default 'medium',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sales_tasks_session_status_idx on sales_tasks (session_id, status, due_at);

create table sales_notifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index sales_notifications_session_idx on sales_notifications (session_id, read, created_at desc);

create table sales_approvals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  sales_campaign_id uuid references sales_campaigns (id) on delete cascade,
  scope text not null,
  entity_type text not null,
  entity_id uuid not null,
  status text not null default 'pending',
  requested_by text,
  decided_by text,
  decided_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index sales_approvals_campaign_scope_idx on sales_approvals (sales_campaign_id, scope, status);

create table sales_audit_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index sales_audit_events_session_idx on sales_audit_events (session_id, created_at desc);

-- Marketing and distribution ---------------------------------------------------

create table marketing_config (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references agent_sessions (id) on delete cascade,
  platforms text[] not null default '{}',
  x_boost_budget numeric,
  x_outreach_goal text,
  ig_offer_min numeric,
  ig_offer_max numeric,
  ig_niche_keywords text[],
  ig_min_followers integer default 5000,
  tone text[],
  autonomous_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table marketing_crm (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references agent_sessions (id) on delete cascade,
  type text not null,
  platform text not null,
  handle text not null,
  name text,
  followers integer,
  engagement_rate numeric,
  niche_match_score numeric,
  relevance_reasoning text,
  offer_amount numeric,
  status text not null default 'identified',
  calendar_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, platform, handle)
);
create index marketing_crm_session_idx on marketing_crm (session_id, created_at desc);
create index marketing_crm_type_status_idx on marketing_crm (type, status);

create table marketing_conversations (
  id uuid primary key default gen_random_uuid(),
  crm_entry_id uuid not null references marketing_crm (id) on delete cascade,
  platform text not null,
  goal text not null,
  persona_config jsonb,
  budget_min numeric,
  budget_max numeric,
  status text not null default 'idle',
  escalation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index marketing_conversations_crm_idx on marketing_conversations (crm_entry_id);
create index marketing_conversations_status_idx on marketing_conversations (status, updated_at desc);

create table marketing_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references marketing_conversations (id) on delete cascade,
  sender text not null,
  content text not null,
  platform_message_id text,
  status text not null default 'sent',
  sent_at timestamptz not null default now()
);
create index marketing_conversation_messages_conv_idx
  on marketing_conversation_messages (conversation_id, sent_at);

create table boost_campaigns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  post_id text not null,
  post_text text not null,
  budget numeric not null default 50 check (budget > 0),
  currency text,
  duration_days integer,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'failed', 'completed')),
  provider text,
  ads_account_id text,
  funding_instrument_id text,
  x_campaign_id text,
  x_line_item_id text,
  x_promoted_tweet_id text,
  starts_at timestamptz,
  ends_at timestamptz,
  impressions integer,
  clicks integer,
  spend numeric,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status not in ('active', 'completed')
    or (x_campaign_id is not null and x_line_item_id is not null)
  )
);
create index boost_campaigns_session_idx on boost_campaigns (session_id, created_at desc);
create unique index boost_campaigns_one_live_per_post_idx
  on boost_campaigns (session_id, post_id)
  where status in ('pending', 'active');

create table distribution_campaigns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references agent_sessions (id) on delete cascade,
  goal text not null,
  goal_label text,
  angle text,
  rationale text,
  why_these_surfaces text,
  surfaces jsonb default '[]',
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'superseded')),
  revise_note text,
  source text,
  hermes_session_id text,
  autonomous_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column distribution_campaigns.goal is 'Distribution job the founder confirmed';
comment on column distribution_campaigns.goal_label is 'Plain-English job shown in the UI';
comment on column distribution_campaigns.status is 'proposed until the founder confirms; approved unlocks research';

create table distribution_opportunities (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  campaign_id uuid references distribution_campaigns (id) on delete set null,
  platform text not null check (
    platform in ('x', 'reddit', 'hackernews', 'linkedin', 'producthunt', 'discord')
  ),
  source_url text not null,
  evidence text,
  why_now text not null,
  suggested_action text not null,
  draft text not null,
  risks text,
  format_used text,
  format_why text,
  approval_status text not null default 'needs_review'
    check (approval_status in ('needs_review', 'approved', 'skipped')),
  action_status text not null default 'draft'
    check (action_status in ('draft', 'ready', 'posted_manual', 'published', 'failed')),
  outcome text not null default 'none'
    check (outcome in ('none', 'posted', 'got_reply', 'got_interest', 'got_signup', 'not_relevant', 'skipped')),
  published_url text,
  agent_skill text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index distribution_opportunities_session_idx
  on distribution_opportunities (session_id, created_at desc);
create index distribution_opportunities_status_idx
  on distribution_opportunities (session_id, approval_status, action_status);

comment on column distribution_opportunities.format_used is 'Platform format chosen for this draft';
comment on column distribution_opportunities.format_why is 'Why that format fits this source';

-- Outbound ---------------------------------------------------------------------
-- One suppression list. session_id null applies to every campaign.
-- channel null applies to every channel.

create table suppressions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references agent_sessions (id) on delete cascade,
  channel text check (channel in ('email', 'x', 'instagram')),
  identifier text not null check (identifier = lower(identifier)),
  reason text not null,
  source text not null,
  actor text not null default 'user',
  created_at timestamptz not null default now(),
  constraint suppressions_unique unique nulls not distinct (session_id, identifier, channel)
);
create index suppressions_identifier_idx on suppressions (identifier);

-- Claimed before the provider call. status = sent requires the provider's id.
create table outbound_receipts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions (id) on delete cascade,
  channel text not null check (channel in ('email', 'x_post', 'x_dm', 'ig_dm')),
  idempotency_key text not null unique,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  subject_type text not null check (
    subject_type in ('sales_touchpoint', 'sales_conversation', 'distribution_opportunity', 'marketing_crm')
  ),
  subject_id uuid not null,
  sales_campaign_id uuid references sales_campaigns (id) on delete set null,
  provider text not null,
  recipient text,
  sent_as text,
  content text not null,
  provider_message_id text,
  provider_thread_id text,
  url text,
  error text,
  metrics jsonb,
  replies jsonb not null default '[]',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (status <> 'sent' or provider_message_id is not null)
);
create index outbound_receipts_session_idx on outbound_receipts (session_id, created_at desc);
create index outbound_receipts_campaign_sent_idx on outbound_receipts (sales_campaign_id, sent_at desc)
  where status = 'sent';
create index outbound_receipts_thread_idx on outbound_receipts (provider, provider_thread_id);

-- Agent runs -------------------------------------------------------------------

create table agent_run_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references agent_sessions (id) on delete set null,
  hermes_session_id text,
  source text not null,
  kind text not null,
  agent text,
  status text not null default 'ok',
  model text,
  input_preview text,
  output_text text,
  output_json jsonb,
  error text,
  duration_ms integer,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index agent_run_logs_session_idx on agent_run_logs (session_id, created_at desc);
create index agent_run_logs_kind_idx on agent_run_logs (kind, created_at desc);
create index agent_run_logs_created_idx on agent_run_logs (created_at desc);

comment on table agent_run_logs is 'Agent and pipeline outputs shown in Activity';

-- kami:lockdown
-- No policies: the anon and authenticated API roles can read nothing.
-- The Next.js server connects as service_role, which bypasses row-level security.
-- Roles are created by Supabase; a plain Postgres skips the grants.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    grant all on all routines in schema public to service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    alter default privileges in schema public grant all on routines to service_role;
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
    revoke all on all routines in schema public from anon;
    alter default privileges in schema public revoke all on tables from anon;
    alter default privileges in schema public revoke all on sequences from anon;
    alter default privileges in schema public revoke all on routines from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
    revoke all on all sequences in schema public from authenticated;
    revoke all on all routines in schema public from authenticated;
    alter default privileges in schema public revoke all on tables from authenticated;
    alter default privileges in schema public revoke all on sequences from authenticated;
    alter default privileges in schema public revoke all on routines from authenticated;
  end if;
end $$;
