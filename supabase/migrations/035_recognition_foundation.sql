-- Recognition Center Foundation
-- Phase 3: catalog, events, event awards, admin allowlist
--
-- Additive only. Does NOT modify: members, organization_relationships,
-- coaching_*, quiz_*, customers, rank logic, or any existing table.
--
-- Note: Recognition award definitions are a SEPARATE domain from career rank keys.
-- They must not be confused with RANK_KEYS (map/supervisor/world_team/...).

-- ---------------------------------------------------------------------------
-- recognition_award_definitions
-- Global catalog of recognition awards. Default 27 items are seeded below.
-- Extensible: admins may add, disable, and reorder items in the future.
-- ---------------------------------------------------------------------------

create table if not exists public.recognition_award_definitions (
  id            uuid        primary key default gen_random_uuid(),
  slug          text        not null,
  name          text        not null,
  requires_photo boolean    not null default false,
  layout_hint   text        not null default 'name_list'
                            check (layout_hint in ('name_list', 'photo_grid', 'photo_hero', 'premium')),
  sort_order    integer     not null,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint recognition_award_definitions_slug_unique unique (slug)
);

create index if not exists recognition_award_definitions_sort_idx
  on public.recognition_award_definitions (sort_order)
  where is_active = true;

comment on table public.recognition_award_definitions is
  'Recognition Center award catalog. Extensible. Not related to BakiGO career rank keys.';

-- ---------------------------------------------------------------------------
-- recognition_ppt_themes
-- Theme/visual config table, separated from roster data.
-- ---------------------------------------------------------------------------

