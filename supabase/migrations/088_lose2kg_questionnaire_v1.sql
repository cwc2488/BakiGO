-- lose2kg week-4 questionnaire + ticket event type expansion (additive only)
-- DOES NOT mutate existing lose2kg rows.
-- DOES NOT change measurement / weight-ticket / rebound semantics.

-- 1) Expand ticket event types (additive check constraint replacement)
alter table public.lose2kg_ticket_events
  drop constraint if exists lose2kg_ticket_events_type_check;

alter table public.lose2kg_ticket_events
  add constraint lose2kg_ticket_events_type_check check (
    event_type in (
      'weight_milestone_awarded',
      'weight_ticket_revoked',
      'manual_add',
      'manual_remove',
      'correction',
      'questionnaire_completed'
    )
  );

-- Exactly-once questionnaire ticket per participant
create unique index if not exists lose2kg_ticket_events_questionnaire_once_idx
  on public.lose2kg_ticket_events (participant_id)
  where event_type = 'questionnaire_completed';

-- 2) Questionnaire settings (one row per period)
create table if not exists public.lose2kg_questionnaire_settings (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.lose2kg_periods (id) on delete cascade,
  public_token_hash text not null,
  public_token_hint text,
  public_token_encrypted text,
  is_open boolean not null default false,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lose2kg_questionnaire_settings_period_unique unique (period_id),
  constraint lose2kg_questionnaire_settings_token_hash_unique unique (public_token_hash)
);

create index if not exists lose2kg_questionnaire_settings_open_idx
  on public.lose2kg_questionnaire_settings (is_open);

comment on table public.lose2kg_questionnaire_settings is
  'Lose2kg week-4 outcomes questionnaire settings. Independent public token (not staff password).';

alter table public.lose2kg_questionnaire_settings enable row level security;

revoke all on table public.lose2kg_questionnaire_settings from anon, authenticated, public;
grant all on table public.lose2kg_questionnaire_settings to service_role;

-- 3) Questionnaire responses (one per participant per period)
create table if not exists public.lose2kg_questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.lose2kg_periods (id) on delete cascade,
  participant_id uuid not null references public.lose2kg_participants (id) on delete cascade,
  inviter_member_id uuid not null references public.members (id) on delete restrict,
  coach_member_id uuid references public.members (id) on delete set null,
  satisfaction_score integer not null,
  biggest_change text not null,
  biggest_change_other text,
  next_goal text not null,
  product_interest text not null,
  desired_help text[] not null default '{}',
  favorite_part text not null,
  favorite_part_other text,
  business_interest text not null,
  income_interest text not null,
  consultation_interest text not null,
  additional_note text,
  ticket_awarded boolean not null default false,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lose2kg_questionnaire_responses_period_participant_unique
    unique (period_id, participant_id),
  constraint lose2kg_questionnaire_responses_satisfaction_check
    check (satisfaction_score between 1 and 10),
  constraint lose2kg_questionnaire_responses_biggest_change_check
    check (biggest_change in (
      'weight',
      'body_composition',
      'diet',
      'exercise',
      'energy',
      'no_change',
      'other'
    )),
  constraint lose2kg_questionnaire_responses_product_interest_check
    check (product_interest in (
      'know_what',
      'interested_need_guidance',
      'want_to_learn',
      'none'
    )),
  constraint lose2kg_questionnaire_responses_favorite_part_check
    check (favorite_part in (
      'challenge',
      'exercise_games',
      'nutrition_class',
      'product_experience',
      'team_atmosphere',
      'bring_friends',
      'other'
    )),
  constraint lose2kg_questionnaire_responses_business_interest_check
    check (business_interest in (
      'very_interested',
      'open_to_listen',
      'customer_only',
      'not_now'
    )),
  constraint lose2kg_questionnaire_responses_income_interest_check
    check (income_interest in (
      'willing_to_learn',
      'somewhat_interested',
      'not_interested'
    )),
  constraint lose2kg_questionnaire_responses_consultation_interest_check
    check (consultation_interest in (
      'yes',
      'contact_later',
      'no'
    ))
);

create index if not exists lose2kg_questionnaire_responses_period_idx
  on public.lose2kg_questionnaire_responses (period_id, submitted_at desc);

create index if not exists lose2kg_questionnaire_responses_inviter_idx
  on public.lose2kg_questionnaire_responses (inviter_member_id);

create index if not exists lose2kg_questionnaire_responses_coach_idx
  on public.lose2kg_questionnaire_responses (coach_member_id);

create index if not exists lose2kg_questionnaire_responses_consultation_idx
  on public.lose2kg_questionnaire_responses (period_id, consultation_interest);

comment on table public.lose2kg_questionnaire_responses is
  'Lose2kg week-4 outcomes questionnaire responses. One response per participant per period.';

alter table public.lose2kg_questionnaire_responses enable row level security;

revoke all on table public.lose2kg_questionnaire_responses from anon, authenticated, public;
grant all on table public.lose2kg_questionnaire_responses to service_role;

-- 4) Atomic submit + optional +1 activity ticket (exactly once via ticket_awarded claim)
create or replace function public.submit_lose2kg_questionnaire_v1(
  p_period_id uuid,
  p_participant_id uuid,
  p_inviter_member_id uuid,
  p_coach_member_id uuid,
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
begin
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

  if p_inviter_member_id is null then
    raise exception 'inviter_required' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.members where id = p_inviter_member_id) then
    raise exception 'inviter_not_found' using errcode = 'P0001';
  end if;

  if p_coach_member_id is not null
     and not exists (select 1 from public.members where id = p_coach_member_id) then
    raise exception 'coach_not_found' using errcode = 'P0001';
  end if;

  insert into public.lose2kg_questionnaire_responses (
    period_id,
    participant_id,
    inviter_member_id,
    coach_member_id,
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
    p_inviter_member_id,
    p_coach_member_id,
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
    inviter_member_id = excluded.inviter_member_id,
    coach_member_id = excluded.coach_member_id,
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

  -- Claim exactly-once award: only the first successful claim awards a ticket
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

revoke all on function public.submit_lose2kg_questionnaire_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text[], text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.submit_lose2kg_questionnaire_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text[], text, text, text, text, text, text
) to service_role;

comment on function public.submit_lose2kg_questionnaire_v1 is
  'Atomic lose2kg week-4 questionnaire upsert. Awards +1 activity ticket exactly once on first claim.';
