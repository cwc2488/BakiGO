-- AI Coaching Phase 2b-1: unified daily generation output + lightweight job queue + telemetry.
-- No OpenAI integration in this migration — schema + persistence only.

-- ---------------------------------------------------------------------------
-- coaching_coach_directives — coach-set focus / priority / instructions
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_coach_directives (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coaching_enrollments (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  current_focus text,
  current_priority text,
  coach_instruction text,
  effective_from date not null default (timezone('Asia/Taipei', now()))::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coaching_coach_directives_enrollment_idx
  on public.coaching_coach_directives (enrollment_id, effective_from desc);

create unique index if not exists coaching_coach_directives_one_active_per_enrollment_idx
  on public.coaching_coach_directives (enrollment_id);

-- ---------------------------------------------------------------------------
-- coaching_ai_outputs — one row per enrollment per log_date (customer + coach)
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_ai_outputs (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coaching_enrollments (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  log_date date not null,
  point_key text not null default 'daily_coach_generation'
    check (point_key = 'daily_coach_generation'),
  input_fingerprint text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_json jsonb,
  model text,
  prompt_version text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  regeneration_count integer not null default 0
    check (regeneration_count >= 0),
  ai_proposed_intervention_level text
    check (
      ai_proposed_intervention_level is null
      or ai_proposed_intervention_level in ('normal', 'watch', 'coach_attention')
    ),
  final_intervention_level text
    check (
      final_intervention_level is null
      or final_intervention_level in ('normal', 'watch', 'coach_attention')
    ),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, log_date, point_key)
);

create index if not exists coaching_ai_outputs_enrollment_date_idx
  on public.coaching_ai_outputs (enrollment_id, log_date desc);

create index if not exists coaching_ai_outputs_owner_updated_idx
  on public.coaching_ai_outputs (owner_member_id, updated_at desc);

create index if not exists coaching_ai_outputs_status_idx
  on public.coaching_ai_outputs (status, updated_at desc);

-- ---------------------------------------------------------------------------
-- coaching_generation_jobs — lightweight async queue (service role worker)
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coaching_enrollments (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  log_date date not null,
  output_id uuid not null references public.coaching_ai_outputs (id) on delete cascade,
  input_fingerprint text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  attempt_count integer not null default 0
    check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one active job per output + fingerprint (queued or processing).
create unique index if not exists coaching_generation_jobs_one_active_per_output_fingerprint_idx
  on public.coaching_generation_jobs (output_id, input_fingerprint)
  where status in ('queued', 'processing');

create index if not exists coaching_generation_jobs_claim_idx
  on public.coaching_generation_jobs (status, available_at)
  where status = 'queued';

create index if not exists coaching_generation_jobs_stale_processing_idx
  on public.coaching_generation_jobs (status, locked_at)
  where status = 'processing';

create index if not exists coaching_generation_jobs_output_idx
  on public.coaching_generation_jobs (output_id, created_at desc);

-- ---------------------------------------------------------------------------
-- ai_llm_call_log — cross-feature append-only LLM cost telemetry
-- ---------------------------------------------------------------------------

create table if not exists public.ai_llm_call_log (
  id uuid primary key default gen_random_uuid(),
  feature text not null
    check (feature in ('coaching', 'consultation', 'radar', 'quiz')),
  point_key text,
  customer_id uuid references public.customers (id) on delete set null,
  enrollment_id uuid references public.coaching_enrollments (id) on delete set null,
  owner_member_id uuid references public.members (id) on delete set null,
  model text not null,
  prompt_version text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  image_count integer not null default 0 check (image_count >= 0),
  image_usage_metadata jsonb,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  estimated_cost_usd numeric(12, 8) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  pricing_found boolean not null default false,
  status text not null default 'completed'
    check (status in ('completed', 'failed')),
  error_code text,
  input_fingerprint text,
  created_at timestamptz not null default now()
);

create index if not exists ai_llm_call_log_feature_created_idx
  on public.ai_llm_call_log (feature, created_at desc);

create index if not exists ai_llm_call_log_enrollment_idx
  on public.ai_llm_call_log (enrollment_id, created_at desc)
  where enrollment_id is not null;

create index if not exists ai_llm_call_log_owner_created_idx
  on public.ai_llm_call_log (owner_member_id, created_at desc)
  where owner_member_id is not null;

-- ---------------------------------------------------------------------------
-- RLS — coach read-only on outputs/telemetry; queue is service-role only
-- ---------------------------------------------------------------------------

alter table public.coaching_coach_directives enable row level security;
alter table public.coaching_ai_outputs enable row level security;
alter table public.coaching_generation_jobs enable row level security;
alter table public.ai_llm_call_log enable row level security;

create policy "coaching_coach_directives_select_own"
  on public.coaching_coach_directives for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_coach_directives_insert_own"
  on public.coaching_coach_directives for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_coach_directives_update_own"
  on public.coaching_coach_directives for update
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- Coach may read own AI outputs; writes go through service role portal/worker APIs.
create policy "coaching_ai_outputs_select_own"
  on public.coaching_ai_outputs for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- coaching_generation_jobs: no authenticated policies — service role only.

create policy "ai_llm_call_log_select_own"
  on public.ai_llm_call_log for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

comment on table public.coaching_ai_outputs is
  'One daily_coach_generation row per enrollment+log_date. DB is memory source; no conversation history.';

comment on table public.coaching_generation_jobs is
  'Lightweight async queue for daily coach generation. Mutations via service role worker only.';

comment on column public.coaching_ai_outputs.ai_proposed_intervention_level is
  'AI-suggested level for audit; not authoritative.';

comment on column public.coaching_ai_outputs.final_intervention_level is
  'Authoritative level from deterministic intervention engine after generation.';

comment on column public.ai_llm_call_log.pricing_found is
  'False when model pricing unknown — estimated_cost_usd must be null.';
