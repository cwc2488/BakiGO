-- Phase 4f: Growth shares + referral attribution (A→B)
-- Does not rewrite Phase 2f Outcome or Phase 4e Growth Matrix authority.
-- Public access is service-role after token_hash verify — no anon table policies.
-- Idempotent: safe to re-run (IF NOT EXISTS + DROP POLICY IF EXISTS).

-- ---------------------------------------------------------------------------
-- growth_shares
-- ---------------------------------------------------------------------------
create table if not exists public.growth_shares (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  introducer_customer_id uuid not null references public.customers (id) on delete cascade,
  enrollment_id uuid references public.coaching_enrollments (id) on delete set null,
  growth_opportunity_id uuid references public.growth_opportunities (id) on delete set null,
  share_type text not null
    check (share_type in ('outcome_share', 'coach_referral', 'friend_benefit')),
  token_hash text not null,
  status text not null default 'pending_consent'
    check (status in ('pending_consent', 'active', 'paused', 'revoked', 'expired', 'declined')),
  consent_snapshot_json jsonb not null default '{}'::jsonb,
  public_display_json jsonb not null default '{}'::jsonb,
  benefit_json jsonb not null default '{}'::jsonb,
  customer_declined_at timestamptz,
  activated_at timestamptz,
  revoked_at timestamptz,
  paused_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growth_shares_token_hash_unique unique (token_hash)
);

create index if not exists growth_shares_owner_idx
  on public.growth_shares (owner_member_id, created_at desc);

create index if not exists growth_shares_introducer_idx
  on public.growth_shares (introducer_customer_id, status);

create index if not exists growth_shares_opportunity_idx
  on public.growth_shares (growth_opportunity_id)
  where growth_opportunity_id is not null;

create index if not exists growth_shares_active_token_idx
  on public.growth_shares (token_hash)
  where status = 'active';

alter table public.growth_shares enable row level security;

drop policy if exists "growth_shares_select_own" on public.growth_shares;
create policy "growth_shares_select_own"
  on public.growth_shares for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "growth_shares_insert_own" on public.growth_shares;
create policy "growth_shares_insert_own"
  on public.growth_shares for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "growth_shares_update_own" on public.growth_shares;
create policy "growth_shares_update_own"
  on public.growth_shares for update
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
-- growth_referral_attributions
-- ---------------------------------------------------------------------------
create table if not exists public.growth_referral_attributions (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  share_id uuid not null references public.growth_shares (id) on delete cascade,
  introducer_customer_id uuid not null references public.customers (id) on delete cascade,
  introduced_customer_id uuid references public.customers (id) on delete set null,
  status text not null default 'visited'
    check (status in ('visited', 'interested', 'submitted', 'customer_created', 'declined')),
  lead_display_name text,
  lead_phone text,
  lead_line_id text,
  lead_goal_text text,
  linked_existing_customer boolean not null default false,
  coach_handled_at timestamptz,
  first_touch_at timestamptz not null default now(),
  interested_at timestamptz,
  submitted_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists growth_referral_attributions_owner_idx
  on public.growth_referral_attributions (owner_member_id, created_at desc);

create index if not exists growth_referral_attributions_share_idx
  on public.growth_referral_attributions (share_id, created_at desc);

create index if not exists growth_referral_attributions_introducer_idx
  on public.growth_referral_attributions (introducer_customer_id, created_at desc);

create index if not exists growth_referral_attributions_needs_coach_idx
  on public.growth_referral_attributions (owner_member_id, status, submitted_at desc)
  where status in ('submitted', 'customer_created') and coach_handled_at is null;

create index if not exists growth_referral_attributions_phone_owner_idx
  on public.growth_referral_attributions (owner_member_id, lead_phone)
  where lead_phone is not null;

alter table public.growth_referral_attributions enable row level security;

drop policy if exists "growth_referral_attributions_select_own" on public.growth_referral_attributions;
create policy "growth_referral_attributions_select_own"
  on public.growth_referral_attributions for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "growth_referral_attributions_insert_own" on public.growth_referral_attributions;
create policy "growth_referral_attributions_insert_own"
  on public.growth_referral_attributions for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "growth_referral_attributions_update_own" on public.growth_referral_attributions;
create policy "growth_referral_attributions_update_own"
  on public.growth_referral_attributions for update
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
