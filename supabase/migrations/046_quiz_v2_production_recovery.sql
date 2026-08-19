-- Quiz V2 production recovery (additive / idempotent).
-- Current main 035-045 are Recognition. Do not reuse recovered Quiz migration numbers.
-- Safe on Production that already has Quiz V2 tables from the 8/18 dirty deploy:
--   CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- Does not remove tables, empty existing rows, rename objects, or reset data.
-- CHECK constraints are only dropped to widen allowed values (analysis_state, source_type, feature, contact_channel).

-- ========== recovered 035_quiz_ai_analysis_sessions_p1.sql ==========
-- QUIZ-AI-21 P1: Anonymous analysis sessions (+ quiz growth_share attribution bridge).
-- Service-role only. Opaque public token stored as SHA-256 hash. No PII.

-- Bridge: allow quiz responses to retain validated growth_shares.id (Referral /r authority).
alter table public.quiz_responses
  add column if not exists growth_share_id uuid references public.growth_shares (id) on delete set null;

create index if not exists quiz_responses_growth_share_idx
  on public.quiz_responses (growth_share_id)
  where growth_share_id is not null;

create table if not exists public.analysis_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  quiz_result_id uuid not null references public.quiz_results (id) on delete restrict,
  -- Attribution (server-validated only; never trust client ownership claims)
  source_type text not null
    check (source_type in ('direct', 'quiz_member_share', 'referral_share', 'radar_candidate')),
  growth_share_id uuid references public.growth_shares (id) on delete set null,
  quiz_share_code text,
  referrer_member_id uuid references public.members (id) on delete set null,
  -- Future Radar source architecture (nullable; no product unlock)
  radar_candidate_id uuid,
  radar_source_meta jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'expired', 'abandoned')),
  analysis_state text not null default 'shell'
    check (analysis_state in ('shell', 'in_progress', 'report_ready', 'report_failed')),
  -- Eventual report linkage (table not created in P1)
  report_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_activity_at timestamptz not null default now(),
  constraint analysis_sessions_expiry_after_create check (expires_at > created_at),
  constraint analysis_sessions_referral_share_consistency check (
    (source_type = 'referral_share' and growth_share_id is not null)
    or (source_type <> 'referral_share')
  ),
  constraint analysis_sessions_no_pii_placeholder check (true)
);

create index if not exists analysis_sessions_token_hash_idx
  on public.analysis_sessions (token_hash);

create index if not exists analysis_sessions_quiz_result_idx
  on public.analysis_sessions (quiz_result_id, created_at desc);

create index if not exists analysis_sessions_expires_at_idx
  on public.analysis_sessions (expires_at);

create index if not exists analysis_sessions_growth_share_idx
  on public.analysis_sessions (growth_share_id)
  where growth_share_id is not null;

comment on table public.analysis_sessions is
  'QUIZ-AI-21 P1 anonymous analysis sessions. Opaque token (hash only). No PII. 30-day expires_at.';

comment on column public.analysis_sessions.token_hash is
  'SHA-256 hex of opaque public token. Plaintext never stored.';

comment on column public.analysis_sessions.radar_candidate_id is
  'Future Radar candidate id (nullable). No FK / no product unlock in P1.';

alter table public.analysis_sessions enable row level security;
-- No policies: anon/authenticated denied. Server uses service role.

-- Deny-by-default: ensure no accidental grants
revoke all on table public.analysis_sessions from anon, authenticated;
grant all on table public.analysis_sessions to service_role;

-- ========== recovered 036_quiz_ai_analysis_p2.sql ==========
-- QUIZ-AI-21 P2: Structured deep analysis intake + Layer1/Layer2 reports + generation jobs.
-- Idempotent / additive / non-destructive. Service-role only. No PII columns.

-- ---------------------------------------------------------------------------
-- Extend analysis_state for P2 state machine
-- ---------------------------------------------------------------------------
alter table public.analysis_sessions
  drop constraint if exists analysis_sessions_analysis_state_check;

