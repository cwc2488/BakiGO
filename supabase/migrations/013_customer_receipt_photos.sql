-- Customer receipt photos: coach-only retention for 2 years.

create table if not exists public.customer_receipt_photos (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  receipt_date date not null,
  image_data_url text not null,
  note text,
  retain_until date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_receipt_photos_customer_id_idx
  on public.customer_receipt_photos (customer_id);

create index if not exists customer_receipt_photos_receipt_date_idx
  on public.customer_receipt_photos (customer_id, receipt_date desc);

create index if not exists customer_receipt_photos_retain_until_idx
  on public.customer_receipt_photos (retain_until);

alter table public.customer_receipt_photos enable row level security;

create policy "customer_receipt_photos_select_own"
  on public.customer_receipt_photos for select
  to authenticated
  using (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "customer_receipt_photos_insert_own"
  on public.customer_receipt_photos for insert
  to authenticated
  with check (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "customer_receipt_photos_update_own"
  on public.customer_receipt_photos for update
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

create policy "customer_receipt_photos_delete_own"
  on public.customer_receipt_photos for delete
  to authenticated
  using (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );
