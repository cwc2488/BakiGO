-- NOTE: Renumbered onto fix/regression-pack-01 lineage (recognition occupies 035–045).
-- Content is idempotent / additive; safe if Production already applied the original 035–043 quiz/21d set.

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