alter table public.analysis_sessions
  add constraint analysis_sessions_analysis_state_check
  check (analysis_state in (
    'shell',
    'questions_in_progress',
    'questions_completed',
    'basic_report_ready',
    'ai_generating',
    'ai_ready',
    'ai_failed'
  ));

-- Intake persistence on session (minimum tables)
alter table public.analysis_sessions
  add column if not exists answers_json jsonb not null default '{}'::jsonb;

alter table public.analysis_sessions
  add column if not exists current_question_id text;

alter table public.analysis_sessions
  add column if not exists intake_schema_version text not null default 'analysis_intake_v1';

alter table public.analysis_sessions
  add column if not exists questions_completed_at timestamptz;

alter table public.analysis_sessions
  add column if not exists layer1_json jsonb;

alter table public.analysis_sessions
  add column if not exists layer1_ready_at timestamptz;

-- ---------------------------------------------------------------------------
-- analysis_reports — Layer2 AI personalized report (+ Layer1 snapshot copy)
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  analysis_session_id uuid not null unique references public.analysis_sessions (id) on delete cascade,
  quiz_result_id uuid not null references public.quiz_results (id) on delete restrict,
  input_fingerprint text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  layer1_json jsonb not null default '{}'::jsonb,
  output_json jsonb,
  model text,
  prompt_version text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  error_class text,
  error_message text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  regeneration_count integer not null default 0 check (regeneration_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analysis_reports_status_idx
  on public.analysis_reports (status, updated_at desc);

comment on table public.analysis_reports is
  'QUIZ-AI-21 P2 AI reports. No PII. Layer1 always available on session even if AI fails.';

alter table public.analysis_reports enable row level security;
revoke all on table public.analysis_reports from anon, authenticated;
grant all on table public.analysis_reports to service_role;

-- ---------------------------------------------------------------------------
-- analysis_generation_jobs — thin reliable queue (coaching-pattern clone)
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  analysis_session_id uuid not null references public.analysis_sessions (id) on delete cascade,
  report_id uuid not null references public.analysis_reports (id) on delete cascade,
  input_fingerprint text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_class text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists analysis_generation_jobs_active_fingerprint_idx
  on public.analysis_generation_jobs (report_id, input_fingerprint)
  where status in ('queued', 'processing');

create index if not exists analysis_generation_jobs_claim_idx
  on public.analysis_generation_jobs (status, available_at, created_at)
  where status = 'queued';

alter table public.analysis_generation_jobs enable row level security;
revoke all on table public.analysis_generation_jobs from anon, authenticated;
grant all on table public.analysis_generation_jobs to service_role;

-- Link session.report_id when report created (app-level); keep column from P1.

-- ---------------------------------------------------------------------------
-- Claim / reclaim RPCs
-- ---------------------------------------------------------------------------
create or replace function public.claim_analysis_generation_jobs(
  p_limit integer default 1,
  p_locked_by text default 'worker'
)
returns setof public.analysis_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select j.id
    from public.analysis_generation_jobs j
    where j.status = 'queued'
      and j.available_at <= now()
    order by j.created_at asc
    for update skip locked
    limit greatest(p_limit, 0)
  )
  update public.analysis_generation_jobs j
  set
    status = 'processing',
    locked_at = now(),
    locked_by = p_locked_by,
    attempt_count = j.attempt_count + 1,
    updated_at = now()
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