create table if not exists public.recognition_ppt_themes (
  id            uuid        primary key default gen_random_uuid(),
  slug          text        not null unique,
  name          text        not null,
  aspect_ratio  text        not null default '4:3',
  config_json   jsonb       not null default '{}'::jsonb,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.recognition_ppt_themes is
  'PPT theme configuration, separate from recognition roster data.';

-- ---------------------------------------------------------------------------
-- recognition_admin_members
-- Explicit Recognition Admin allowlist.
-- NOT inferred from president rank or any career rank.
-- ---------------------------------------------------------------------------

create table if not exists public.recognition_admin_members (
  member_id         uuid        primary key references public.members (id) on delete cascade,
  granted_by_member_id uuid     references public.members (id) on delete set null,
  is_active         boolean     not null default true,
  granted_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.recognition_admin_members is
  'Recognition Center admin allowlist. Permission is explicit; president rank does NOT grant access.';

-- ---------------------------------------------------------------------------
-- recognition_events
-- Primary Recognition Center event entity.
-- IMPORTANT: NO unique constraint on (year, month).
-- Multiple events in the same month are intentional and allowed.
-- ---------------------------------------------------------------------------

create table if not exists public.recognition_events (
  id                    uuid        primary key default gen_random_uuid(),
  name                  text        not null,
  year                  integer     not null check (year >= 2000 and year <= 2100),
  month                 integer     not null check (month >= 1 and month <= 12),
  collect_starts_at     timestamptz,
  collect_ends_at       timestamptz,
  status                text        not null default 'draft'
                                    check (status in ('draft', 'collecting', 'closed', 'archived')),
  ppt_theme_id          uuid        references public.recognition_ppt_themes (id) on delete set null,
  -- future template lineage (nullable for template-compatibility without requiring it now)
  event_template_id     uuid,
  -- copy-from lineage
  copied_from_event_id  uuid        references public.recognition_events (id) on delete set null,
  created_by_member_id  uuid        references public.members (id) on delete set null,
  closed_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- collection window must be internally consistent if both are provided
  constraint recognition_events_collection_window_check
    check (collect_ends_at is null or collect_starts_at is null or collect_ends_at >= collect_starts_at)
);

-- NO unique on (year, month) -- multiple events per month are intentional
create index if not exists recognition_events_year_month_idx
  on public.recognition_events (year desc, month desc);

create index if not exists recognition_events_status_idx
  on public.recognition_events (status);

create index if not exists recognition_events_created_by_idx
  on public.recognition_events (created_by_member_id);

comment on table public.recognition_events is
  'Recognition Center event entity. year+month are attributes, not a unique key; multiple events per month are intentional.';

-- ---------------------------------------------------------------------------
-- recognition_event_awards
-- Event-specific snapshot/configuration of enabled awards + ordering.
-- Populated from the active catalog when the event is created.
-- Future catalog changes do NOT silently destroy historical event config.
-- ---------------------------------------------------------------------------

create table if not exists public.recognition_event_awards (
  id                    uuid        primary key default gen_random_uuid(),
  event_id              uuid        not null references public.recognition_events (id) on delete cascade,
  award_definition_id   uuid        not null references public.recognition_award_definitions (id) on delete restrict,
  sort_order            integer     not null,
  is_enabled            boolean     not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint recognition_event_awards_event_award_unique unique (event_id, award_definition_id)
);

create index if not exists recognition_event_awards_event_sort_idx
  on public.recognition_event_awards (event_id, sort_order);

comment on table public.recognition_event_awards is
  'Event-specific award configuration. Populated from catalog at event creation; future catalog changes do not affect saved event config.';

-- ---------------------------------------------------------------------------
-- RLS
-- All tables: RLS on, zero anon policies, zero broad authenticated policies.
-- Access is via service-role API + server-side Recognition Admin check.
-- ---------------------------------------------------------------------------

alter table public.recognition_award_definitions  enable row level security;
alter table public.recognition_ppt_themes         enable row level security;
alter table public.recognition_admin_members      enable row level security;
alter table public.recognition_events             enable row level security;
alter table public.recognition_event_awards       enable row level security;

-- No anon policies.
-- No authenticated table policies for general members.
-- All writes and reads go through Next.js service-role API routes.

-- ---------------------------------------------------------------------------
-- Seed: default PPT theme
-- ---------------------------------------------------------------------------

insert into public.recognition_ppt_themes (id, slug, name, aspect_ratio, config_json, is_active)
values (
  'a1000000-0000-0000-0000-000000000001',
  'default-4-3',
  '預設 4:3',
  '4:3',
  '{"background":"#ffffff","primary":"#1d1d1f","accent":"#248a3d"}'::jsonb,
  true
)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: default 27 Recognition Center award definitions
-- These are catalog entries for the Recognition Center domain.
-- They are NOT career rank keys and must NOT be confused with RANK_KEYS.
-- ---------------------------------------------------------------------------

insert into public.recognition_award_definitions
  (slug, name, requires_photo, layout_hint, sort_order)
values
  ('map_month_1',             'MAP 第一個月',                     false, 'name_list',   1),
  ('map_month_2',             'MAP 第二個月',                     false, 'name_list',   2),
  ('map_month_3_pass',        'MAP 第三個月',                     true,  'photo_grid',  3),
  ('new_supervisor',          '新科督導',                          true,  'photo_grid',  4),
  ('world_team_month_1',      '世界組第一個月',                   false, 'name_list',   5),
  ('world_team_month_2',      '世界組第二個月',                   false, 'name_list',   6),
  ('world_team_month_3',      '世界組第三個月',                   false, 'name_list',   7),
  ('new_world_team_pass',     '新科世界組（第四個月過關）',        true,  'photo_grid',  8),
  ('world_team_1pct',         '1%世界組',                         true,  'photo_grid',  9),
  ('club_5k',                 '5K俱樂部',                         true,  'photo_grid', 10),
  ('top_10000',               '萬點高手',                         true,  'photo_grid', 11),
  ('promo_month_1',           '推廣組第一個月',                   false, 'name_list',  12),
  ('promo_month_2',           '推廣組第二個月',                   false, 'name_list',  13),
  ('new_promo_pass',          '新科推廣組',                        true,  'photo_grid', 14),
  ('ro2500_promo_month_1',    'RO2500推廣組第一個月',             false, 'name_list',  15),
  ('ro2500_promo_month_2',    'RO2500推廣組第二個月',             false, 'name_list',  16),
  ('new_ro2500_promo_pass',   '新科RO2500推廣組',                 true,  'photo_grid', 17),
  ('wealth_month_1',          '富豪組第一個月',                   false, 'name_list',  18),
  ('wealth_month_2',          '富豪組第二個月',                   false, 'name_list',  19),
  ('new_wealth_pass',         '新科富豪組',                        true,  'photo_grid', 20),
  ('ro7500_wealth_month_1',   'RO7500富豪組第一個月',             false, 'name_list',  21),
  ('ro7500_wealth_month_2',   'RO7500富豪組第二個月',             false, 'name_list',  22),
  ('ro7500_wealth_pass',      'RO7500富豪組',                     true,  'photo_grid', 23),
  ('president_month_1',       '總裁組第一個月',                   false, 'name_list',  24),
  ('president_month_2',       '總裁組第二個月',                   false, 'name_list',  25),
  ('new_president_pass',      '新科總裁組',                        true,  'photo_grid', 26),
  ('million_lifetime',        '百萬終生成就獎',                   true,  'premium',    27)
on conflict (slug) do nothing;
