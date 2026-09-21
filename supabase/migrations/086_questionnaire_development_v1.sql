-- 086 Questionnaire Development V1
-- Personal questionnaire leads + 5＋5 auto credit components.
-- DO NOT apply to Production from agent — Preview PR only.
-- Does NOT modify 085 file; alters five_plus_five_reports additively.

-- ---------------------------------------------------------------------------
-- 1) five_plus_five_reports — component fields + user-submit semantics
-- ---------------------------------------------------------------------------
alter table public.five_plus_five_reports
  add column if not exists manual_fish_pool_count integer,
  add column if not exists questionnaire_fish_pool_count integer,
  add column if not exists manual_invitation_five_steps_count integer,
  add column if not exists questionnaire_invitation_five_steps_count integer,
  add column if not exists has_user_submitted boolean,
  add column if not exists user_submitted_at timestamptz;

-- Backfill existing 085 rows: all counts were manual; all were user-submitted
update public.five_plus_five_reports
set
  manual_fish_pool_count = coalesce(manual_fish_pool_count, fish_pool_count),
  questionnaire_fish_pool_count = coalesce(questionnaire_fish_pool_count, 0),
  manual_invitation_five_steps_count = coalesce(manual_invitation_five_steps_count, invitation_five_steps_count),
  questionnaire_invitation_five_steps_count = coalesce(questionnaire_invitation_five_steps_count, 0),
  has_user_submitted = coalesce(has_user_submitted, true),
  user_submitted_at = coalesce(user_submitted_at, first_submitted_at)
where manual_fish_pool_count is null
   or questionnaire_fish_pool_count is null
   or manual_invitation_five_steps_count is null
   or questionnaire_invitation_five_steps_count is null
   or has_user_submitted is null;

alter table public.five_plus_five_reports
  alter column manual_fish_pool_count set default 0,
  alter column questionnaire_fish_pool_count set default 0,
  alter column manual_invitation_five_steps_count set default 0,
  alter column questionnaire_invitation_five_steps_count set default 0,
  alter column has_user_submitted set default true;

alter table public.five_plus_five_reports
  alter column manual_fish_pool_count set not null,
  alter column questionnaire_fish_pool_count set not null,
  alter column manual_invitation_five_steps_count set not null,
  alter column questionnaire_invitation_five_steps_count set not null,
  alter column has_user_submitted set not null;

-- Drop old nonneg checks if present and re-add including new columns
alter table public.five_plus_five_reports
  drop constraint if exists five_plus_five_reports_fish_nonneg,
  drop constraint if exists five_plus_five_reports_invite_nonneg,
  drop constraint if exists five_plus_five_reports_manual_fish_nonneg,
  drop constraint if exists five_plus_five_reports_q_fish_nonneg,
  drop constraint if exists five_plus_five_reports_manual_invite_nonneg,
  drop constraint if exists five_plus_five_reports_q_invite_nonneg;

alter table public.five_plus_five_reports
  add constraint five_plus_five_reports_fish_nonneg check (fish_pool_count >= 0),
  add constraint five_plus_five_reports_invite_nonneg check (invitation_five_steps_count >= 0),
  add constraint five_plus_five_reports_manual_fish_nonneg check (manual_fish_pool_count >= 0),
  add constraint five_plus_five_reports_q_fish_nonneg check (questionnaire_fish_pool_count >= 0),
  add constraint five_plus_five_reports_manual_invite_nonneg check (manual_invitation_five_steps_count >= 0),
  add constraint five_plus_five_reports_q_invite_nonneg check (questionnaire_invitation_five_steps_count >= 0);

comment on column public.five_plus_five_reports.manual_fish_pool_count is
  'User-entered fish pool count. Totals = manual + questionnaire.';
comment on column public.five_plus_five_reports.questionnaire_fish_pool_count is
  'Auto-credited from first valid questionnaire leads. Client cannot edit.';
comment on column public.five_plus_five_reports.has_user_submitted is
  'True only after member presses 完成今日回報. Questionnaire-only rows stay false.';

