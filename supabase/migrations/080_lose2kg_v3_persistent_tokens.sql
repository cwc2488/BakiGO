-- LOSE2KG-03: V3 persistent share URLs (encrypted raw tokens) + safe deletes.
-- Additive only. Does not DROP/rename existing columns or change V1/V2 business RPCs.

alter table public.lose2kg_periods
  add column if not exists staff_token_encrypted text,
  add column if not exists live_token_encrypted text;

comment on column public.lose2kg_periods.staff_token_encrypted is
  'LOSE2KG-03 AES-GCM encrypted staff raw token for Admin persistent URL display. Never exposed to staff/public clients.';
comment on column public.lose2kg_periods.live_token_encrypted is
  'LOSE2KG-03 AES-GCM encrypted live/public raw token for Admin persistent URL display.';