create or replace function public.reclaim_stale_analysis_generation_jobs(
  p_stale_after_minutes integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  with reclaimed as (
    update public.analysis_generation_jobs
    set
      status = 'queued',
      locked_at = null,
      locked_by = null,
      available_at = now(),
      updated_at = now(),
      last_error_class = coalesce(last_error_class, 'stale_reclaimed')
    where status = 'processing'
      and locked_at is not null
      and locked_at < now() - make_interval(mins => greatest(p_stale_after_minutes, 1))
    returning id
  )
  select count(*)::integer into updated_count from reclaimed;
  return coalesce(updated_count, 0);
end;
$$;

grant execute on function public.claim_analysis_generation_jobs(integer, text) to service_role;
grant execute on function public.reclaim_stale_analysis_generation_jobs(integer) to service_role;

-- ---------------------------------------------------------------------------
-- ai_llm_call_log: allow feature = analysis
-- ---------------------------------------------------------------------------
alter table public.ai_llm_call_log
  drop constraint if exists ai_llm_call_log_feature_check;

alter table public.ai_llm_call_log
  add constraint ai_llm_call_log_feature_check
  check (feature in ('coaching', 'consultation', 'radar', 'quiz', 'analysis'));

-- ========== recovered 038_experience_21d_handoff.sql ==========
-- 21D-HANDOFF-01: paid 21-day experience INTEREST + coach brief.
-- Does not enroll coaching. Does not store public analysis tokens.
-- Service-role only. Partner access is API + owner_member_id check.

create table if not exists public.experience_21d_interests (
  id uuid primary key default gen_random_uuid(),
  analysis_session_id uuid not null unique references public.analysis_sessions (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete set null,
  owner_member_id uuid references public.members (id) on delete set null,
  source text not null default 'reset_quiz_v2'
    check (source = 'reset_quiz_v2'),
  status text not null default 'interested'
    check (status in ('interested', 'contacted', 'considering', 'joined', 'declined')),
  attribution_source_type text not null
    check (attribution_source_type in ('direct', 'quiz_member_share', 'referral_share', 'radar_candidate')),
  growth_share_id uuid references public.growth_shares (id) on delete set null,
  quiz_share_code text,
  referrer_member_id uuid references public.members (id) on delete set null,
  primary_animal_type text
    check (primary_animal_type is null or primary_animal_type in ('A', 'B', 'C', 'D', 'E', 'F')),
  secondary_animal_type text
    check (secondary_animal_type is null or secondary_animal_type in ('A', 'B', 'C', 'D', 'E', 'F')),
  display_name text,
  contact_channel text
    constraint experience_21d_interests_contact_channel_check
    check (contact_channel is null or contact_channel in ('phone', 'line', 'email', 'instagram')),
  contact_value text,
  invitation_bridge text,
  brief_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experience_21d_interests_contact_pair check (
    (contact_channel is null and contact_value is null)
    or (contact_channel is not null and contact_value is not null)
  ),
  constraint experience_21d_interests_referral_owner check (
    (attribution_source_type = 'referral_share' and growth_share_id is not null)
    or (attribution_source_type <> 'referral_share')
  )
);

create index if not exists experience_21d_interests_owner_idx
  on public.experience_21d_interests (owner_member_id, created_at desc)
  where owner_member_id is not null;

create index if not exists experience_21d_interests_unassigned_idx
  on public.experience_21d_interests (created_at desc)
  where owner_member_id is null;

create table if not exists public.experience_21d_funnel_events (
  id uuid primary key default gen_random_uuid(),
  analysis_session_id uuid not null references public.analysis_sessions (id) on delete cascade,
  interest_id uuid references public.experience_21d_interests (id) on delete set null,
  event text not null
    check (event in (
      'report_viewed',
      '21d_offer_viewed',
      '21d_interest_clicked',
      '21d_interest_created',
      '21d_contact_captured',
      '21d_partner_viewed',
      '21d_contacted'
    )),
  created_at timestamptz not null default now(),
  constraint experience_21d_funnel_events_once unique (analysis_session_id, event)
);

create index if not exists experience_21d_funnel_events_session_idx
  on public.experience_21d_funnel_events (analysis_session_id, created_at);

comment on table public.experience_21d_interests is
  '21D-HANDOFF-01 consumer INTEREST (not purchase). One row per analysis session. Coach brief in brief_json is not public.';

alter table public.experience_21d_interests enable row level security;
alter table public.experience_21d_funnel_events enable row level security;

revoke all on table public.experience_21d_interests from anon, authenticated;
revoke all on table public.experience_21d_funnel_events from anon, authenticated;
grant all on table public.experience_21d_interests to service_role;
grant all on table public.experience_21d_funnel_events to service_role;

-- ========== recovered 039_experience_21d_contact_instagram.sql ==========
-- 21D-HANDOFF-01 contact patch: allow instagram. Keep email for any historical rows.

alter table public.experience_21d_interests
  drop constraint if exists experience_21d_interests_contact_channel_check;

alter table public.experience_21d_interests
  add constraint experience_21d_interests_contact_channel_check
  check (contact_channel is null or contact_channel in ('phone', 'line', 'email', 'instagram'));

-- ========== recovered 040_quiz_partner_landing_views.sql ==========
-- QUIZ-PARTNER-01: crawler-safe human landing views for partner /q/{code} funnel.
-- Client POST only. Do not insert from server GET /q/{code} or Open Graph crawlers.
-- Service-role only. Does not change 038/039.

create table if not exists public.quiz_partner_landing_views (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  share_code text not null,
  created_at timestamptz not null default now()
);

create index if not exists quiz_partner_landing_views_owner_idx
  on public.quiz_partner_landing_views (owner_member_id, created_at desc);

create index if not exists quiz_partner_landing_views_code_idx
  on public.quiz_partner_landing_views (share_code, created_at desc);

comment on table public.quiz_partner_landing_views is
  'QUIZ-PARTNER-01 human landing views for partner short links. Never count social crawler OG fetches.';

alter table public.quiz_partner_landing_views enable row level security;

revoke all on table public.quiz_partner_landing_views from anon, authenticated;
grant all on table public.quiz_partner_landing_views to service_role;

-- ========== recovered 041_experience_21d_interest_archive.sql ==========
-- QUIZ-PARTNER-02: partner 21D lead hygiene via soft archive.
-- Additive only. No rewrite of 038/039/040. No physical DELETE.

alter table public.experience_21d_interests
  add column if not exists archived_at timestamptz;

create index if not exists experience_21d_interests_owner_active_idx
  on public.experience_21d_interests (owner_member_id, created_at desc)
  where owner_member_id is not null and archived_at is null;

comment on column public.experience_21d_interests.archived_at is
  'Partner operational hide (soft archive). Default workbench queries must exclude non-null rows. Row, session, funnel events, brief, and contact are preserved.';

-- ========== recovered 042_quiz_result_shares.sql ==========
-- QUIZ-VIRAL-01: consumer RESET result shares + viral evidence.
-- Additive only. Does not rewrite 038–041.
-- Result shares are NOT Partner /q codes. Public path is /s/{code}.

create table if not exists public.quiz_result_shares (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  source_analysis_session_id uuid not null unique
    references public.analysis_sessions (id) on delete restrict,
  source_customer_id uuid references public.customers (id) on delete set null,
  source_owner_member_id uuid references public.members (id) on delete set null,
  animal_type text not null
    check (animal_type in ('A', 'B', 'C', 'D', 'E', 'F')),
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint quiz_result_shares_code_opaque check (code ~ '^[A-Z0-9]{5,7}$')
);

create index if not exists quiz_result_shares_created_idx
  on public.quiz_result_shares (created_at desc);

comment on table public.quiz_result_shares is
  'QUIZ-VIRAL-01 consumer animal-result share. One opaque /s code per source analysis session. Not a Partner /q link. Not a business-potential score.';

create table if not exists public.quiz_result_share_views (
  id uuid primary key default gen_random_uuid(),
  result_share_id uuid not null
    references public.quiz_result_shares (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists quiz_result_share_views_share_idx
  on public.quiz_result_share_views (result_share_id, created_at desc);

comment on table public.quiz_result_share_views is
  'Human landing views for /s/{code}. Client POST only. Social crawler User-Agents must not insert.';

create table if not exists public.quiz_result_share_events (
  id uuid primary key default gen_random_uuid(),
  result_share_id uuid not null
    references public.quiz_result_shares (id) on delete cascade,
  analysis_session_id uuid
    references public.analysis_sessions (id) on delete cascade,
  event text not null
    check (event in (
      'result_reveal_viewed',
      'result_share_clicked',
      'native_share_completed',
      'result_share_fallback_saved'
    )),
  created_at timestamptz not null default now()
);

create unique index if not exists quiz_result_share_events_reveal_once
  on public.quiz_result_share_events (analysis_session_id, event)
  where event = 'result_reveal_viewed' and analysis_session_id is not null;

create index if not exists quiz_result_share_events_share_idx
  on public.quiz_result_share_events (result_share_id, event, created_at desc);

comment on table public.quiz_result_share_events is
  'Observable share-sheet evidence only. native_share_completed means the OS share sheet resolved — not that Instagram Story posted.';

alter table public.analysis_sessions
  add column if not exists result_share_id uuid
    references public.quiz_result_shares (id) on delete set null;

create index if not exists analysis_sessions_result_share_idx
  on public.analysis_sessions (result_share_id)
  where result_share_id is not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'analysis_sessions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'source_type'
      and pg_get_constraintdef(con.oid) not ilike '%result_share%'
  loop
    execute format('alter table public.analysis_sessions drop constraint %I', constraint_name);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'analysis_sessions_source_type_check'
  ) then
    alter table public.analysis_sessions
      add constraint analysis_sessions_source_type_check
      check (source_type in ('direct', 'quiz_member_share', 'referral_share', 'radar_candidate', 'result_share'));
  end if;
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'experience_21d_interests'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'attribution_source_type'
      and pg_get_constraintdef(con.oid) not ilike '%result_share%'
  loop
    execute format('alter table public.experience_21d_interests drop constraint %I', constraint_name);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'experience_21d_interests_attribution_source_type_check'
  ) then
    alter table public.experience_21d_interests
      add constraint experience_21d_interests_attribution_source_type_check
      check (attribution_source_type in ('direct', 'quiz_member_share', 'referral_share', 'radar_candidate', 'result_share'));
  end if;
end $$;

alter table public.quiz_result_shares enable row level security;
alter table public.quiz_result_share_views enable row level security;
alter table public.quiz_result_share_events enable row level security;

revoke all on table public.quiz_result_shares from anon, authenticated;
revoke all on table public.quiz_result_share_views from anon, authenticated;
revoke all on table public.quiz_result_share_events from anon, authenticated;
grant all on table public.quiz_result_shares to service_role;
grant all on table public.quiz_result_share_views to service_role;
grant all on table public.quiz_result_share_events to service_role;

-- ========== recovered 043_quiz_result_share_source_type.sql ==========
-- QUIZ-VIRAL-01 follow-up: 042 created tables/columns, but Postgres stores
-- `source_type in (...)` as `source_type = ANY (ARRAY[...])`, so 042's drop
-- loop did not replace the old CHECK. result_share inserts then fail.
-- Additive only. Does not rewrite 038–042 table shapes.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'analysis_sessions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'source_type'
      and pg_get_constraintdef(con.oid) not ilike '%result_share%'
  loop
    execute format('alter table public.analysis_sessions drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.analysis_sessions drop constraint if exists analysis_sessions_source_type_check;

alter table public.analysis_sessions
  add constraint analysis_sessions_source_type_check
  check (source_type in ('direct', 'quiz_member_share', 'referral_share', 'radar_candidate', 'result_share'));

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'experience_21d_interests'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'attribution_source_type'
      and pg_get_constraintdef(con.oid) not ilike '%result_share%'
  loop
    execute format('alter table public.experience_21d_interests drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.experience_21d_interests drop constraint if exists experience_21d_interests_attribution_source_type_check;

alter table public.experience_21d_interests
  add constraint experience_21d_interests_attribution_source_type_check
  check (attribution_source_type in ('direct', 'quiz_member_share', 'referral_share', 'radar_candidate', 'result_share'));

-- ========== current-main ai_llm_call_log feature widen (analysis) ==========
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'ai_llm_call_log'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~* 'feature'
      and pg_get_constraintdef(con.oid) not ilike '%analysis%'
  loop
    execute format('alter table public.ai_llm_call_log drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.ai_llm_call_log drop constraint if exists ai_llm_call_log_feature_check;

alter table public.ai_llm_call_log
  add constraint ai_llm_call_log_feature_check
  check (feature in ('coaching', 'consultation', 'radar', 'quiz', 'analysis'));