-- ---------------------------------------------------------------------------
-- 1b) #74 migration-first compatibility + total invariants
-- ---------------------------------------------------------------------------
-- Production may run 086 before deploying #75. Old #74 writers still set totals only.
create or replace function public.five_plus_five_component_sync_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Legacy INSERT: components default 0 but total > 0 → treat total as manual
  if tg_op = 'INSERT' then
    if coalesce(new.manual_fish_pool_count, 0) = 0
       and coalesce(new.questionnaire_fish_pool_count, 0) = 0
       and coalesce(new.fish_pool_count, 0) > 0 then
      new.manual_fish_pool_count := new.fish_pool_count;
    end if;
    if coalesce(new.manual_invitation_five_steps_count, 0) = 0
       and coalesce(new.questionnaire_invitation_five_steps_count, 0) = 0
       and coalesce(new.invitation_five_steps_count, 0) > 0 then
      new.manual_invitation_five_steps_count := new.invitation_five_steps_count;
    end if;
  end if;

  -- Legacy UPDATE (#74): total changed, both components unchanged → derive manual
  if tg_op = 'UPDATE' then
    if new.fish_pool_count is distinct from old.fish_pool_count
       and new.manual_fish_pool_count is not distinct from old.manual_fish_pool_count
       and new.questionnaire_fish_pool_count is not distinct from old.questionnaire_fish_pool_count then
      new.manual_fish_pool_count := greatest(0, new.fish_pool_count - coalesce(new.questionnaire_fish_pool_count, 0));
    end if;
    if new.invitation_five_steps_count is distinct from old.invitation_five_steps_count
       and new.manual_invitation_five_steps_count is not distinct from old.manual_invitation_five_steps_count
       and new.questionnaire_invitation_five_steps_count is not distinct from old.questionnaire_invitation_five_steps_count then
      new.manual_invitation_five_steps_count := greatest(
        0,
        new.invitation_five_steps_count - coalesce(new.questionnaire_invitation_five_steps_count, 0)
      );
    end if;
  end if;

  -- Authoritative recompute (new #75 / questionnaire RPCs also pass through safely)
  new.fish_pool_count :=
    coalesce(new.manual_fish_pool_count, 0) + coalesce(new.questionnaire_fish_pool_count, 0);
  new.invitation_five_steps_count :=
    coalesce(new.manual_invitation_five_steps_count, 0)
    + coalesce(new.questionnaire_invitation_five_steps_count, 0);

  return new;
end;
$$;

drop trigger if exists five_plus_five_component_sync_guard_trg on public.five_plus_five_reports;
create trigger five_plus_five_component_sync_guard_trg
  before insert or update on public.five_plus_five_reports
  for each row
  execute function public.five_plus_five_component_sync_guard();

-- Ensure backfilled rows satisfy invariants before adding CHECKs
update public.five_plus_five_reports
set
  fish_pool_count = manual_fish_pool_count + questionnaire_fish_pool_count,
  invitation_five_steps_count =
    manual_invitation_five_steps_count + questionnaire_invitation_five_steps_count
where fish_pool_count is distinct from (manual_fish_pool_count + questionnaire_fish_pool_count)
   or invitation_five_steps_count is distinct from (
        manual_invitation_five_steps_count + questionnaire_invitation_five_steps_count
      );

alter table public.five_plus_five_reports
  drop constraint if exists five_plus_five_reports_fish_total_eq,
  drop constraint if exists five_plus_five_reports_invite_total_eq;

alter table public.five_plus_five_reports
  add constraint five_plus_five_reports_fish_total_eq check (
    fish_pool_count = manual_fish_pool_count + questionnaire_fish_pool_count
  ),
  add constraint five_plus_five_reports_invite_total_eq check (
    invitation_five_steps_count =
      manual_invitation_five_steps_count + questionnaire_invitation_five_steps_count
  );

-- ---------------------------------------------------------------------------
-- 1c) Atomic manual upsert RPC (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_five_plus_five_manual_report_v2(
  p_member_id uuid,
  p_report_date date,
  p_manual_fish_pool_count integer,
  p_manual_invitation_five_steps_count integer,
  p_now timestamptz,
  p_submitted_on_time boolean
)
returns public.five_plus_five_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.five_plus_five_reports%rowtype;
begin
  if p_member_id is null or p_report_date is null then
    raise exception 'invalid_manual_upsert_payload';
  end if;
  if p_manual_fish_pool_count is null or p_manual_fish_pool_count < 0
     or p_manual_invitation_five_steps_count is null or p_manual_invitation_five_steps_count < 0 then
    raise exception 'invalid_manual_counts';
  end if;

  select * into v_row
  from public.five_plus_five_reports
  where member_id = p_member_id and report_date = p_report_date
  for update;

  if not found then
    begin
      insert into public.five_plus_five_reports (
        member_id,
        report_date,
        manual_fish_pool_count,
        questionnaire_fish_pool_count,
        manual_invitation_five_steps_count,
        questionnaire_invitation_five_steps_count,
        fish_pool_count,
        invitation_five_steps_count,
        first_submitted_at,
        user_submitted_at,
        has_user_submitted,
        updated_at,
        submitted_on_time,
        created_at
      ) values (
        p_member_id,
        p_report_date,
        p_manual_fish_pool_count,
        0,
        p_manual_invitation_five_steps_count,
        0,
        p_manual_fish_pool_count,
        p_manual_invitation_five_steps_count,
        p_now,
        p_now,
        true,
        p_now,
        coalesce(p_submitted_on_time, false),
        p_now
      )
      returning * into v_row;
      return v_row;
    exception
      when unique_violation then
        select * into v_row
        from public.five_plus_five_reports
        where member_id = p_member_id and report_date = p_report_date
        for update;
        if not found then
          raise;
        end if;
    end;
  end if;

  update public.five_plus_five_reports
  set
    manual_fish_pool_count = p_manual_fish_pool_count,
    manual_invitation_five_steps_count = p_manual_invitation_five_steps_count,
    fish_pool_count = p_manual_fish_pool_count + questionnaire_fish_pool_count,
    invitation_five_steps_count =
      p_manual_invitation_five_steps_count + questionnaire_invitation_five_steps_count,
    has_user_submitted = case
      when has_user_submitted then true
      else true
    end,
    user_submitted_at = case
      when has_user_submitted then user_submitted_at
      else p_now
    end,
    submitted_on_time = case
      when has_user_submitted then submitted_on_time
      else coalesce(p_submitted_on_time, false)
    end,
    updated_at = p_now
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.upsert_five_plus_five_manual_report_v2(
  uuid, date, integer, integer, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.upsert_five_plus_five_manual_report_v2(
  uuid, date, integer, integer, timestamptz, boolean
) to service_role;

-- ---------------------------------------------------------------------------
-- 2) questionnaire_share_links
-- ---------------------------------------------------------------------------
create table if not exists public.questionnaire_share_links (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  share_code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questionnaire_share_links_code_unique unique (share_code),
  constraint questionnaire_share_links_code_format check (share_code ~ '^[A-Z0-9]{6,12}$')
);

create unique index if not exists questionnaire_share_links_one_active_per_owner
  on public.questionnaire_share_links (owner_member_id)
  where is_active = true;

create index if not exists questionnaire_share_links_owner_idx
  on public.questionnaire_share_links (owner_member_id);

comment on table public.questionnaire_share_links is
  'Per-member permanent questionnaire share codes (/survey/[code]). Independent of recruitment.';

alter table public.questionnaire_share_links enable row level security;

drop policy if exists "questionnaire_share_links_select_own" on public.questionnaire_share_links;
create policy "questionnaire_share_links_select_own"
  on public.questionnaire_share_links for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

revoke all on table public.questionnaire_share_links from anon, authenticated, public;
grant select on table public.questionnaire_share_links to authenticated;
grant all on table public.questionnaire_share_links to service_role;

-- ---------------------------------------------------------------------------
-- 3) questionnaire_leads
-- ---------------------------------------------------------------------------
create table if not exists public.questionnaire_leads (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  contact_fingerprint text not null,
  display_name text not null,
  contact_type text not null,
  contact_value text not null,
  primary_need text,
  need_tags text[] not null default '{}',
  interest_level text,
  uses_supplements boolean,
  supplement_details text,
  status text not null default 'new',
  first_source text not null,
  last_source text not null,
  first_response_at timestamptz not null default now(),
  last_response_at timestamptz not null default now(),
  response_count integer not null default 1,
  latest_response_id uuid,
  fish_credited_at timestamptz,
  invitation_started_at timestamptz,
  invitation_credited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questionnaire_leads_owner_fingerprint_unique unique (owner_member_id, contact_fingerprint),
  constraint questionnaire_leads_contact_type_check check (contact_type in ('line', 'instagram', 'phone')),
  constraint questionnaire_leads_status_check check (
    status in ('new', 'contacted', 'invitation_started', 'completed', 'paused')
  ),
  constraint questionnaire_leads_source_check check (
    first_source in ('onsite', 'online') and last_source in ('onsite', 'online')
  ),
  constraint questionnaire_leads_interest_check check (
    interest_level is null or interest_level in ('high', 'medium', 'low')
  ),
  constraint questionnaire_leads_response_count_nonneg check (response_count >= 1)
);

-- Deterministic list sort for DB-side pagination (Priority 0 UI order)
alter table public.questionnaire_leads
  add column if not exists status_priority integer
  generated always as (
    case status
      when 'new' then 0
      when 'contacted' then 1
      when 'invitation_started' then 2
      when 'paused' then 3
      when 'completed' then 4
      else 99
    end
  ) stored;

create index if not exists questionnaire_leads_owner_updated_idx
  on public.questionnaire_leads (owner_member_id, updated_at desc);

create index if not exists questionnaire_leads_owner_status_updated_idx
  on public.questionnaire_leads (owner_member_id, status, updated_at desc);

create index if not exists questionnaire_leads_owner_status_priority_idx
  on public.questionnaire_leads (owner_member_id, status_priority, last_response_at desc);

create index if not exists questionnaire_leads_fish_credited_idx
  on public.questionnaire_leads (owner_member_id, fish_credited_at)
  where fish_credited_at is not null;

comment on table public.questionnaire_leads is
  'Owner-only questionnaire contact list. Not CRM customers. Ancestor cannot read PII.';

alter table public.questionnaire_leads enable row level security;

drop policy if exists "questionnaire_leads_select_own" on public.questionnaire_leads;
create policy "questionnaire_leads_select_own"
  on public.questionnaire_leads for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

revoke all on table public.questionnaire_leads from anon, authenticated, public;
grant select on table public.questionnaire_leads to authenticated;
grant all on table public.questionnaire_leads to service_role;

-- ---------------------------------------------------------------------------
-- 4) questionnaire_responses
-- ---------------------------------------------------------------------------
create table if not exists public.questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.questionnaire_leads (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  share_code text,
  source text not null,
  improvement_areas text[] not null default '{}',
  improvement_other text,
  body_satisfaction_score smallint not null,
  weekly_exercise_frequency text not null,
  uses_supplements boolean not null,
  supplement_details text,
  priority_improvement text not null,
  further_understanding_interest text not null,
  display_name text not null,
  contact_type text not null,
  contact_value text not null,
  consent_accepted_at timestamptz not null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint questionnaire_responses_source_check check (source in ('onsite', 'online')),
  constraint questionnaire_responses_satisfaction_check check (
    body_satisfaction_score between 1 and 5
  ),
  constraint questionnaire_responses_exercise_check check (
    weekly_exercise_frequency in ('almost_none', 'once', 'two_to_three', 'four_plus')
  ),
  constraint questionnaire_responses_interest_check check (
    further_understanding_interest in ('high', 'medium', 'low')
  ),
  constraint questionnaire_responses_contact_type_check check (
    contact_type in ('line', 'instagram', 'phone')
  )
);

