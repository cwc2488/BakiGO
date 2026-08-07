-- Coach customer CRM: customers, body composition records, portal tokens.
-- Isolated from member_app_data so uplines cannot read customer health data.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.members (id) on delete cascade,
  display_name text not null,
  phone text,
  line_id text,
  birth_year integer,
  status text not null default 'active',
  pipeline_lead_id text,
  linked_member_id uuid references public.members (id) on delete set null,
  note text,
  last_contact_date date,
  next_follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_status_check check (status in ('active', 'paused', 'converted'))
);

create index if not exists customers_owner_member_id_idx
  on public.customers (owner_member_id);

create index if not exists customers_updated_at_idx
  on public.customers (updated_at desc);

create table if not exists public.body_composition_records (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  record_date date not null,
  age integer,
  height_cm numeric,
  weight_kg numeric,
  skeletal_muscle_kg numeric,
  body_fat_kg numeric,
  bmi numeric,
  body_fat_percent numeric,
  visceral_fat_level numeric,
  basal_metabolic_rate numeric,
  body_age numeric,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists body_composition_records_customer_id_idx
  on public.body_composition_records (customer_id);

create index if not exists body_composition_records_record_date_idx
  on public.body_composition_records (customer_id, record_date desc);

create table if not exists public.customer_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint customer_portal_tokens_customer_unique unique (customer_id)
);

create index if not exists customer_portal_tokens_token_idx
  on public.customer_portal_tokens (token)
  where revoked_at is null;

alter table public.customers enable row level security;
alter table public.body_composition_records enable row level security;
alter table public.customer_portal_tokens enable row level security;

-- Only the owning coach can access their customers (uplines excluded).
create policy "customers_select_own"
  on public.customers for select
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "customers_insert_own"
  on public.customers for insert
  to authenticated
  with check (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "customers_update_own"
  on public.customers for update
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

create policy "customers_delete_own"
  on public.customers for delete
  to authenticated
  using (
    owner_member_id in (
      select id from public.members
      where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "body_composition_records_select_own"
  on public.body_composition_records for select
  to authenticated
  using (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "body_composition_records_insert_own"
  on public.body_composition_records for insert
  to authenticated
  with check (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "body_composition_records_update_own"
  on public.body_composition_records for update
  to authenticated
  using (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "body_composition_records_delete_own"
  on public.body_composition_records for delete
  to authenticated
  using (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "customer_portal_tokens_select_own"
  on public.customer_portal_tokens for select
  to authenticated
  using (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "customer_portal_tokens_insert_own"
  on public.customer_portal_tokens for insert
  to authenticated
  with check (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "customer_portal_tokens_update_own"
  on public.customer_portal_tokens for update
  to authenticated
  using (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "customer_portal_tokens_delete_own"
  on public.customer_portal_tokens for delete
  to authenticated
  using (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );
