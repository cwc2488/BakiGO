-- Personal Google Calendar OAuth — owner only (uplines cannot read tokens).

create table if not exists public.member_google_calendar_connections (
  member_id uuid primary key references public.members (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  email text,
  selected_calendar_id text,
  selected_calendar_name text,
  updated_at timestamptz not null default now()
);

alter table public.member_google_calendar_connections enable row level security;

create policy "member_google_calendar_select_own"
  on public.member_google_calendar_connections for select
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "member_google_calendar_insert_own"
  on public.member_google_calendar_connections for insert
  to authenticated
  with check (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "member_google_calendar_update_own"
  on public.member_google_calendar_connections for update
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

create policy "member_google_calendar_delete_own"
  on public.member_google_calendar_connections for delete
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );
