-- Consultation Engine V1 Phase 1: guided consultation sessions (Steps 1–3).
-- Owner-only RLS — same privacy boundary as customers (no upline access).

create table if not exists public.consultation_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  quiz_result_id uuid references public.quiz_results (id) on delete set null,
  body_composition_record_id uuid references public.body_composition_records (id) on delete set null,
  current_step integer not null default 1
    check (current_step >= 1 and current_step <= 14),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'follow_up', 'not_ready', 'abandoned')),
  commitment_score integer
    check (commitment_score is null or (commitment_score >= 1 and commitment_score <= 10)),
  health_safety_flag text not null default 'pending_review'
    check (health_safety_flag in ('pending_review', 'normal', 'caution', 'professional_review_required')),
  success_story_count integer not null default 0
    check (success_story_count >= 0),
  brief_snapshot jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consultation_sessions_owner_idx
  on public.consultation_sessions (owner_member_id, updated_at desc);

create index if not exists consultation_sessions_customer_idx
  on public.consultation_sessions (customer_id);

create table if not exists public.consultation_data (
  session_id uuid primary key references public.consultation_sessions (id) on delete cascade,
  data_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.consultation_sessions enable row level security;
alter table public.consultation_data enable row level security;

-- Owner-only access (mirrors customers — uplines excluded).

create policy "consultation_sessions_select_own"
  on public.consultation_sessions for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "consultation_sessions_insert_own"
  on public.consultation_sessions for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "consultation_sessions_update_own"
  on public.consultation_sessions for update
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

create policy "consultation_sessions_delete_own"
  on public.consultation_sessions for delete
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "consultation_data_select_own"
  on public.consultation_data for select
  to authenticated
  using (
    session_id in (
      select s.id from public.consultation_sessions s
      join public.members m on m.id = s.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "consultation_data_insert_own"
  on public.consultation_data for insert
  to authenticated
  with check (
    session_id in (
      select s.id from public.consultation_sessions s
      join public.members m on m.id = s.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "consultation_data_update_own"
  on public.consultation_data for update
  to authenticated
  using (
    session_id in (
      select s.id from public.consultation_sessions s
      join public.members m on m.id = s.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    session_id in (
      select s.id from public.consultation_sessions s
      join public.members m on m.id = s.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "consultation_data_delete_own"
  on public.consultation_data for delete
  to authenticated
  using (
    session_id in (
      select s.id from public.consultation_sessions s
      join public.members m on m.id = s.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );
