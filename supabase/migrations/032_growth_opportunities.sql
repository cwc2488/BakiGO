-- Phase 4c/4e: Growth Opportunities + Customer Experience Check-ins
-- Replaces unapplied draft referral_opportunities with growth_opportunities.
-- Outcome Signal remains derive-only. Share / invite / attribution out of scope.

-- ---------------------------------------------------------------------------
-- customer_experience_checkins (Experience authority)
-- ---------------------------------------------------------------------------
create table if not exists public.customer_experience_checkins (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  enrollment_id uuid references public.coaching_enrollments (id) on delete set null,
  trigger_reason text not null
    check (trigger_reason in (
      'scheduled', 'post_measurement', 'milestone', 'coach_invite', 'recheck', 'major_breakthrough'
    )),
  as_of_log_date date not null,
  outcome_perception smallint
    check (outcome_perception is null or (outcome_perception between 1 and 5)),
  coach_helpfulness smallint
    check (coach_helpfulness is null or (coach_helpfulness between 1 and 5)),
  experience_satisfaction smallint
    check (experience_satisfaction is null or (experience_satisfaction between 1 and 5)),
  recommendation_willingness smallint
    check (recommendation_willingness is null or (recommendation_willingness between 0 and 10)),
  most_felt_change_text text,
  most_felt_change_consent text not null default 'coach_only'
    check (most_felt_change_consent in ('coach_only', 'share_ok')),
  explicit_referral_intent boolean not null default false,
  struggle_flag boolean not null default false,
  decline_growth_ask boolean not null default false,
  source text not null default 'portal'
    check (source in ('portal', 'in_app_future', 'coach_assisted_capture')),
  responded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_experience_checkins_customer_idx
  on public.customer_experience_checkins (customer_id, responded_at desc);

create index if not exists customer_experience_checkins_enrollment_idx
  on public.customer_experience_checkins (enrollment_id, responded_at desc);

create index if not exists customer_experience_checkins_owner_idx
  on public.customer_experience_checkins (owner_member_id, responded_at desc);

alter table public.customer_experience_checkins enable row level security;

-- Coach can read/update own rows. Portal writes go through service-role API after token resolve.
create policy "customer_experience_checkins_select_own"
  on public.customer_experience_checkins for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "customer_experience_checkins_insert_own"
  on public.customer_experience_checkins for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "customer_experience_checkins_update_own"
  on public.customer_experience_checkins for update
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

-- ---------------------------------------------------------------------------
-- growth_opportunities (Coach-only Growth eligibility)
-- ---------------------------------------------------------------------------
create table if not exists public.growth_opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  enrollment_id uuid references public.coaching_enrollments (id) on delete set null,
  readiness text not null
    check (readiness in ('emerging', 'strong')),
  status text not null default 'open'
    check (status in ('open', 'acted', 'snoozed', 'declined', 'converted', 'expired', 'superseded')),
  fingerprint text not null,
  celebration_class text not null default 'none'
    check (celebration_class in ('none', 'soft', 'clear')),
  outcome_status_snapshot text not null,
  measurement_stage_snapshot text not null,
  outcome_band_snapshot text not null default 'unknown',
  experience_band_snapshot text not null default 'unknown',
  pathway_snapshot text not null default 'none',
  primary_growth_path text
    check (primary_growth_path is null or primary_growth_path in (
      'coach_assisted_referral', 'social_proof', 'friend_benefit'
    )),
  secondary_paths_json jsonb not null default '[]'::jsonb,
  source_checkin_id uuid references public.customer_experience_checkins (id) on delete set null,
  evidence_json jsonb not null default '[]'::jsonb,
  supporting_signals_json jsonb not null default '[]'::jsonb,
  blocked_reasons_json jsonb not null default '[]'::jsonb,
  snooze_until timestamptz,
  expires_at timestamptz,
  superseded_by uuid references public.growth_opportunities (id) on delete set null,
  last_evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists growth_opportunities_owner_customer_idx
  on public.growth_opportunities (owner_member_id, customer_id, updated_at desc);

create index if not exists growth_opportunities_fingerprint_idx
  on public.growth_opportunities (customer_id, fingerprint, updated_at desc);

create index if not exists growth_opportunities_open_idx
  on public.growth_opportunities (owner_member_id, status, updated_at desc)
  where status in ('open', 'snoozed');

alter table public.growth_opportunities enable row level security;

-- Coach SELECT/INSERT/UPDATE own rows only. No DELETE.
-- Customer anon: no policies → no access. Service role bypasses RLS.

create policy "growth_opportunities_select_own"
  on public.growth_opportunities for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "growth_opportunities_insert_own"
  on public.growth_opportunities for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "growth_opportunities_update_own"
  on public.growth_opportunities for update
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
