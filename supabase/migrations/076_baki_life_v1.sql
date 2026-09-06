-- BAKI-LIFE-01: Owner-only private Life OS (accounts, ledger, goals, snapshots).
-- Additive only. Service-role access; API enforces Super Admin (Owner).

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table if not exists public.life_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  name text not null,
  account_type text not null,
  status text not null default 'active',
  currency_code text not null default 'TWD',
  balance_cents bigint not null default 0,
  parent_account_id uuid references public.life_accounts (id) on delete set null,
  linked_goal_id uuid,
  default_payment_account_id uuid references public.life_accounts (id) on delete set null,
  icon text,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint life_accounts_name_len check (char_length(name) between 1 and 80),
  constraint life_accounts_type_check check (
    account_type in ('bank', 'cash', 'e_payment', 'credit_card', 'goal_pocket')
  ),
  constraint life_accounts_status_check check (status in ('active', 'archived')),
  constraint life_accounts_currency_check check (currency_code = 'TWD')
);

create index if not exists life_accounts_owner_sort_idx
  on public.life_accounts (owner_member_id, status, sort_order, created_at);

create index if not exists life_accounts_parent_idx
  on public.life_accounts (parent_account_id)
  where parent_account_id is not null;

comment on table public.life_accounts is
  'BAKI-LIFE-01 Owner private accounts (bank/cash/e-pay/credit/goal pocket). balance_cents for credit_card is liability owed.';

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table if not exists public.life_categories (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  kind text not null,
  name text not null,
  icon text,
  status text not null default 'active',
  sort_order integer not null default 0,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint life_categories_kind_check check (kind in ('income', 'expense')),
  constraint life_categories_status_check check (status in ('active', 'archived')),
  constraint life_categories_name_len check (char_length(name) between 1 and 60)
);

create index if not exists life_categories_owner_kind_idx
  on public.life_categories (owner_member_id, kind, status, sort_order);

comment on table public.life_categories is
  'BAKI-LIFE-01 Owner-custom income/expense categories. Archive instead of hard delete when used.';

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------
create table if not exists public.life_goals (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  title text not null,
  description text,
  icon text,
  target_amount_cents bigint,
  prepared_amount_cents bigint not null default 0,
  target_date date,
  status text not null default 'planning',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint life_goals_title_len check (char_length(title) between 1 and 120),
  constraint life_goals_status_check check (
    status in ('planning', 'active', 'paused', 'completed', 'archived')
  ),
  constraint life_goals_amounts_nonneg check (
    (target_amount_cents is null or target_amount_cents >= 0)
    and prepared_amount_cents >= 0
  )
);

create index if not exists life_goals_owner_sort_idx
  on public.life_goals (owner_member_id, status, sort_order, created_at);

comment on table public.life_goals is
  'BAKI-LIFE-01 Life goals. Independent from goal_pocket accounts; pocket may optionally link via life_accounts.linked_goal_id.';

-- FK from accounts.linked_goal_id after goals exist
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'life_accounts_linked_goal_fk'
  ) then
    alter table public.life_accounts
      add constraint life_accounts_linked_goal_fk
      foreign key (linked_goal_id) references public.life_goals (id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Transactions (ledger)
-- ---------------------------------------------------------------------------
create table if not exists public.life_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  kind text not null,
  amount_cents bigint not null,
  currency_code text not null default 'TWD',
  occurred_at timestamptz not null,
  category_id uuid references public.life_categories (id) on delete restrict,
  account_id uuid references public.life_accounts (id) on delete restrict,
  counterparty_account_id uuid references public.life_accounts (id) on delete restrict,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint life_transactions_kind_check check (
    kind in ('income', 'expense', 'transfer', 'credit_payment', 'credit_refund')
  ),
  constraint life_transactions_amount_positive check (amount_cents > 0),
  constraint life_transactions_currency_check check (currency_code = 'TWD'),
  constraint life_transactions_note_len check (note is null or char_length(note) <= 500),
  constraint life_transactions_income_shape check (
    kind <> 'income'
    or (category_id is not null and account_id is not null and counterparty_account_id is null)
  ),
  constraint life_transactions_expense_shape check (
    kind <> 'expense'
    or (category_id is not null and account_id is not null and counterparty_account_id is null)
  ),
  constraint life_transactions_transfer_shape check (
    kind <> 'transfer'
    or (
      category_id is null
      and account_id is not null
      and counterparty_account_id is not null
      and account_id <> counterparty_account_id
    )
  ),
  constraint life_transactions_credit_payment_shape check (
    kind <> 'credit_payment'
    or (
      category_id is null
      and account_id is not null
      and counterparty_account_id is not null
      and account_id <> counterparty_account_id
    )
  ),
  constraint life_transactions_credit_refund_shape check (
    kind <> 'credit_refund'
    or (account_id is not null)
  )
);

