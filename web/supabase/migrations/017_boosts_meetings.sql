-- Paid X boosts and calendar-backed meetings carry provider proof.
--
-- boost_campaigns: status lifecycle pending → active | failed. A row is claimed
-- (pending) before any X Ads call; at most one pending/active boost per post per
-- campaign, so a double click can never create two paid campaigns.
--
-- sales_meetings: `scheduled` requires a calendar event id (the provider receipt).

-- --- boost_campaigns -----------------------------------------------------------

alter table boost_campaigns
  add column if not exists currency text,
  add column if not exists duration_days integer,
  add column if not exists provider text,
  add column if not exists ads_account_id text,
  add column if not exists funding_instrument_id text,
  add column if not exists x_campaign_id text,
  add column if not exists x_line_item_id text,
  add column if not exists x_promoted_tweet_id text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists error text;

-- Rows from the old stub never reached X: mark them failed instead of "queued".
update boost_campaigns
   set status = 'failed',
       error = coalesce(error, 'created before the X Ads integration — never sent to X'),
       updated_at = now()
 where x_campaign_id is null;
-- Boosts without a campaign cannot be listed per session; drop the orphans.
delete from boost_campaigns where session_id is null;

alter table boost_campaigns alter column session_id set not null;

alter table boost_campaigns drop constraint if exists boost_campaigns_status_check;
alter table boost_campaigns
  add constraint boost_campaigns_status_check
  check (status in ('pending', 'active', 'failed', 'completed'));

alter table boost_campaigns drop constraint if exists boost_campaigns_active_has_receipt;
alter table boost_campaigns
  add constraint boost_campaigns_active_has_receipt
  check (status not in ('active', 'completed')
         or (x_campaign_id is not null and x_line_item_id is not null));

alter table boost_campaigns drop constraint if exists boost_campaigns_budget_positive;
alter table boost_campaigns
  add constraint boost_campaigns_budget_positive check (budget > 0);

create unique index if not exists boost_campaigns_one_live_per_post_idx
  on boost_campaigns(session_id, post_id)
  where status in ('pending', 'active');

alter table boost_campaigns enable row level security;

-- --- sales_meetings ------------------------------------------------------------

alter table sales_meetings
  add column if not exists attendee_email text,
  add column if not exists ends_at timestamptz,
  add column if not exists time_zone text,
  add column if not exists meeting_link text,
  add column if not exists last_error text;

alter table sales_meetings drop constraint if exists sales_meetings_scheduled_has_receipt;
alter table sales_meetings
  add constraint sales_meetings_scheduled_has_receipt
  check (status <> 'scheduled' or calendar_event_id is not null);

alter table sales_meetings enable row level security;
