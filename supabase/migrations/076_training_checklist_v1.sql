-- TRAINING-CHECKLIST-V1: Master training items, optional learning-library links, upline sign-offs.
-- Additive only. Service-role API access. Does not alter organization / learning library tables.

create table if not exists public.training_items (
  id uuid primary key default gen_random_uuid(),
  item_key text not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_items_key_format check (item_key ~ '^[a-z0-9_]{2,64}$'),
  constraint training_items_name_len check (char_length(name) between 1 and 80)
);

create unique index if not exists training_items_item_key_uidx
  on public.training_items (item_key);

create index if not exists training_items_active_sort_idx
  on public.training_items (is_active, sort_order, name);

comment on table public.training_items is
  'TRAINING-CHECKLIST-V1 master training checklist items. Prefer is_active=false over destructive delete.';

-- Optional links to in-code Learning Library resource ids (LEARNING_RESOURCE_CATALOG.id).
-- Not a FK: learning library is application catalog, not a DB table.
create table if not exists public.training_item_learning_links (
  id uuid primary key default gen_random_uuid(),
  training_item_id uuid not null references public.training_items (id) on delete cascade,
  learning_resource_id text not null,
  created_at timestamptz not null default now(),
  constraint training_item_learning_links_resource_len check (
    char_length(learning_resource_id) between 1 and 80
  )
);

create unique index if not exists training_item_learning_links_uidx
  on public.training_item_learning_links (training_item_id, learning_resource_id);

create index if not exists training_item_learning_links_item_idx
  on public.training_item_learning_links (training_item_id);

comment on table public.training_item_learning_links is
  'TRAINING-CHECKLIST-V1 optional admin-managed links from training items to Learning Library catalog ids. Reading content never completes training.';

create table if not exists public.training_signoffs (
  id uuid primary key default gen_random_uuid(),
  training_item_id uuid not null references public.training_items (id) on delete restrict,
  trainee_member_id uuid not null references public.members (id) on delete cascade,
  signer_member_id uuid not null references public.members (id) on delete restrict,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_signoffs_no_self check (trainee_member_id <> signer_member_id)
);

create unique index if not exists training_signoffs_trainee_item_uidx
  on public.training_signoffs (trainee_member_id, training_item_id);

create index if not exists training_signoffs_trainee_idx
  on public.training_signoffs (trainee_member_id, signed_at desc);

create index if not exists training_signoffs_signer_idx
  on public.training_signoffs (signer_member_id, signed_at desc);

create index if not exists training_signoffs_item_idx
  on public.training_signoffs (training_item_id);

comment on table public.training_signoffs is
  'TRAINING-CHECKLIST-V1 upline sign-offs. Signer identity must come from authenticated session — never trust client-provided signer id.';

comment on column public.training_signoffs.signer_member_id is
  'Upline who signed. Set server-side from session member id only.';

alter table public.training_items enable row level security;
alter table public.training_item_learning_links enable row level security;
alter table public.training_signoffs enable row level security;

revoke all on table public.training_items from anon, authenticated;
revoke all on table public.training_item_learning_links from anon, authenticated;
revoke all on table public.training_signoffs from anon, authenticated;

grant all on table public.training_items to service_role;
grant all on table public.training_item_learning_links to service_role;
grant all on table public.training_signoffs to service_role;

-- Seed 25 V1 master items (idempotent by item_key). No Learning Library mappings seeded.
insert into public.training_items (item_key, name, sort_order, is_active)
values
  ('open_list_referral', '開名單轉介紹', 1, true),
  ('active_rod_1', '主動釣竿（1）', 2, true),
  ('active_rod_2', '主動釣竿（2）', 3, true),
  ('passive_rod_1', '被動釣竿（1）', 4, true),
  ('hom', 'HOM', 5, true),
  ('sts', 'STS', 6, true),
  ('business_opportunity', '商機', 7, true),
  ('monthly_meeting', '月會', 8, true),
  ('ninety_day_action_plan', '90天行動計畫', 9, true),
  ('marketing_plan', '市場行銷計畫', 10, true),
  ('branch_tour_5', '分店巡禮5家', 11, true),
  ('mark_herbalife_culture', '馬克培訓／賀寶芙文化', 12, true),
  ('lihpao_achievement_camp', '麗寶成就營', 13, true),
  ('pingtung_star_villa', '屏東摘星山莊', 14, true),
  ('ems_experience', 'EMS 體驗', 15, true),
  ('trampoline_experience', '跳床體驗', 16, true),
  ('scalp_therapy_experience', '頭療體驗', 17, true),
  ('xpro_deep_nutrition', 'XPRO 深度營養培訓', 18, true),
  ('beu_experience', 'BeU 體驗', 19, true),
  ('promotion_abc', '促銷 ABC', 20, true),
  ('pre_meeting_graphic', '會前會圖製作', 21, true),
  ('meet_top_performers', '認識績優組', 22, true),
  ('closing_consultation', '締結諮詢', 23, true),
  ('after_sales_service', '售後服務', 24, true),
  ('invite_meeting', '邀約會議', 25, true)
on conflict (item_key) do nothing;
