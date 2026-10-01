-- lose2kg questionnaire: free-text inviter name (additive / idempotent)
-- Production already applied this migration; SQL must be safe to re-run.
-- Does NOT delete responses, recalculate tickets, or mutate existing ticket balances.

-- 1) Add free-text inviter_name
alter table public.lose2kg_questionnaire_responses
  add column if not exists inviter_name text;

comment on column public.lose2kg_questionnaire_responses.inviter_name is
  'Free-text inviter display name from week-4 questionnaire. Preferred attribution field.';

-- 2) Backfill inviter_name from members for legacy rows (only where missing)
update public.lose2kg_questionnaire_responses r
set inviter_name = m.name
from public.members m
where r.inviter_member_id = m.id
  and (r.inviter_name is null or btrim(r.inviter_name) = '');

-- 3) Make inviter_member_id nullable (legacy may remain populated)
do $$
begin
  alter table public.lose2kg_questionnaire_responses
    alter column inviter_member_id drop not null;
exception
  when others then
    -- Already nullable or constraint name differs — ignore
    null;
end $$;

-- 4) Backward-compatible trigger: v1 inserts with inviter_member_id still populate inviter_name
create or replace function public.lose2kg_questionnaire_fill_inviter_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.inviter_name is null or btrim(new.inviter_name) = '' then
    if new.inviter_member_id is not null then
      select m.name into v_name
      from public.members m
      where m.id = new.inviter_member_id;
      if v_name is not null and btrim(v_name) <> '' then
        new.inviter_name := btrim(v_name);
      end if;
    end if;
  else
    new.inviter_name := btrim(new.inviter_name);
  end if;
  return new;
end;
$$;

drop trigger if exists lose2kg_questionnaire_fill_inviter_name_trg
  on public.lose2kg_questionnaire_responses;

create trigger lose2kg_questionnaire_fill_inviter_name_trg
  before insert or update on public.lose2kg_questionnaire_responses
  for each row
  execute function public.lose2kg_questionnaire_fill_inviter_name();

