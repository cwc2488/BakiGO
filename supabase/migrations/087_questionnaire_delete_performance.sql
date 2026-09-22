-- 087 Questionnaire delete + dashboard aggregate performance
-- DO NOT apply to Production from agent — Preview PR only.
-- Does NOT modify 085 or 086 files.

-- ---------------------------------------------------------------------------
-- 1) get_questionnaire_dashboard_v1 — single-query aggregates
--    Uses timestamptz ranges so (owner_member_id, fish_credited_at) index can apply.
-- ---------------------------------------------------------------------------
create or replace function public.get_questionnaire_dashboard_v1(
  p_owner_member_id uuid,
  p_today date,
  p_week_start date,
  p_recent_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_recent_limit integer := greatest(1, least(coalesce(p_recent_limit, 5), 20));
  v_today_start timestamptz;
  v_tomorrow_start timestamptz;
  v_week_start timestamptz;
  v_result jsonb;
begin
  if p_owner_member_id is null or p_today is null or p_week_start is null then
    raise exception 'invalid_dashboard_payload';
  end if;

  -- Asia/Taipei day bounds as timestamptz (index-friendly comparisons)
  v_today_start := p_today::timestamp at time zone 'Asia/Taipei';
  v_tomorrow_start := (p_today + 1)::timestamp at time zone 'Asia/Taipei';
  v_week_start := p_week_start::timestamp at time zone 'Asia/Taipei';

  with lead_stats as (
    select
      count(*) filter (
        where fish_credited_at is not null
          and fish_credited_at >= v_today_start
          and fish_credited_at < v_tomorrow_start
      )::integer as today_valid,
      count(*) filter (
        where fish_credited_at is not null
          and fish_credited_at >= v_today_start
          and fish_credited_at < v_tomorrow_start
          and first_source = 'onsite'
      )::integer as today_onsite,
      count(*) filter (
        where fish_credited_at is not null
          and fish_credited_at >= v_today_start
          and fish_credited_at < v_tomorrow_start
          and first_source = 'online'
      )::integer as today_online,
      count(*) filter (
        where fish_credited_at is not null
          and fish_credited_at >= v_week_start
          and fish_credited_at < v_tomorrow_start
      )::integer as week_valid,
      count(*) filter (
        where invitation_credited_at is not null
      )::integer as invitation_started,
      count(*)::integer as total_leads
    from public.questionnaire_leads
    where owner_member_id = p_owner_member_id
  ),
  recent as (
    select coalesce(
      jsonb_agg(to_jsonb(r) order by r.last_response_at desc),
      '[]'::jsonb
    ) as recent_leads
    from (
      select
        id,
        display_name,
        primary_need,
        need_tags,
        interest_level,
        uses_supplements,
        status,
        last_response_at,
        last_source,
        updated_at
      from public.questionnaire_leads
      where owner_member_id = p_owner_member_id
      order by last_response_at desc
      limit v_recent_limit
    ) r
  )
  select jsonb_build_object(
    'todayValidNewLeads', s.today_valid,
    'todayOnsite', s.today_onsite,
    'todayOnline', s.today_online,
    'todayFishCredited', s.today_valid,
    'weekValidNewLeads', s.week_valid,
    'invitationStartedCount', s.invitation_started,
    'totalLeadCount', s.total_leads,
    'recentLeads', r.recent_leads
  )
  into v_result
  from lead_stats s
  cross join recent r;

  return coalesce(v_result, jsonb_build_object(
    'todayValidNewLeads', 0,
    'todayOnsite', 0,
    'todayOnline', 0,
    'todayFishCredited', 0,
    'weekValidNewLeads', 0,
    'invitationStartedCount', 0,
    'totalLeadCount', 0,
    'recentLeads', '[]'::jsonb
  ));
end;
$$;

revoke all on function public.get_questionnaire_dashboard_v1(uuid, date, date, integer)
  from public, anon, authenticated;
grant execute on function public.get_questionnaire_dashboard_v1(uuid, date, date, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2) delete_questionnaire_lead_v1 — delete + reverse questionnaire 5＋5 credits
--    - No ghost five_plus_five_reports inserts on delete
--    - Missing report when credit exists → credit_report_missing (abort)
--    - fishReversed/invitationReversed only when component actually decremented
-- ---------------------------------------------------------------------------
create or replace function public.delete_questionnaire_lead_v1(
  p_owner_member_id uuid,
  p_lead_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.questionnaire_leads%rowtype;
  v_fish_reversed boolean := false;
  v_invite_reversed boolean := false;
  v_fish_date date;
  v_invite_date date;
  v_row_id uuid;
begin
  if p_owner_member_id is null or p_lead_id is null then
    raise exception 'invalid_delete_payload';
  end if;

  select * into v_lead
  from public.questionnaire_leads
  where id = p_lead_id
    and owner_member_id = p_owner_member_id
  for update;

  if not found then
    raise exception 'lead_not_found';
  end if;

  if v_lead.fish_credited_at is not null then
    v_fish_date := (v_lead.fish_credited_at at time zone 'Asia/Taipei')::date;

    select id into v_row_id
    from public.five_plus_five_reports
    where member_id = p_owner_member_id and report_date = v_fish_date
    for update;

    if not found then
      raise exception 'credit_report_missing';
    end if;

    update public.five_plus_five_reports
    set
      questionnaire_fish_pool_count = questionnaire_fish_pool_count - 1,
      updated_at = p_now
    where id = v_row_id
      and questionnaire_fish_pool_count > 0
    returning id into v_row_id;

    if found then
      v_fish_reversed := true;
    end if;
  end if;

  if v_lead.invitation_credited_at is not null then
    v_invite_date := (v_lead.invitation_credited_at at time zone 'Asia/Taipei')::date;

    select id into v_row_id
    from public.five_plus_five_reports
    where member_id = p_owner_member_id and report_date = v_invite_date
    for update;

    if not found then
      raise exception 'credit_report_missing';
    end if;

    update public.five_plus_five_reports
    set
      questionnaire_invitation_five_steps_count =
        questionnaire_invitation_five_steps_count - 1,
      updated_at = p_now
    where id = v_row_id
      and questionnaire_invitation_five_steps_count > 0
    returning id into v_row_id;

    if found then
      v_invite_reversed := true;
    end if;
  end if;

  delete from public.questionnaire_leads
  where id = v_lead.id
    and owner_member_id = p_owner_member_id;

  return jsonb_build_object(
    'ok', true,
    'fishReversed', v_fish_reversed,
    'invitationReversed', v_invite_reversed,
    'fishDate', v_fish_date,
    'invitationDate', v_invite_date
  );
end;
$$;

revoke all on function public.delete_questionnaire_lead_v1(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.delete_questionnaire_lead_v1(uuid, uuid, timestamptz)
  to service_role;
