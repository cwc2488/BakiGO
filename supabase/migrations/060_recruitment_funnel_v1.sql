-- RECRUIT-FUNNEL-01: Partner recruitment share links + independent recruitment leads.
-- Additive only. Service-role writes for public submit; member/admin via API + service role.

create table if not exists public.recruitment_share_links (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  share_code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint recruitment_share_links_code_format check (share_code ~ '^[A-Z0-9]{6,12}$')
);

create unique index if not exists recruitment_share_links_code_uidx
  on public.recruitment_share_links (share_code);

create unique index if not exists recruitment_share_links_one_active_per_owner_uidx
  on public.recruitment_share_links (owner_member_id)
  where is_active = true;

create index if not exists recruitment_share_links_owner_idx
  on public.recruitment_share_links (owner_member_id, created_at desc);

comment on table public.recruitment_share_links is
  'RECRUIT-FUNNEL-01 permanent opaque /join/{code} links. owner_member_id is canonical partner identity (members.id).';

create table if not exists public.recruitment_leads (
  id uuid primary key default gen_random_uuid(),
  partner_member_id uuid not null references public.members (id) on delete restrict,
  share_code text not null,
  name text not null,
  age_range text not null,
  city text not null,
  district text not null,
  work_status text not null,
  motivations jsonb not null default '[]'::jsonb,
  weekly_availability text not null,
  instagram text,
  line_id text,
  phone text,
  contact_fingerprint text not null,
  status text not null default 'new',
  consent_accepted_at timestamptz not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_path text,
  referrer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruitment_leads_status_check check (
    status in ('new', 'contacted', 'follow_up', 'not_fit')
  ),
  constraint recruitment_leads_name_len check (char_length(name) between 1 and 80),
  constraint recruitment_leads_motivations_is_array check (jsonb_typeof(motivations) = 'array')
);

create index if not exists recruitment_leads_partner_created_idx
  on public.recruitment_leads (partner_member_id, created_at desc);

create index if not exists recruitment_leads_status_idx
  on public.recruitment_leads (status, created_at desc);

create index if not exists recruitment_leads_fingerprint_idx
  on public.recruitment_leads (partner_member_id, contact_fingerprint, created_at desc);

comment on table public.recruitment_leads is
  'RECRUIT-FUNNEL-01 independent recruitment leads. Not customers, radar candidates, quiz responses, or enrollments.';

comment on column public.recruitment_leads.partner_member_id is
  'Canonical Partner owner (members.id). Resolved server-side from share_code only — never from client UUID.';

alter table public.recruitment_share_links enable row level security;
alter table public.recruitment_leads enable row level security;

revoke all on table public.recruitment_share_links from anon, authenticated;
revoke all on table public.recruitment_leads from anon, authenticated;
grant all on table public.recruitment_share_links to service_role;
grant all on table public.recruitment_leads to service_role;
