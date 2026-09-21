-- 5＋5 行動系統 V1
-- Pure numeric daily reports: fish pool + invitation five-steps.
-- DO NOT apply to Production from agent — Preview PR only.

-- ---------------------------------------------------------------------------
-- five_plus_five_reports
-- ---------------------------------------------------------------------------
create table if not exists public.five_plus_five_reports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  report_date date not null,
  fish_pool_count integer not null default 0,
  invitation_five_steps_count integer not null default 0,
  first_submitted_at timestamptz not null,
  updated_at timestamptz not null default now(),
  submitted_on_time boolean not null,
  created_at timestamptz not null default now(),
  constraint five_plus_five_reports_member_date_unique unique (member_id, report_date),
  constraint five_plus_five_reports_fish_nonneg check (fish_pool_count >= 0),
  constraint five_plus_five_reports_invite_nonneg check (invitation_five_steps_count >= 0)
);

create index if not exists five_plus_five_reports_member_date_idx
  on public.five_plus_five_reports (member_id, report_date desc);

create index if not exists five_plus_five_reports_date_idx
  on public.five_plus_five_reports (report_date);

create index if not exists five_plus_five_reports_member_on_time_idx
  on public.five_plus_five_reports (member_id, submitted_on_time, report_date desc);

comment on table public.five_plus_five_reports is
  '5＋5 行動每日純數字回報（魚池 + 邀約5步驟）。V1 不記姓名／名單／步驟進度。';

alter table public.five_plus_five_reports enable row level security;

-- Own full read
drop policy if exists "five_plus_five_reports_select_own" on public.five_plus_five_reports;
create policy "five_plus_five_reports_select_own"
  on public.five_plus_five_reports for select
  to authenticated
  using (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- Ancestor / upline can SELECT all descendants (same hierarchy as org tree + sponsor)
drop policy if exists "five_plus_five_reports_select_downline" on public.five_plus_five_reports;
create policy "five_plus_five_reports_select_downline"
  on public.five_plus_five_reports for select
  to authenticated
  using (
    member_id in (
      with recursive downline(id, member_number) as (
        select m.id, m.member_number
        from public.members m
        where lower(m.email) = lower(auth.jwt() ->> 'email')

        union

        select child.id, child.member_number
        from downline parent
        join lateral (
          select rel.child_member_number
          from public.organization_relationships rel
          where rel.parent_member_number = parent.member_number

          union

          select sponsored.member_number
          from public.members sponsored
          where sponsored.sponsor_member_number = parent.member_number
        ) edge on true
        join public.members child
          on child.member_number = edge.child_member_number
      )
      select id from downline
      where id <> (
        select m.id from public.members m
        where lower(m.email) = lower(auth.jwt() ->> 'email')
        limit 1
      )
    )
  );

-- Own insert only
drop policy if exists "five_plus_five_reports_insert_own" on public.five_plus_five_reports;
create policy "five_plus_five_reports_insert_own"
  on public.five_plus_five_reports for insert
  to authenticated
  with check (
    member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- Own update only (upline cannot modify downline reports)
drop policy if exists "five_plus_five_reports_update_own" on public.five_plus_five_reports;
create policy "five_plus_five_reports_update_own"
  on public.five_plus_five_reports for update
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

grant select, insert, update on public.five_plus_five_reports to authenticated;
grant all on public.five_plus_five_reports to service_role;
revoke delete on public.five_plus_five_reports from authenticated;
