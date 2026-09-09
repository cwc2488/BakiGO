-- WEB-PUSH-01 + LEAD-TRACKING-01
-- Additive Web Push subscriptions, notification delivery dedupe, and personal lead tracking.
-- Production-safe: create-if-not-exists only; no destructive alters to existing tables.

-- ---------------------------------------------------------------------------
-- push_subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0,
  is_active boolean not null default true,
  constraint push_subscriptions_endpoint_unique unique (endpoint),
  constraint push_subscriptions_failure_count_nonneg check (failure_count >= 0)
);

create index if not exists push_subscriptions_member_active_idx
  on public.push_subscriptions (member_id, is_active)
  where is_active = true;

create index if not exists push_subscriptions_member_idx
  on public.push_subscriptions (member_id);

comment on table public.push_subscriptions is
  'Web Push subscriptions per device. Owner-only RLS; workers may use service_role.';

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  to authenticated
  with check (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- notification_deliveries (idempotent push send records)
-- ---------------------------------------------------------------------------
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  channel text not null default 'web_push',
  source_type text not null,
  source_key text not null,
  scheduled_at timestamptz not null,
  title text not null,
  body text not null,
  target_url text,
  status text not null default 'delivered',
  created_at timestamptz not null default now(),
  constraint notification_deliveries_status_check
    check (status in ('delivered', 'failed', 'skipped')),
  constraint notification_deliveries_dedupe_unique
    unique (member_id, channel, source_type, source_key, scheduled_at)
);

create index if not exists notification_deliveries_member_scheduled_idx
  on public.notification_deliveries (member_id, scheduled_at desc);

create index if not exists notification_deliveries_source_idx
  on public.notification_deliveries (source_type, source_key);

comment on table public.notification_deliveries is
  'Dedupe + audit for server-side Web Push deliveries (calendar, lead tracking, test).';

alter table public.notification_deliveries enable row level security;

-- Members may read their own delivery history; writes are service-role / server only.
drop policy if exists "notification_deliveries_select_own" on public.notification_deliveries;
create policy "notification_deliveries_select_own"
  on public.notification_deliveries for select
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

revoke insert, update, delete on public.notification_deliveries from anon, authenticated;
grant select on public.notification_deliveries to authenticated;
grant all on public.notification_deliveries to service_role;

-- ---------------------------------------------------------------------------
-- lead_tracking (個人名單追蹤 — not CRM)
-- ---------------------------------------------------------------------------
create table if not exists public.lead_tracking (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  name text not null,
  phone text,
  contact_channel text,
  notes text,
  current_status text,
  next_follow_up_at timestamptz,
  reminder_enabled boolean not null default false,
  last_followed_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_tracking_name_not_blank check (length(trim(name)) > 0)
);

create index if not exists lead_tracking_owner_follow_up_idx
  on public.lead_tracking (owner_member_id, next_follow_up_at);

create index if not exists lead_tracking_owner_updated_idx
  on public.lead_tracking (owner_member_id, updated_at desc);

create index if not exists lead_tracking_reminder_due_idx
  on public.lead_tracking (next_follow_up_at)
  where reminder_enabled = true and next_follow_up_at is not null;

comment on table public.lead_tracking is
  'Personal free-form lead tracking list. Owner-only; not shared with upline/downline.';

alter table public.lead_tracking enable row level security;

drop policy if exists "lead_tracking_select_own" on public.lead_tracking;
create policy "lead_tracking_select_own"
  on public.lead_tracking for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "lead_tracking_insert_own" on public.lead_tracking;
create policy "lead_tracking_insert_own"
  on public.lead_tracking for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "lead_tracking_update_own" on public.lead_tracking;
create policy "lead_tracking_update_own"
  on public.lead_tracking for update
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "lead_tracking_delete_own" on public.lead_tracking;
create policy "lead_tracking_delete_own"
  on public.lead_tracking for delete
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

grant select, insert, update, delete on public.lead_tracking to authenticated;
grant all on public.lead_tracking to service_role;

-- ---------------------------------------------------------------------------
-- lead_tracking_history (status-change history only)
-- ---------------------------------------------------------------------------
create table if not exists public.lead_tracking_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.lead_tracking (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  status_text text not null,
  created_at timestamptz not null default now(),
  constraint lead_tracking_history_status_not_blank check (length(trim(status_text)) > 0)
);

create index if not exists lead_tracking_history_lead_created_idx
  on public.lead_tracking_history (lead_id, created_at desc);

create index if not exists lead_tracking_history_owner_idx
  on public.lead_tracking_history (owner_member_id);

comment on table public.lead_tracking_history is
  'Append-only history when lead_tracking.current_status meaningfully changes.';

alter table public.lead_tracking_history enable row level security;

drop policy if exists "lead_tracking_history_select_own" on public.lead_tracking_history;
create policy "lead_tracking_history_select_own"
  on public.lead_tracking_history for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "lead_tracking_history_insert_own" on public.lead_tracking_history;
create policy "lead_tracking_history_insert_own"
  on public.lead_tracking_history for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
    and exists (
      select 1 from public.lead_tracking lt
      where lt.id = lead_id
        and lt.owner_member_id = lead_tracking_history.owner_member_id
    )
  );

-- No update/delete policies for authenticated — history is append-only for members.
revoke update, delete on public.lead_tracking_history from anon, authenticated;
grant select, insert on public.lead_tracking_history to authenticated;
grant all on public.lead_tracking_history to service_role;
