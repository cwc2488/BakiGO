-- Extend customers profile for long-term consultation fields.
-- Keeps birth_year for legacy rows; birth_date is preferred when available.

alter table public.customers
  add column if not exists birth_date date,
  add column if not exists region text,
  add column if not exists occupation text;
