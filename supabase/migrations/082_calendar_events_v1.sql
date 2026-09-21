-- Personal calendar events: 1 row per event (cloud source of truth).
-- Replaces last-write-wins member_app_data blob for baki-go:calendar-events.
-- Soft-delete via deleted_at. Payload holds full CalendarEvent JSON fields.

create table if not exists public.calendar_events (
  id text not null,
  member_id uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  start_at text not null,
  end_at text not null,
  is_recurring boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  deleted_at timestamptz null,
  primary key (member_id, id)
);

create index if not exists calendar_events_member_start_idx
  on public.calendar_events (member_id, start_at)
  where deleted_at is null;

create index if not exists calendar_events_member_updated_idx
  on public.calendar_events (member_id, updated_at desc);

create index if not exists calendar_events_member_recurring_idx
  on public.calendar_events (member_id, start_at)
  where deleted_at is null and is_recurring = true;

create index if not exists calendar_events_member_active_idx
  on public.calendar_events (member_id)
  where deleted_at is null;

comment on table public.calendar_events is
  'Normalized personal calendar events. One row per event; payload is CalendarEvent JSON.';

comment on column public.calendar_events.deleted_at is
  'Soft-delete timestamp. NULL = active. Soft-deleted rows are tombstones for sync.';

comment on column public.calendar_events.is_recurring is
  'True when recurrence.frequency is not none — included in range queries even if start_at is old.';

alter table public.calendar_events enable row level security;

drop policy if exists "calendar_events_select_own" on public.calendar_events;
create policy "calendar_events_select_own"
  on public.calendar_events for select
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "calendar_events_insert_own" on public.calendar_events;
create policy "calendar_events_insert_own"
  on public.calendar_events for insert
  to authenticated
  with check (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "calendar_events_update_own" on public.calendar_events;
create policy "calendar_events_update_own"
  on public.calendar_events for update
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

drop policy if exists "calendar_events_delete_own" on public.calendar_events;
create policy "calendar_events_delete_own"
  on public.calendar_events for delete
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- Soft-delete authority: once deleted_at is set, client upserts must not clear it.
create or replace function public.calendar_events_preserve_deleted_at()
returns trigger
language plpgsql
as $$
begin
  if old.deleted_at is not null then
    new.deleted_at := old.deleted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists calendar_events_preserve_deleted_at on public.calendar_events;
create trigger calendar_events_preserve_deleted_at
  before update on public.calendar_events
  for each row
  execute function public.calendar_events_preserve_deleted_at();

-- Realtime: event-level INSERT/UPDATE/DELETE for cross-device sync.
do $$
begin
  begin
    alter publication supabase_realtime add table public.calendar_events;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Idempotent server-side backfill from legacy member_app_data calendar blob.
-- DO NOT delete the blob — keep as rollback source.
-- Authoritative owner is member_app_data.member_id (never payload.memberId).
-- ---------------------------------------------------------------------------
with source_events as (
  select
    mad.member_id as owner_member_id,
    elem as event
  from public.member_app_data mad
  cross join lateral jsonb_array_elements(mad.payload) as elem
  where mad.data_key = 'baki-go:calendar-events'
    and jsonb_typeof(mad.payload) = 'array'
    and coalesce(elem->>'id', '') <> ''
    and coalesce(elem->>'startAt', '') <> ''
    and coalesce(elem->>'endAt', '') <> ''
),
normalized as (
  select
    event->>'id' as id,
    owner_member_id as member_id,
    case
      when coalesce(event->>'createdAt', '') ~ '^\d{4}-\d{2}-\d{2}'
        then (event->>'createdAt')::timestamptz
      else now()
    end as created_at,
    case
      when coalesce(event->>'updatedAt', '') ~ '^\d{4}-\d{2}-\d{2}'
        then (event->>'updatedAt')::timestamptz
      else now()
    end as updated_at,
    event->>'startAt' as start_at,
    event->>'endAt' as end_at,
    (
      coalesce(event #>> '{recurrence,frequency}', 'none') <> 'none'
    ) as is_recurring,
    -- Normalize payload.memberId to authoritative member_app_data.member_id
    (event || jsonb_build_object('memberId', owner_member_id::text)) as payload
  from source_events
)
insert into public.calendar_events (
  id,
  member_id,
  created_at,
  updated_at,
  start_at,
  end_at,
  is_recurring,
  payload,
  deleted_at
)
select
  id,
  member_id,
  created_at,
  updated_at,
  start_at,
  end_at,
  is_recurring,
  payload,
  null
from normalized
on conflict (member_id, id) do update
set
  created_at = least(public.calendar_events.created_at, excluded.created_at),
  updated_at = greatest(public.calendar_events.updated_at, excluded.updated_at),
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  is_recurring = excluded.is_recurring,
  payload = excluded.payload
where public.calendar_events.deleted_at is null
  and (
    public.calendar_events.updated_at < excluded.updated_at
    or public.calendar_events.payload is distinct from excluded.payload
    or public.calendar_events.start_at is distinct from excluded.start_at
    or public.calendar_events.end_at is distinct from excluded.end_at
    or public.calendar_events.is_recurring is distinct from excluded.is_recurring
  );

-- Verify source event count == migrated (member_id, id) row count.
do $$
declare
  source_count bigint;
  migrated_count bigint;
begin
  select count(*) into source_count
  from public.member_app_data mad
  cross join lateral jsonb_array_elements(mad.payload) as elem
  where mad.data_key = 'baki-go:calendar-events'
    and jsonb_typeof(mad.payload) = 'array'
    and coalesce(elem->>'id', '') <> ''
    and coalesce(elem->>'startAt', '') <> ''
    and coalesce(elem->>'endAt', '') <> '';

  select count(*) into migrated_count
  from public.calendar_events ce
  where exists (
    select 1
    from public.member_app_data mad
    cross join lateral jsonb_array_elements(mad.payload) as elem
    where mad.data_key = 'baki-go:calendar-events'
      and jsonb_typeof(mad.payload) = 'array'
      and mad.member_id = ce.member_id
      and elem->>'id' = ce.id
      and coalesce(elem->>'startAt', '') <> ''
      and coalesce(elem->>'endAt', '') <> ''
  );

  raise notice 'calendar_events backfill: source=% migrated=%', source_count, migrated_count;

  if source_count <> migrated_count then
    raise exception
      'calendar_events backfill count mismatch: source=% migrated=%',
      source_count,
      migrated_count;
  end if;
end $$;