create index if not exists questionnaire_responses_lead_submitted_idx
  on public.questionnaire_responses (lead_id, submitted_at desc);

create index if not exists questionnaire_responses_owner_submitted_idx
  on public.questionnaire_responses (owner_member_id, submitted_at desc);

comment on table public.questionnaire_responses is
  'Immutable-ish questionnaire submissions. Owner SELECT only; writes via service_role RPC.';

alter table public.questionnaire_responses enable row level security;

drop policy if exists "questionnaire_responses_select_own" on public.questionnaire_responses;
create policy "questionnaire_responses_select_own"
  on public.questionnaire_responses for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

revoke all on table public.questionnaire_responses from anon, authenticated, public;
grant select on table public.questionnaire_responses to authenticated;
grant all on table public.questionnaire_responses to service_role;

-- FK latest_response_id after responses exist
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'questionnaire_leads_latest_response_fk'
  ) then
    alter table public.questionnaire_leads
      add constraint questionnaire_leads_latest_response_fk
      foreign key (latest_response_id) references public.questionnaire_responses (id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) RPC: credit fish for first unique questionnaire lead (internal helper)
-- ---------------------------------------------------------------------------
create or replace function public._five_plus_five_credit_questionnaire_fish(
  p_member_id uuid,
  p_report_date date,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.five_plus_five_reports%rowtype;
begin
  select * into v_row
  from public.five_plus_five_reports
  where member_id = p_member_id and report_date = p_report_date
  for update;

  if not found then
    insert into public.five_plus_five_reports (
      member_id,
      report_date,
      fish_pool_count,
      invitation_five_steps_count,
      manual_fish_pool_count,
      questionnaire_fish_pool_count,
      manual_invitation_five_steps_count,
      questionnaire_invitation_five_steps_count,
      first_submitted_at,
      updated_at,
      submitted_on_time,
      created_at,
      has_user_submitted,
      user_submitted_at
    ) values (
      p_member_id,
      p_report_date,
      1,
      0,
      0,
      1,
      0,
      0,
      p_now,
      p_now,
      false,
      p_now,
      false,
      null
    );
    return;
  end if;

  update public.five_plus_five_reports
  set
    questionnaire_fish_pool_count = questionnaire_fish_pool_count + 1,
    fish_pool_count = manual_fish_pool_count + (questionnaire_fish_pool_count + 1),
    invitation_five_steps_count = manual_invitation_five_steps_count + questionnaire_invitation_five_steps_count,
    updated_at = p_now
  where id = v_row.id;
end;
$$;

revoke all on function public._five_plus_five_credit_questionnaire_fish(uuid, date, timestamptz) from public, anon, authenticated;
grant execute on function public._five_plus_five_credit_questionnaire_fish(uuid, date, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 6) RPC: submit_questionnaire_response_v1 (concurrency-safe lead upsert)
-- ---------------------------------------------------------------------------
create or replace function public.submit_questionnaire_response_v1(
  p_owner_member_id uuid,
  p_share_code text,
  p_source text,
  p_report_date date,
  p_improvement_areas text[],
  p_improvement_other text,
  p_body_satisfaction_score smallint,
  p_weekly_exercise_frequency text,
  p_uses_supplements boolean,
  p_supplement_details text,
  p_priority_improvement text,
  p_further_understanding_interest text,
  p_display_name text,
  p_contact_type text,
  p_contact_value text,
  p_contact_fingerprint text,
  p_consent_accepted_at timestamptz,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.questionnaire_leads%rowtype;
  v_response_id uuid;
  v_is_new_lead boolean := false;
  v_source text;
  v_credit_id uuid;
begin
  if p_owner_member_id is null or p_contact_fingerprint is null or p_contact_fingerprint = '' then
    raise exception 'invalid_submit_payload';
  end if;

  v_source := case when p_source = 'onsite' then 'onsite' else 'online' end;

  -- Concurrent-safe lead create: only one INSERT wins the unique constraint
  insert into public.questionnaire_leads (
    owner_member_id,
    contact_fingerprint,
    display_name,
    contact_type,
    contact_value,
    primary_need,
    need_tags,
    interest_level,
    uses_supplements,
    supplement_details,
    status,
    first_source,
    last_source,
    first_response_at,
    last_response_at,
    response_count,
    created_at,
    updated_at
  ) values (
    p_owner_member_id,
    p_contact_fingerprint,
    p_display_name,
    p_contact_type,
    p_contact_value,
    p_priority_improvement,
    coalesce(p_improvement_areas, '{}'),
    p_further_understanding_interest,
    p_uses_supplements,
    case when p_uses_supplements then p_supplement_details else null end,
    'new',
    v_source,
    v_source,
    p_now,
    p_now,
    1,
    p_now,
    p_now
  )
  on conflict (owner_member_id, contact_fingerprint) do nothing
  returning * into v_lead;

  if found then
    v_is_new_lead := true;
  else
    select * into v_lead
    from public.questionnaire_leads
    where owner_member_id = p_owner_member_id
      and contact_fingerprint = p_contact_fingerprint
    for update;

    if not found then
      raise exception 'lead_upsert_race_failed';
    end if;

    v_is_new_lead := false;
    update public.questionnaire_leads
    set
      display_name = p_display_name,
      contact_type = p_contact_type,
      contact_value = p_contact_value,
      primary_need = p_priority_improvement,
      need_tags = coalesce(p_improvement_areas, '{}'),
      interest_level = p_further_understanding_interest,
      uses_supplements = p_uses_supplements,
      supplement_details = case when p_uses_supplements then p_supplement_details else null end,
      last_source = v_source,
      last_response_at = p_now,
      response_count = response_count + 1,
      updated_at = p_now
    where id = v_lead.id
    returning * into v_lead;
  end if;

  insert into public.questionnaire_responses (
    lead_id,
    owner_member_id,
    share_code,
    source,
    improvement_areas,
    improvement_other,
    body_satisfaction_score,
    weekly_exercise_frequency,
    uses_supplements,
    supplement_details,
    priority_improvement,
    further_understanding_interest,
    display_name,
    contact_type,
    contact_value,
    consent_accepted_at,
    submitted_at,
    created_at
  ) values (
    v_lead.id,
    p_owner_member_id,
    p_share_code,
    v_source,
    coalesce(p_improvement_areas, '{}'),
    p_improvement_other,
    p_body_satisfaction_score,
    p_weekly_exercise_frequency,
    p_uses_supplements,
    case when p_uses_supplements then p_supplement_details else null end,
    p_priority_improvement,
    p_further_understanding_interest,
    p_display_name,
    p_contact_type,
    p_contact_value,
    p_consent_accepted_at,
    p_now,
    p_now
  )
  returning id into v_response_id;

  update public.questionnaire_leads
  set latest_response_id = v_response_id, updated_at = p_now
  where id = v_lead.id;

  -- Exactly-once fish credit (even under concurrent first submits)
  update public.questionnaire_leads
  set fish_credited_at = p_now, updated_at = p_now
  where id = v_lead.id
    and fish_credited_at is null
  returning id into v_credit_id;

  if v_credit_id is not null then
    perform public._five_plus_five_credit_questionnaire_fish(
      p_owner_member_id,
      p_report_date,
      p_now
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'isNewLead', v_is_new_lead,
    'leadId', v_lead.id,
    'responseId', v_response_id
  );
end;
$$;

revoke all on function public.submit_questionnaire_response_v1(
  uuid, text, text, date, text[], text, smallint, text, boolean, text, text, text, text, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.submit_questionnaire_response_v1(
  uuid, text, text, date, text[], text, smallint, text, boolean, text, text, text, text, text, text, text, timestamptz, timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- 7) RPC: start_questionnaire_lead_invitation_v1
-- ---------------------------------------------------------------------------
create or replace function public.start_questionnaire_lead_invitation_v1(
  p_owner_member_id uuid,
  p_lead_id uuid,
  p_report_date date,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.questionnaire_leads%rowtype;
  v_row public.five_plus_five_reports%rowtype;
  v_credited boolean := false;
begin
  select * into v_lead
  from public.questionnaire_leads
  where id = p_lead_id
    and owner_member_id = p_owner_member_id
  for update;

  if not found then
    raise exception 'lead_not_found';
  end if;

  update public.questionnaire_leads
  set
    status = 'invitation_started',
    invitation_started_at = coalesce(invitation_started_at, p_now),
    updated_at = p_now
  where id = v_lead.id
  returning * into v_lead;

  if v_lead.invitation_credited_at is null then
    select * into v_row
    from public.five_plus_five_reports
    where member_id = p_owner_member_id and report_date = p_report_date
    for update;

    if not found then
      insert into public.five_plus_five_reports (
        member_id, report_date,
        fish_pool_count, invitation_five_steps_count,
        manual_fish_pool_count, questionnaire_fish_pool_count,
        manual_invitation_five_steps_count, questionnaire_invitation_five_steps_count,
        first_submitted_at, updated_at, submitted_on_time, created_at,
        has_user_submitted, user_submitted_at
      ) values (
        p_owner_member_id, p_report_date,
        0, 1,
        0, 0,
        0, 1,
        p_now, p_now, false, p_now,
        false, null
      );
    else
      update public.five_plus_five_reports
      set
        questionnaire_invitation_five_steps_count = questionnaire_invitation_five_steps_count + 1,
        invitation_five_steps_count = manual_invitation_five_steps_count + (questionnaire_invitation_five_steps_count + 1),
        fish_pool_count = manual_fish_pool_count + questionnaire_fish_pool_count,
        updated_at = p_now
      where id = v_row.id;
    end if;

    update public.questionnaire_leads
    set invitation_credited_at = p_now, updated_at = p_now
    where id = v_lead.id;

    v_credited := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'credited', v_credited,
    'leadId', v_lead.id,
    'status', 'invitation_started'
  );
end;
$$;

revoke all on function public.start_questionnaire_lead_invitation_v1(uuid, uuid, date, timestamptz)
  from public, anon, authenticated;
grant execute on function public.start_questionnaire_lead_invitation_v1(uuid, uuid, date, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- 8) Replace get_five_plus_five_member_stats to respect has_user_submitted
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
  v_has_user_today boolean := false;
  v_today_on_time boolean := false;
  v_row_on_time boolean;
  v_row_has_user boolean;
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

  if v_today is not null then
    v_has_user_today := coalesce((v_today ->> 'has_user_submitted')::boolean, false);
    v_today_on_time := v_has_user_today and coalesce((v_today ->> 'submitted_on_time')::boolean, false);
  end if;

  select jsonb_build_object(
    'fish_pool', coalesce(sum(fish_pool_count), 0),
    'invitation_five_steps', coalesce(sum(invitation_five_steps_count), 0),
    'manual_fish_pool', coalesce(sum(manual_fish_pool_count), 0),
    'questionnaire_fish_pool', coalesce(sum(questionnaire_fish_pool_count), 0),
    'manual_invitation', coalesce(sum(manual_invitation_five_steps_count), 0),
    'questionnaire_invitation', coalesce(sum(questionnaire_invitation_five_steps_count), 0)
  )
  into v_week
  from public.five_plus_five_reports
  where member_id = p_member_id
    and report_date >= p_week_start
    and report_date <= p_week_end;

  select jsonb_build_object(
    'fish_pool', coalesce(sum(fish_pool_count), 0),
    'invitation_five_steps', coalesce(sum(invitation_five_steps_count), 0),
    'on_time_days', coalesce(sum(
      case when has_user_submitted and submitted_on_time then 1 else 0 end
    ), 0)
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

  select coalesce(jsonb_agg(to_jsonb(r) order by r.report_date desc), '[]'::jsonb)
  into v_recent
  from public.five_plus_five_reports r
  where r.member_id = p_member_id
    and r.report_date >= v_recent_start
    and r.report_date <= p_today;

  -- Streak only counts has_user_submitted + submitted_on_time days
  if v_today_on_time then
    v_cursor := p_today;
  elsif p_treat_today_as_open and not v_has_user_today then
    v_cursor := p_today - 1;
  else
    v_cursor := null;
  end if;

  while v_cursor is not null and v_cursor >= v_streak_floor loop
    select submitted_on_time, has_user_submitted
    into v_row_on_time, v_row_has_user
    from public.five_plus_five_reports
    where member_id = p_member_id and report_date = v_cursor;

    if not found or coalesce(v_row_has_user, false) = false or coalesce(v_row_on_time, false) = false then
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

revoke all on function public.get_five_plus_five_member_stats(
  uuid, date, date, date, date, boolean, integer, integer
) from public, anon, authenticated;
grant execute on function public.get_five_plus_five_member_stats(
  uuid, date, date, date, date, boolean, integer, integer
) to service_role;
