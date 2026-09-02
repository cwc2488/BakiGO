-- NOTE: Renumbered onto fix/regression-pack-01 lineage (recognition occupies 035–045).
-- Content is idempotent / additive; safe if Production already applied the original 035–043 quiz/21d set.

-- QUIZ-PARTNER-01: crawler-safe human landing views for partner /q/{code} funnel.
-- Client POST only. Do not insert from server GET /q/{code} or Open Graph crawlers.
-- Service-role only. Does not change 038/039.

create table if not exists public.quiz_partner_landing_views (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  share_code text not null,
  created_at timestamptz not null default now()
);

create index if not exists quiz_partner_landing_views_owner_idx
  on public.quiz_partner_landing_views (owner_member_id, created_at desc);

create index if not exists quiz_partner_landing_views_code_idx
  on public.quiz_partner_landing_views (share_code, created_at desc);

comment on table public.quiz_partner_landing_views is
  'QUIZ-PARTNER-01 human landing views for partner short links. Never count social crawler OG fetches.';

alter table public.quiz_partner_landing_views enable row level security;

revoke all on table public.quiz_partner_landing_views from anon, authenticated;
grant all on table public.quiz_partner_landing_views to service_role;
