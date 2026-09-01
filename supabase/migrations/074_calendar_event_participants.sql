-- Customer ↔ Calendar Event participant linking.
-- Calendar events remain in member_app_data JSON; this table stores the
-- canonical coach-owned relationship by stable IDs (event_id text + customer_id).
-- Does not fabricate historical links from notes.

create table if not exists public.calendar_event_participants (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  event_id text not null,
  customer_id uuid not null references public.customers (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_event_participants_unique
    unique (owner_member_id, event_id, customer_id)
);

create index if not exists calendar_event_participants_owner_event_idx
  on public.calendar_event_participants (owner_member_id, event_id);

create index if not exists calendar_event_participants_owner_customer_idx
  on public.calendar_event_participants (owner_member_id, customer_id);

create index if not exists calendar_event_participants_customer_idx
  on public.calendar_event_participants (customer_id);

comment on table public.calendar_event_participants is
  'Join table: personal calendar event (JSON id) ↔ customer. Coach-owned only.';

alter table public.calendar_event_participants enable row level security;

-- Owner-only access. Also require the customer row to belong to the same coach
-- so a participant link cannot leak another partner's customer data.
drop policy if exists "calendar_event_participants_select_own" on public.calendar_event_participants;
create policy "calendar_event_participants_select_own"
  on public.calendar_event_participants for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
    and exists (
      select 1 from public.customers c
      where c.id = customer_id
        and c.owner_member_id = calendar_event_participants.owner_member_id
        and c.deleted_at is null
    )
  );

drop policy if exists "calendar_event_participants_insert_own" on public.calendar_event_participants;
create policy "calendar_event_participants_insert_own"
  on public.calendar_event_participants for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
    and exists (
      select 1 from public.customers c
      where c.id = customer_id
        and c.owner_member_id = calendar_event_participants.owner_member_id
        and c.deleted_at is null
    )
  );

drop policy if exists "calendar_event_participants_update_own" on public.calendar_event_participants;
create policy "calendar_event_participants_update_own"
  on public.calendar_event_participants for update
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
    and exists (
      select 1 from public.customers c
      where c.id = customer_id
        and c.owner_member_id = calendar_event_participants.owner_member_id
        and c.deleted_at is null
    )
  );

drop policy if exists "calendar_event_participants_delete_own" on public.calendar_event_participants;
create policy "calendar_event_participants_delete_own"
  on public.calendar_event_participants for delete
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );
