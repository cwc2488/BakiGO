-- NOTE: Renumbered onto fix/regression-pack-01 lineage (recognition occupies 035–045).
-- Content is idempotent / additive; safe if Production already applied the original 035–043 quiz/21d set.

-- QUIZ-PARTNER-02: partner 21D lead hygiene via soft archive.
-- Additive only. No rewrite of 038/039/040. No physical DELETE.

alter table public.experience_21d_interests
  add column if not exists archived_at timestamptz;

create index if not exists experience_21d_interests_owner_active_idx
  on public.experience_21d_interests (owner_member_id, created_at desc)
  where owner_member_id is not null and archived_at is null;

comment on column public.experience_21d_interests.archived_at is
  'Partner operational hide (soft archive). Default workbench queries must exclude non-null rows. Row, session, funnel events, brief, and contact are preserved.';