-- 5) Free-text submit RPC v2 (no members lookup required)
create or replace function public.submit_lose2kg_questionnaire_v2(
  p_period_id uuid,
  p_participant_id uuid,
  p_inviter_name text,
  p_satisfaction_score integer,
  p_biggest_change text,
  p_biggest_change_other text,
  p_next_goal text,
  p_product_interest text,
  p_desired_help text[],
  p_favorite_part text,
  p_favorite_part_other text,
  p_business_interest text,
  p_income_interest text,
  p_consultation_interest text,
  p_additional_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.lose2kg_questionnaire_settings%rowtype;
  v_participant public.lose2kg_participants%rowtype;
  v_response public.lose2kg_questionnaire_responses%rowtype;
  v_claim_id uuid;
  v_was_first boolean := false;
  v_awarded boolean := false;
  v_now timestamptz := now();
  v_inviter_name text;
begin
  v_inviter_name := btrim(coalesce(p_inviter_name, ''));
  if v_inviter_name = '' then
    raise exception 'inviter_name_required' using errcode = 'P0001';
  end if;
  if char_length(v_inviter_name) > 80 then
    raise exception 'inviter_name_too_long' using errcode = 'P0001';
  end if;

  select * into v_settings
  from public.lose2kg_questionnaire_settings
  where period_id = p_period_id
  for update;

  if not found then
    raise exception 'questionnaire_not_configured' using errcode = 'P0001';
  end if;

  if not v_settings.is_open then
    raise exception 'questionnaire_closed' using errcode = 'P0001';
  end if;

  select * into v_participant
  from public.lose2kg_participants
  where id = p_participant_id
    and period_id = p_period_id
  for update;

  if not found then
    raise exception 'participant_not_in_period' using errcode = 'P0001';
  end if;

  if v_participant.status <> 'active' then
    raise exception 'participant_not_active' using errcode = 'P0001';
  end if;

  insert into public.lose2kg_questionnaire_responses (
    period_id,
    participant_id,
    inviter_member_id,
    coach_member_id,
    inviter_name,
    satisfaction_score,
    biggest_change,
    biggest_change_other,
    next_goal,
    product_interest,
    desired_help,
    favorite_part,
    favorite_part_other,
    business_interest,
    income_interest,
    consultation_interest,
    additional_note,
    ticket_awarded,
    submitted_at,
    updated_at
  ) values (
    p_period_id,
    p_participant_id,
    null,
    null,
    v_inviter_name,
    p_satisfaction_score,
    p_biggest_change,
    nullif(trim(coalesce(p_biggest_change_other, '')), ''),
    p_next_goal,
    p_product_interest,
    coalesce(p_desired_help, '{}'),
    p_favorite_part,
    nullif(trim(coalesce(p_favorite_part_other, '')), ''),
    p_business_interest,
    p_income_interest,
    p_consultation_interest,
    nullif(trim(coalesce(p_additional_note, '')), ''),
    false,
    v_now,
    v_now
  )
  on conflict (period_id, participant_id) do update set
    inviter_name = excluded.inviter_name,
    inviter_member_id = null,
    coach_member_id = null,
    satisfaction_score = excluded.satisfaction_score,
    biggest_change = excluded.biggest_change,
    biggest_change_other = excluded.biggest_change_other,
    next_goal = excluded.next_goal,
    product_interest = excluded.product_interest,
    desired_help = excluded.desired_help,
    favorite_part = excluded.favorite_part,
    favorite_part_other = excluded.favorite_part_other,
    business_interest = excluded.business_interest,
    income_interest = excluded.income_interest,
    consultation_interest = excluded.consultation_interest,
    additional_note = excluded.additional_note,
    updated_at = v_now
  returning * into v_response;

  -- Exactly-once +1 activity ticket (same claim semantics as v1)
  update public.lose2kg_questionnaire_responses
  set ticket_awarded = true, updated_at = v_now
  where id = v_response.id
    and ticket_awarded = false
  returning id into v_claim_id;

  if v_claim_id is not null then
    v_was_first := true;
    begin
      insert into public.lose2kg_ticket_events (
        period_id,
        participant_id,
        event_type,
        delta,
        reason,
        related_measurement_id,
        related_milestone,
        created_by_member_id,
        created_at
      ) values (
        p_period_id,
        p_participant_id,
        'questionnaire_completed',
        1,
        '第四週成果問卷 +1',
        null,
        null,
        null,
        v_now
      );

      update public.lose2kg_participants
      set
        activity_ticket_balance = activity_ticket_balance + 1,
        updated_at = v_now
      where id = p_participant_id;

      v_awarded := true;
      v_response.ticket_awarded := true;
    exception
      when unique_violation then
        v_awarded := false;
        v_response.ticket_awarded := true;
    end;
  else
    select * into v_response
    from public.lose2kg_questionnaire_responses
    where id = v_response.id;
    v_was_first := false;
    v_awarded := false;
  end if;

  return jsonb_build_object(
    'response_id', v_response.id,
    'was_first', v_was_first,
    'ticket_awarded', coalesce(v_response.ticket_awarded, false),
    'awarded_this_submit', v_awarded,
    'submitted_at', v_response.submitted_at,
    'updated_at', v_response.updated_at
  );
end;
$$;

revoke all on function public.submit_lose2kg_questionnaire_v2(
  uuid, uuid, text, integer, text, text, text, text, text[], text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.submit_lose2kg_questionnaire_v2(
  uuid, uuid, text, integer, text, text, text, text, text[], text, text, text, text, text, text
) to service_role;

comment on function public.submit_lose2kg_questionnaire_v2 is
  'Lose2kg week-4 questionnaire upsert with free-text inviter_name. Awards +1 activity ticket exactly once on first claim.';
