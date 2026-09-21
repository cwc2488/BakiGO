-- 5＋5 行動系統 V1
-- Pure numeric daily reports: fish pool + invitation five-steps.
-- DO NOT apply to Production from agent — Preview PR only.
--
-- Privilege model:
--   anon          → no access
--   authenticated → SELECT only (own + descendants via RLS)
--   service_role  → full mutation (server API /api/5plus5/*)

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
  '5＋5 行動每日純數字回報（魚池 + 邀約5步驟）。V1 不記姓名／名單／步驟進度。Mutations via service_role only.';

alter table public.five_plus_five_reports enable row level security;

-- Own SELECT
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

-- Ancestor / upline SELECT all descendants (same hierarchy as org tree + sponsor)
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

-- Drop any legacy mutation policies (mutations are service_role only)
drop policy if exists "five_plus_five_reports_insert_own" on public.five_plus_five_reports;
drop policy if exists "five_plus_five_reports_update_own" on public.five_plus_five_reports;
drop policy if exists "five_plus_five_reports_delete_own" on public.five_plus_five_reports;

-- Privilege matrix: authenticated = SELECT only; anon = nothing; service_role = all
revoke all on table public.five_plus_five_reports from anon;
revoke all on table public.five_plus_five_reports from authenticated;
revoke all on table public.five_plus_five_reports from public;
grant select on table public.five_plus_five_reports to authenticated;
grant all on table public.five_plus_five_reports to service_role;

-- ---------------------------------------------------------------------------
-- Aggregate stats RPC (service_role only — avoids pulling full history into Node)
-- ---------------------------------------------------------------------------
create or replace function public.get_five_plus_five_member_stats(
  p_member_id uuid,
  p_today date,
  p_week_start date,
  p_week_end date,
  p_month_start date,
  p_treat_today_as_open boolean,
  p_recent_days integer default 30,
  p_streak_lookback_days integer default 400
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today jsonb;
  v_week jsonb;
  v_month jsonb;
  v_history jsonb;
  v_recent jsonb;
  v_streak integer := 0;
  v_cursor date;
  v_has_today boolean := false;
  v_today_on_time boolean := false;
  v_row_on_time boolean;
  v_recent_start date;
  v_streak_floor date;
begin
  if p_member_id is null or p_today is null then
    raise exception 'member_id and today required';
  end if;

  v_recent_start := p_today - greatest(1, least(coalesce(p_recent_days, 30), 60)) + 1;
  v_streak_floor := p_today - greatest(1, least(coalesce(p_streak_lookback_days, 400), 800));

  select to_jsonb(t)
  into v_today
  from public.five_plus_five_reports t
  where t.member_id = p_member_id
    and t.report_date = p_today;

  v_has_today := v_today is not null;
  if v_has_today then
    v_today_on_time := coalesce((v_today ->> 'submitted_on_time')::boolean, false);
  end if;

  select jsonb_build_object(
    'fish_pool', coalesce(sum(fish_pool_count), 0),
    'invitation_five_steps', coalesce(sum(invitation_five_steps_count), 0)
  )
  into v_week
  from public.five_plus_five_reports
  where member_id = p_member_id
    and report_date >= p_week_start
    and report_date <= p_week_end;

  select jsonb_build_object(
    'fish_pool', coalesce(sum(fish_pool_count), 0),
    'invitation_five_steps', coalesce(sum(invitation_five_steps_count), 0),
    'on_time_days', coalesce(sum(case when submitted_on_time then 1 else 0 end), 0)
  )
  into v_month
  from public.five_plus_five_reports
  where member_id = p_member_id
    and report_date >= p_month_start
    and report_date <= p_today;

  select jsonb_build_object(
    'fish_pool', coalesce(sum(fish_pool_count), 0),
    'invitation_five_steps', coalesce(sum(invitation_five_steps_count), 0)
  )
  into v_history
  from public.five_plus_five_reports
  where member_id = p_member_id;

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.report_date desc),
    '[]'::jsonb
  )
  into v_recent
  from public.five_plus_five_reports r
  where r.member_id = p_member_id
    and r.report_date >= v_recent_start
    and r.report_date <= p_today;

  -- Streak: continuous on-time calendar days (bounded lookback; no full history)
  if v_today_on_time then
    v_cursor := p_today;
  elsif p_treat_today_as_open and not v_has_today then
    v_cursor := p_today - 1;
  elsif not v_has_today then
    v_cursor := null; -- closed without report → streak 0
  else
    v_cursor := null; -- reported but not on-time → streak 0
  end if;

  while v_cursor is not null and v_cursor >= v_streak_floor loop
    select submitted_on_time
    into v_row_on_time
    from public.five_plus_five_reports
    where member_id = p_member_id
      and report_date = v_cursor;

    if not found or coalesce(v_row_on_time, false) = false then
      exit;
    end if;

    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  end loop;

  return jsonb_build_object(
    'today', v_today,
    'week', v_week,
    'month', v_month,
    'history', v_history,
    'recent', v_recent,
    'streak_on_time_days', v_streak
  );
end;
$$;

comment on function public.get_five_plus_five_member_stats(
  uuid, date, date, date, date, boolean, integer, integer
) is
  '5＋5 member stats aggregates (today/week/month/history/streak/recent). No full-history row dump.';

revoke all on function public.get_five_plus_five_member_stats(
  uuid, date, date, date, date, boolean, integer, integer
) from public;
revoke all on function public.get_five_plus_five_member_stats(
  uuid, date, date, date, date, boolean, integer, integer
) from anon;
revoke all on function public.get_five_plus_five_member_stats(
  uuid, date, date, date, date, boolean, integer, integer
) from authenticated;
grant execute on function public.get_five_plus_five_member_stats(
  uuid, date, date, date, date, boolean, integer, integer
) to service_role;
