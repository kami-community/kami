-- Connected social accounts belong to exactly one campaign session.
--
-- Accounts are now connected after the dossier is confirmed (domain-first), so the
-- pre-session "browser claim" mechanism is gone. Tokens in `oauth` are stored
-- encrypted by the app (AES-256-GCM, KAMI_TOKEN_ENCRYPTION_KEY).

delete from connected_accounts where session_id is null or status <> 'connected';

drop index if exists connected_accounts_claim_idx;
drop index if exists connected_accounts_session_platform_uidx;
alter table connected_accounts drop column if exists claim_id;

alter table connected_accounts drop constraint if exists connected_accounts_session_id_fkey;
alter table connected_accounts
  alter column session_id set not null,
  add constraint connected_accounts_session_id_fkey
    foreign key (session_id) references agent_sessions(id) on delete cascade;

alter table connected_accounts add column if not exists external_user_id text;
alter table connected_accounts add column if not exists updated_at timestamptz not null default now();

alter table connected_accounts drop constraint if exists connected_accounts_platform_check;
alter table connected_accounts add constraint connected_accounts_platform_check
  check (platform in ('x', 'instagram'));

alter table connected_accounts drop constraint if exists connected_accounts_session_platform_key;
alter table connected_accounts add constraint connected_accounts_session_platform_key
  unique (session_id, platform);

alter table connected_accounts enable row level security;