create index if not exists life_transactions_owner_occurred_idx
  on public.life_transactions (owner_member_id, occurred_at desc);

create index if not exists life_transactions_owner_kind_occurred_idx
  on public.life_transactions (owner_member_id, kind, occurred_at desc);

create index if not exists life_transactions_account_idx
  on public.life_transactions (account_id, occurred_at desc);

create index if not exists life_transactions_category_idx
  on public.life_transactions (category_id, occurred_at desc)
  where category_id is not null;

comment on table public.life_transactions is
  'BAKI-LIFE-01 Ledger. income/expense affect stats; transfer/credit_payment do not. expense on credit_card increases liability.';

comment on column public.life_transactions.account_id is
  'Primary account: income destination, expense source (or CC), transfer FROM, credit_payment FROM bank, credit_refund CC.';

comment on column public.life_transactions.counterparty_account_id is
  'Transfer TO / credit_payment TO credit card.';

-- ---------------------------------------------------------------------------
-- Snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.life_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  captured_at timestamptz not null,
  note text,
  total_assets_cents bigint not null,
  total_liabilities_cents bigint not null,
  net_worth_cents bigint not null,
  previous_snapshot_id uuid references public.life_snapshots (id) on delete set null,
  period_income_cents bigint not null default 0,
  period_expense_cents bigint not null default 0,
  theoretical_net_cents bigint,
  unrecorded_expense_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint life_snapshots_note_len check (note is null or char_length(note) <= 500)
);

create index if not exists life_snapshots_owner_captured_idx
  on public.life_snapshots (owner_member_id, captured_at desc);

create table if not exists public.life_snapshot_balances (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.life_snapshots (id) on delete cascade,
  account_id uuid not null references public.life_accounts (id) on delete restrict,
  balance_cents bigint not null,
  unique (snapshot_id, account_id)
);

create index if not exists life_snapshot_balances_snapshot_idx
  on public.life_snapshot_balances (snapshot_id);

comment on table public.life_snapshots is
  'BAKI-LIFE-01 Monthly (or ad-hoc) financial snapshots. unrecorded_expense_cents = max(0, theoretical − actual net).';

-- ---------------------------------------------------------------------------
-- Preferences (recent account for quick entry, seed flag)
-- ---------------------------------------------------------------------------
create table if not exists public.life_preferences (
  owner_member_id uuid primary key references public.members (id) on delete cascade,
  seeded_at timestamptz,
  last_expense_account_id uuid references public.life_accounts (id) on delete set null,
  last_income_account_id uuid references public.life_accounts (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: service-role only
-- ---------------------------------------------------------------------------
alter table public.life_accounts enable row level security;
alter table public.life_categories enable row level security;
alter table public.life_goals enable row level security;
alter table public.life_transactions enable row level security;
alter table public.life_snapshots enable row level security;
alter table public.life_snapshot_balances enable row level security;
alter table public.life_preferences enable row level security;

revoke all on table public.life_accounts from anon, authenticated;
revoke all on table public.life_categories from anon, authenticated;
revoke all on table public.life_goals from anon, authenticated;
revoke all on table public.life_transactions from anon, authenticated;
revoke all on table public.life_snapshots from anon, authenticated;
revoke all on table public.life_snapshot_balances from anon, authenticated;
revoke all on table public.life_preferences from anon, authenticated;

grant all on table public.life_accounts to service_role;
grant all on table public.life_categories to service_role;
grant all on table public.life_goals to service_role;
grant all on table public.life_transactions to service_role;
grant all on table public.life_snapshots to service_role;
grant all on table public.life_snapshot_balances to service_role;
grant all on table public.life_preferences to service_role;
