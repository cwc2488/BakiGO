-- Add sex to customers profile for long-term consultation / body reference.
-- Nullable for legacy rows; Step 1 prompts backfill when starting consultation.

alter table public.customers
  add column if not exists sex text;

alter table public.customers
  drop constraint if exists customers_sex_check;

alter table public.customers
  add constraint customers_sex_check
  check (sex is null or sex in ('male', 'female', 'other', 'prefer_not_to_say'));
