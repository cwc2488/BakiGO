-- AI Coach V2: 21-day lifecycle, durable memory, open loops, hypotheses, turns, day-21 reflections.
-- Forward-safe / additive only. No destructive changes to existing coaching tables.
-- Writes go through service-role APIs; coaches get owner-scoped SELECT.

-- ---------------------------------------------------------------------------
-- coaching_ai_cycles — one intensive AI coaching cycle per enrollment
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_ai_cycles (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coaching_enrollments (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  cycle_index integer not null default 1 check (cycle_index >= 1),
  start_date date not null,
  planned_end_date date not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'paused', 'cancelled')),
  day21_reflection_id uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, cycle_index)
);

create index if not exists coaching_ai_cycles_enrollment_status_idx
  on public.coaching_ai_cycles (enrollment_id, status);

create index if not exists coaching_ai_cycles_owner_idx
  on public.coaching_ai_cycles (owner_member_id, updated_at desc);

comment on table public.coaching_ai_cycles is
  'AI Coach V2 intensive 21-day cycle. Cost/product boundary — not a scientific habit guarantee.';

-- ---------------------------------------------------------------------------
-- coaching_ai_memory — durable compact coaching memory
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_ai_memory (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coaching_enrollments (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  cycle_id uuid references public.coaching_ai_cycles (id) on delete set null,
  category text not null
    check (category in (
      'constraint',
      'preference',
      'pattern',
      'motivation',
      'trigger',
      'strategy_worked',
      'strategy_failed',
      'communication',
      'customer_statement',
      'insight',
      'other'
    )),
  content text not null check (char_length(content) between 1 and 500),
  evidence_summary text check (evidence_summary is null or char_length(evidence_summary) <= 400),
  confidence numeric(3, 2) not null default 0.60
    check (confidence >= 0 and confidence <= 1),
  source_log_date date,
  source_turn_id uuid,
  status text not null default 'active'
    check (status in ('active', 'superseded', 'retracted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coaching_ai_memory_enrollment_active_idx
  on public.coaching_ai_memory (enrollment_id, status, updated_at desc)
  where status = 'active';

create index if not exists coaching_ai_memory_owner_idx
  on public.coaching_ai_memory (owner_member_id, updated_at desc);

comment on table public.coaching_ai_memory is
  'Durable coaching memory. Only store facts that materially improve future coaching decisions.';

-- ---------------------------------------------------------------------------
-- coaching_ai_open_loops — unfinished coaching threads
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_ai_open_loops (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coaching_enrollments (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  cycle_id uuid references public.coaching_ai_cycles (id) on delete set null,
  subject text not null check (char_length(subject) between 1 and 120),
  detail text not null check (char_length(detail) between 1 and 400),
  status text not null default 'open'
    check (status in ('open', 'waiting', 'resolved', 'abandoned')),
  due_log_date date,
  created_log_date date,
  resolved_log_date date,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coaching_ai_open_loops_enrollment_open_idx
  on public.coaching_ai_open_loops (enrollment_id, status, updated_at desc)
  where status in ('open', 'waiting');

create index if not exists coaching_ai_open_loops_owner_idx
  on public.coaching_ai_open_loops (owner_member_id, updated_at desc);

comment on table public.coaching_ai_open_loops is
  'Open coaching threads (e.g. check tomorrow dinner). Prevent stale accumulation via status + due dates.';

-- ---------------------------------------------------------------------------
-- coaching_ai_hypotheses — revisable probabilistic interpretations
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_ai_hypotheses (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coaching_enrollments (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  cycle_id uuid references public.coaching_ai_cycles (id) on delete set null,
  statement text not null check (char_length(statement) between 1 and 400),
  supporting_evidence jsonb not null default '[]'::jsonb,
  contradicting_evidence jsonb not null default '[]'::jsonb,
  confidence numeric(3, 2) not null default 0.50
    check (confidence >= 0 and confidence <= 1),
  status text not null default 'active'
    check (status in ('active', 'weakened', 'confirmed', 'rejected', 'revised')),
  revised_into_id uuid references public.coaching_ai_hypotheses (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coaching_ai_hypotheses_enrollment_active_idx
  on public.coaching_ai_hypotheses (enrollment_id, status, updated_at desc)
  where status in ('active', 'weakened', 'confirmed');

create index if not exists coaching_ai_hypotheses_owner_idx
  on public.coaching_ai_hypotheses (owner_member_id, updated_at desc);

comment on table public.coaching_ai_hypotheses is
  'Tentative coaching interpretations. Never present uncertain inference as customer fact.';

-- ---------------------------------------------------------------------------
-- coaching_ai_turns — bounded conversational / interaction history
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_ai_turns (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coaching_enrollments (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  cycle_id uuid references public.coaching_ai_cycles (id) on delete set null,
  log_date date,
  turn_index integer not null default 0,
  role text not null check (role in ('customer', 'coach', 'system')),
  channel text not null default 'daily_log'
    check (channel in ('daily_log', 'free_message', 'photo', 'day21', 'system')),
  content text not null check (char_length(content) between 1 and 4000),
  content_summary text check (content_summary is null or char_length(content_summary) <= 400),
  ai_output_id uuid references public.coaching_ai_outputs (id) on delete set null,
  intention text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists coaching_ai_turns_enrollment_created_idx
  on public.coaching_ai_turns (enrollment_id, created_at desc);

create index if not exists coaching_ai_turns_enrollment_log_date_idx
  on public.coaching_ai_turns (enrollment_id, log_date desc)
  where log_date is not null;

create index if not exists coaching_ai_turns_owner_idx
  on public.coaching_ai_turns (owner_member_id, created_at desc);

comment on table public.coaching_ai_turns is
  'Recent interaction turns for conversational continuity. Load a bounded window — never full cycle dump.';

-- ---------------------------------------------------------------------------
-- coaching_ai_day21_reflections — personalized end-of-cycle synthesis
-- ---------------------------------------------------------------------------

create table if not exists public.coaching_ai_day21_reflections (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coaching_enrollments (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  cycle_id uuid not null references public.coaching_ai_cycles (id) on delete cascade,
  reflection_json jsonb not null default '{}'::jsonb,
  customer_message text not null check (char_length(customer_message) between 1 and 6000),
  coach_summary text check (coach_summary is null or char_length(coach_summary) <= 2000),
  model text,
  prompt_version text,
  created_at timestamptz not null default now(),
  unique (cycle_id)
);

create index if not exists coaching_ai_day21_reflections_enrollment_idx
  on public.coaching_ai_day21_reflections (enrollment_id, created_at desc);

create index if not exists coaching_ai_day21_reflections_owner_idx
  on public.coaching_ai_day21_reflections (owner_member_id, created_at desc);

alter table public.coaching_ai_cycles
  drop constraint if exists coaching_ai_cycles_day21_reflection_id_fkey;

alter table public.coaching_ai_cycles
  add constraint coaching_ai_cycles_day21_reflection_id_fkey
  foreign key (day21_reflection_id)
  references public.coaching_ai_day21_reflections (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- RLS — owner read; mutations via service role
-- ---------------------------------------------------------------------------

alter table public.coaching_ai_cycles enable row level security;
alter table public.coaching_ai_memory enable row level security;
alter table public.coaching_ai_open_loops enable row level security;
alter table public.coaching_ai_hypotheses enable row level security;
alter table public.coaching_ai_turns enable row level security;
alter table public.coaching_ai_day21_reflections enable row level security;

create policy "coaching_ai_cycles_select_own"
  on public.coaching_ai_cycles for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_ai_memory_select_own"
  on public.coaching_ai_memory for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_ai_open_loops_select_own"
  on public.coaching_ai_open_loops for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_ai_hypotheses_select_own"
  on public.coaching_ai_hypotheses for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_ai_turns_select_own"
  on public.coaching_ai_turns for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_ai_day21_reflections_select_own"
  on public.coaching_ai_day21_reflections for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );
