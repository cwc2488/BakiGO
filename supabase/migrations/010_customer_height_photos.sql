-- Customer fixed height + before/after progress photos.

alter table public.customers
  add column if not exists height_cm numeric;

create table if not exists public.customer_progress_photos (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  phase text not null,
  angle text not null default 'front',
  photo_date date not null,
  image_data_url text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_progress_photos_phase_check check (phase in ('before', 'after')),
  constraint customer_progress_photos_angle_check check (angle in ('front', 'side', 'back'))
);

create index if not exists customer_progress_photos_customer_id_idx
  on public.customer_progress_photos (customer_id);

create index if not exists customer_progress_photos_phase_idx
  on public.customer_progress_photos (customer_id, phase, angle, photo_date desc);

alter table public.customer_progress_photos enable row level security;

create policy "customer_progress_photos_select_own"
  on public.customer_progress_photos for select
  to authenticated
  using (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "customer_progress_photos_insert_own"
  on public.customer_progress_photos for insert
  to authenticated
  with check (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "customer_progress_photos_update_own"
  on public.customer_progress_photos for update
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

create policy "customer_progress_photos_delete_own"
  on public.customer_progress_photos for delete
  to authenticated
  using (
    customer_id in (
      select c.id from public.customers c
      join public.members m on m.id = c.owner_member_id
      where lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );
