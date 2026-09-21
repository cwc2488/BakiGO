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
