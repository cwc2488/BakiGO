-- 082 memos v1
-- Additive personal memos with reminder scheduling for Web Push.
-- Production-safe: create-if-not-exists only; no destructive alters.

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  title text not null,
  content text,
  completed boolean not null default false,
  reminder_type text not null default 'NONE',
  reminder_time text,
  reminder_weekday integer,
  reminder_date date,
  next_reminder_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memos_title_nonempty check (char_length(trim(title)) > 0),
  constraint memos_reminder_type_check
    check (reminder_type in ('NONE', 'DAILY', 'WEEKLY', 'SPECIFIC_DATE')),
  constraint memos_reminder_weekday_check
    check (reminder_weekday is null or (reminder_weekday >= 1 and reminder_weekday <= 7)),
  constraint memos_reminder_time_check
    check (reminder_time is null or reminder_time ~ '^\d{2}:\d{2}$')
);

create index if not exists memos_member_incomplete_idx
  on public.memos (member_id, updated_at desc)
  where completed = false;

create index if not exists memos_member_updated_idx
  on public.memos (member_id, updated_at desc);

create index if not exists memos_due_reminder_idx
  on public.memos (next_reminder_at)
  where completed = false and next_reminder_at is not null;

comment on table public.memos is
  'Personal memos with optional daily/weekly/specific-date reminders (Asia/Taipei wall clock → UTC).';

alter table public.memos enable row level security;

drop policy if exists "memos_select_own" on public.memos;
create policy "memos_select_own"
  on public.memos for select
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "memos_insert_own" on public.memos;
create policy "memos_insert_own"
  on public.memos for insert
  to authenticated
  with check (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "memos_update_own" on public.memos;
create policy "memos_update_own"
  on public.memos for update
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

drop policy if exists "memos_delete_own" on public.memos;
create policy "memos_delete_own"
  on public.memos for delete
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

grant select, insert, update, delete on public.memos to authenticated;
grant all on public.memos to service_role;
