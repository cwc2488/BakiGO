-- Recognition Center Phase 7: presentation export audit.
-- Additive only. Does not store PPTX bytes. Does not mutate candidates,
-- photo-review rows, raw submissions, or original photos.
--
-- SECURITY BOUNDARY:
-- Export audit is internal. RLS is enabled with zero anon / authenticated
-- table policies. Writes happen only via:
--   browser -> authenticated Next.js API -> assertRecognitionAdmin
--   -> service_role insert of a successful generation row.

create table if not exists public.recognition_presentation_exports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.recognition_events (id) on delete cascade,
  generated_by_member_id uuid not null
    references public.members (id) on delete restrict,
  generated_at timestamptz not null default now(),
  approved_candidate_count integer not null
    check (approved_candidate_count >= 0),
  slide_count integer not null
    check (slide_count >= 0),
  theme_id text not null,
  theme_version text not null,
  status text not null default 'success'
    check (status = 'success'),
  created_at timestamptz not null default now()
);

create index if not exists recognition_presentation_exports_event_idx
  on public.recognition_presentation_exports (event_id, generated_at desc);

comment on table public.recognition_presentation_exports is
  'Recognition Center PPTX generation audit. Rows are inserted only after a successful render. The PPTX file is not stored.';

comment on column public.recognition_presentation_exports.status is
  'V1 inserts success rows only. Failed generations must not create a row.';

alter table public.recognition_presentation_exports enable row level security;
alter table public.recognition_presentation_exports force row level security;

revoke all on table public.recognition_presentation_exports from public;
revoke all on table public.recognition_presentation_exports from anon;
revoke all on table public.recognition_presentation_exports from authenticated;

grant all on table public.recognition_presentation_exports to service_role;
