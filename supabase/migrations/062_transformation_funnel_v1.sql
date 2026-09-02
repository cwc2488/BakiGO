-- TRANSFORMATION-FUNNEL-01: Owner-only transformation share links + independent transformation leads.
-- Additive only. Service-role writes for public submit; owner admin via API + service role.

create table if not exists public.transformation_share_links (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  share_code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint transformation_share_links_code_format check (share_code ~ '^[A-Z0-9]{6,12}$')
);

create unique index if not exists transformation_share_links_code_uidx
  on public.transformation_share_links (share_code);

create unique index if not exists transformation_share_links_one_active_per_owner_uidx
  on public.transformation_share_links (owner_member_id)
  where is_active = true;

create index if not exists transformation_share_links_owner_idx
  on public.transformation_share_links (owner_member_id, created_at desc);

comment on table public.transformation_share_links is
  'TRANSFORMATION-FUNNEL-01 opaque /transform/{code} links. V1 owner-only; owner_member_id is canonical partner identity (members.id).';

create table if not exists public.transformation_leads (
  id uuid primary key default gen_random_uuid(),
  owner_partner_id uuid not null references public.members (id) on delete restrict,
  share_code text not null,
  name text not null,
  phone text not null,
  social_contact text,
  goal text not null,
  target_area_or_problem text not null,
  pain_point text not null,
  contact_fingerprint text not null,
  status text not null default 'new',
  lost_reason text,
  notes text,
  customer_id uuid references public.customers (id) on delete set null,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  campaign_id text,
  adset_id text,
  ad_id text,
  placement text,
  landing_page_version text not null default 'LP_A',
  landing_path text,
  referrer text,
  consent_accepted_at timestamptz not null,
  contacted_at timestamptz,
  qualified_at timestamptz,
  appointment_at timestamptz,
  showed_at timestamptz,
  converted_at timestamptz,
  lost_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transformation_leads_status_check check (
    status in ('new', 'contacted', 'qualified', 'appointment', 'showed', 'converted', 'lost')
  ),
  constraint transformation_leads_lost_reason_check check (
    lost_reason is null
    or lost_reason in (
      'unreachable',
      'no_interest',
      'price',
      'distance',
      'schedule',
      'not_qualified',
      'duplicate',
      'other'
    )
  ),
  constraint transformation_leads_name_len check (char_length(name) between 1 and 80),
  constraint transformation_leads_phone_len check (char_length(phone) between 8 and 20),
  constraint transformation_leads_goal_len check (char_length(goal) between 1 and 80),
  constraint transformation_leads_target_len check (char_length(target_area_or_problem) between 1 and 500),
  constraint transformation_leads_pain_len check (char_length(pain_point) between 1 and 120)
);

create index if not exists transformation_leads_owner_created_idx
  on public.transformation_leads (owner_partner_id, created_at desc);

create index if not exists transformation_leads_status_idx
  on public.transformation_leads (status, created_at desc);

create index if not exists transformation_leads_fingerprint_idx
  on public.transformation_leads (owner_partner_id, contact_fingerprint, created_at desc);

create index if not exists transformation_leads_customer_idx
  on public.transformation_leads (customer_id)
  where customer_id is not null;

comment on table public.transformation_leads is
  'TRANSFORMATION-FUNNEL-01 independent consumer transformation leads. Not recruitment leads, customers, or radar candidates.';

comment on column public.transformation_leads.owner_partner_id is
  'Canonical Partner owner (members.id). Resolved server-side from share_code only — never from client UUID.';

comment on column public.transformation_leads.customer_id is
  'Optional linked customer after status = converted only.';

alter table public.transformation_share_links enable row level security;
alter table public.transformation_leads enable row level security;

revoke all on table public.transformation_share_links from anon, authenticated;
revoke all on table public.transformation_leads from anon, authenticated;
grant all on table public.transformation_share_links to service_role;
grant all on table public.transformation_leads to service_role;
