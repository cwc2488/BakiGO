-- Coaching Product Correction P0/P1
-- Additive only. Does not rewrite Phase 2f/3/4 authority tables.

-- ---------------------------------------------------------------------------
-- Enrollment planned end (journey window)
-- started_at remains start authority (date part = Day 1)
-- planned_end_at = inclusive last calendar day of journey (default start+89)
-- ended_at remains completion timestamp when status=completed
-- ---------------------------------------------------------------------------

alter table public.coaching_enrollments
  add column if not exists planned_end_at date;

comment on column public.coaching_enrollments.planned_end_at is
  'Inclusive journey end date (Asia/Taipei calendar). Null = derive from started_at + 89 days.';

-- Backfill existing rows: started_at date + 89 days
update public.coaching_enrollments
set planned_end_at = (timezone('Asia/Taipei', started_at))::date + 89
where planned_end_at is null;

-- ---------------------------------------------------------------------------
-- Coach directives V1 — multiple slot-scoped instructions
-- ---------------------------------------------------------------------------

alter table public.coaching_coach_directives
  add column if not exists meal_slot text,
  add column if not exists effective_until date,
  add column if not exists status text,
  add column if not exists customer_visible boolean;

update public.coaching_coach_directives
set
  meal_slot = coalesce(meal_slot, 'general'),
  status = coalesce(status, 'active'),
  customer_visible = coalesce(customer_visible, true)
where meal_slot is null or status is null or customer_visible is null;

alter table public.coaching_coach_directives
  alter column meal_slot set default 'general',
  alter column status set default 'active',
  alter column customer_visible set default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'coaching_coach_directives_meal_slot_check'
  ) then
    alter table public.coaching_coach_directives
      add constraint coaching_coach_directives_meal_slot_check
      check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack', 'general'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'coaching_coach_directives_status_check'
  ) then
    alter table public.coaching_coach_directives
      add constraint coaching_coach_directives_status_check
      check (status in ('active', 'paused', 'completed'));
  end if;
end $$;

-- Allow multiple directives per enrollment (drop single-row unique)
drop index if exists public.coaching_coach_directives_one_active_per_enrollment_idx;

create index if not exists coaching_coach_directives_active_slot_idx
  on public.coaching_coach_directives (enrollment_id, status, meal_slot, effective_from desc);
