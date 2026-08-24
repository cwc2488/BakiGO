-- NOTE: Renumbered onto fix/regression-pack-01 lineage (recognition occupies 035–045).
-- Content is idempotent / additive; safe if Production already applied the original 035–043 quiz/21d set.

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
