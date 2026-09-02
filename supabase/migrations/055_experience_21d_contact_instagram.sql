-- NOTE: Renumbered onto fix/regression-pack-01 lineage (recognition occupies 035–045).
-- Content is idempotent / additive; safe if Production already applied the original 035–043 quiz/21d set.

-- 21D-HANDOFF-01 contact patch: allow instagram. Keep email for any historical rows.

alter table public.experience_21d_interests
  drop constraint if exists experience_21d_interests_contact_channel_check;

alter table public.experience_21d_interests
  add constraint experience_21d_interests_contact_channel_check
  check (contact_channel is null or contact_channel in ('phone', 'line', 'email', 'instagram'));
