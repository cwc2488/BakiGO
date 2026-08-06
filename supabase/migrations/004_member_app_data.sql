-- Cross-device app data sync (activity, pipeline, calendar, workspace, etc.)

create table if not exists public.member_app_data (
  member_id uuid not null references public.members (id) on delete cascade,
  data_key text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (member_id, data_key)
);

create index if not exists member_app_data_member_id_idx
  on public.member_app_data (member_id);

create index if not exists member_app_data_updated_at_idx
  on public.member_app_data (updated_at desc);

alter table public.member_app_data enable row level security;

create policy "member_app_data_select_own"
  on public.member_app_data for select
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "member_app_data_insert_own"
  on public.member_app_data for insert
  to authenticated
  with check (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "member_app_data_update_own"
  on public.member_app_data for update
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

create policy "member_app_data_delete_own"
  on public.member_app_data for delete
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );
