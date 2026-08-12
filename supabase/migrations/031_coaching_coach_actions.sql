-- Phase 3d: Coach Action Memory (persistence)
-- Coach-only internal memory. Distinct from coaching_coach_directives.

create table if not exists public.coaching_coach_actions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.coaching_enrollments (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  owner_member_id uuid not null references public.members (id) on delete cascade,
  action_type text not null
    check (action_type in ('note', 'acknowledged', 'follow_up')),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'follow_up', 'resolved', 'superseded')),
  note text,
  related_reason_codes text[] not null default '{}'::text[],
  evidence_refs jsonb not null default '[]'::jsonb,
  related_log_date date,
  related_measurement_id uuid,
  /** True when note/context should affect GenerationInput fingerprint. */
  is_material boolean not null default false,
  superseded_by uuid references public.coaching_coach_actions (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists coaching_coach_actions_enrollment_created_idx
  on public.coaching_coach_actions (enrollment_id, created_at desc);

create index if not exists coaching_coach_actions_owner_created_idx
  on public.coaching_coach_actions (owner_member_id, created_at desc);

create index if not exists coaching_coach_actions_unresolved_idx
  on public.coaching_coach_actions (enrollment_id, created_at desc)
  where resolved_at is null and status in ('open', 'acknowledged', 'follow_up');

create index if not exists coaching_coach_actions_enrollment_material_idx
  on public.coaching_coach_actions (enrollment_id, created_at desc)
  where is_material = true;

alter table public.coaching_coach_actions enable row level security;

-- Coach SELECT/INSERT/UPDATE own rows only. No DELETE policy (auditability).
-- Customer anon: no policies → no access. Service role bypasses RLS for generation.

create policy "coaching_coach_actions_select_own"
  on public.coaching_coach_actions for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_coach_actions_insert_own"
  on public.coaching_coach_actions for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "coaching_coach_actions_update_own"
  on public.coaching_coach_actions for update
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
