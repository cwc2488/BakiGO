-- Consultation AI Layer V1: structured AI outputs (motivation + barrier insights).
-- Owner-only RLS — mirrors consultation_sessions privacy boundary.

create table if not exists public.consultation_ai_outputs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.consultation_sessions (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  point_key text not null
    check (point_key in ('motivation_insight', 'barrier_insight')),
  input_snapshot jsonb not null default '{}'::jsonb,
  output_json jsonb,
  model text,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  error_message text,
  regeneration_count integer not null default 0
    check (regeneration_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, point_key)
);

create index if not exists consultation_ai_outputs_session_idx
  on public.consultation_ai_outputs (session_id, point_key);

create index if not exists consultation_ai_outputs_owner_idx
  on public.consultation_ai_outputs (owner_member_id, updated_at desc);

alter table public.consultation_ai_outputs enable row level security;

create policy "consultation_ai_outputs_select_own"
  on public.consultation_ai_outputs for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "consultation_ai_outputs_insert_own"
  on public.consultation_ai_outputs for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "consultation_ai_outputs_update_own"
  on public.consultation_ai_outputs for update
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

create policy "consultation_ai_outputs_delete_own"
  on public.consultation_ai_outputs for delete
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );
