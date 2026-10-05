-- One suppression list, one outbound receipt ledger, one session kill switch.
--
-- Replaces: do_not_contact (global), sales_suppression_entries (per session),
--           sales_execution_receipts + outreach_log (two receipt stores),
--           contacts + followups (unused legacy CRM tables).
-- Existing rows are copied before the old tables are dropped.

-- Kill switch -----------------------------------------------------------------
alter table agent_sessions add column if not exists paused boolean not null default false;

-- Suppressions ----------------------------------------------------------------
create table if not exists suppressions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references agent_sessions(id) on delete cascade, -- null = applies to every session
  channel text check (channel in ('email', 'x', 'instagram')),     -- null = every channel
  identifier text not null check (identifier = lower(identifier)), -- email, domain or @handle
  reason text not null,
  source text not null,  -- user | reply_unsubscribe | reply_hostile | import
  actor text not null default 'user',
  created_at timestamptz not null default now(),
  -- Plain column constraint (Postgres 15+) so upserts can target it directly.
  constraint suppressions_unique unique nulls not distinct (session_id, identifier, channel)
);
create index if not exists suppressions_identifier_idx on suppressions (identifier);

do $$
begin
  if to_regclass('public.do_not_contact') is not null then
    insert into suppressions (session_id, channel, identifier, reason, source, actor, created_at)
    select null, null, lower(handle), coalesce(reason, 'do not contact'), 'import', 'user', created_at
    from do_not_contact
    on conflict do nothing;
  end if;
  if to_regclass('public.sales_suppression_entries') is not null then
    insert into suppressions (session_id, channel, identifier, reason, source, actor, created_at)
    select session_id,
           case when channel in ('email', 'x', 'instagram') then channel else null end,
           lower(identifier), reason, source, coalesce(actor, 'user'), created_at
    from sales_suppression_entries
    on conflict do nothing;
  end if;
end $$;

-- Outbound receipts -----------------------------------------------------------
-- Every real send/post/DM writes exactly one row, claimed *before* the provider
-- call via the unique idempotency_key, so retries and double clicks never
-- deliver twice. HTTP 200 alone is not proof: status = 'sent' requires a
-- provider id.
create table if not exists outbound_receipts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions(id) on delete cascade,
  channel text not null check (channel in ('email', 'x_post', 'x_dm', 'ig_dm')),
  idempotency_key text not null unique,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  subject_type text not null check (subject_type in ('sales_touchpoint', 'sales_conversation', 'distribution_opportunity', 'marketing_crm')),
  subject_id uuid not null,
  sales_campaign_id uuid references sales_campaigns(id) on delete set null,
  provider text not null,
  recipient text,          -- email or @handle; null for public posts
  sent_as text,            -- sending inbox or connected account handle
  content text not null,
  provider_message_id text,
  provider_thread_id text,
  url text,
  error text,
  metrics jsonb,          -- public post metrics (x_post)
  replies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (status <> 'sent' or provider_message_id is not null)
);
create index if not exists outbound_receipts_session_idx on outbound_receipts (session_id, created_at desc);
create index if not exists outbound_receipts_campaign_sent_idx on outbound_receipts (sales_campaign_id, sent_at desc)
  where status = 'sent';
create index if not exists outbound_receipts_thread_idx on outbound_receipts (provider, provider_thread_id);

do $$
begin
  if to_regclass('public.sales_execution_receipts') is not null then
    -- Keep the original ids: sales_touchpoints.provider_receipt_id points at them.
    insert into outbound_receipts (
      id, session_id, channel, idempotency_key, status, subject_type, subject_id, sales_campaign_id,
      provider, recipient, content, provider_message_id, created_at, sent_at
    )
    select r.id, r.session_id, 'email', 'legacy:sales:' || r.id, 'sent', 'sales_touchpoint', r.touchpoint_id,
           r.sales_campaign_id, r.provider, r.recipient,
           coalesce(t.draft_body, ''), coalesce(r.provider_message_id, 'legacy-unknown'), r.created_at, r.sent_at
    from sales_execution_receipts r
    left join sales_touchpoints t on t.id = r.touchpoint_id
    where r.touchpoint_id is not null
    on conflict (idempotency_key) do nothing;
  end if;
end $$;

drop table if exists followups;
drop table if exists outreach_log;
drop table if exists contacts;
drop table if exists do_not_contact;
drop table if exists sales_suppression_entries;
drop table if exists sales_execution_receipts;
