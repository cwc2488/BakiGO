-- Recognition Center admin-only database hardening
-- Additive only. Does not change award eligibility, PPT geometry, or public
-- collection token behavior. Service-role server workflows remain granted.

-- Canonical admin authority remains public.recognition_admin_members
-- (member_id + is_active = true). Rank does not grant access.

-- ---------------------------------------------------------------------------
-- Force RLS + revoke client roles on every Recognition table.
-- Reads/writes stay on Next.js service_role after assertRecognitionAdmin.
-- ---------------------------------------------------------------------------

alter table public.recognition_award_definitions enable row level security;
alter table public.recognition_award_definitions force row level security;
alter table public.recognition_ppt_themes enable row level security;
alter table public.recognition_ppt_themes force row level security;
alter table public.recognition_admin_members enable row level security;
alter table public.recognition_admin_members force row level security;
alter table public.recognition_events enable row level security;
alter table public.recognition_events force row level security;
alter table public.recognition_event_awards enable row level security;
alter table public.recognition_event_awards force row level security;
alter table public.recognition_submissions enable row level security;
alter table public.recognition_submissions force row level security;
alter table public.recognition_submission_entries enable row level security;
alter table public.recognition_submission_entries force row level security;
alter table public.recognition_candidates enable row level security;
alter table public.recognition_candidates force row level security;
alter table public.recognition_candidate_sources enable row level security;
alter table public.recognition_candidate_sources force row level security;
alter table public.recognition_candidate_photo_reviews enable row level security;
alter table public.recognition_candidate_photo_reviews force row level security;
alter table public.recognition_presentation_exports enable row level security;
alter table public.recognition_presentation_exports force row level security;

revoke all on table public.recognition_award_definitions from public, anon, authenticated;
revoke all on table public.recognition_ppt_themes from public, anon, authenticated;
revoke all on table public.recognition_admin_members from public, anon, authenticated;
revoke all on table public.recognition_events from public, anon, authenticated;
revoke all on table public.recognition_event_awards from public, anon, authenticated;
revoke all on table public.recognition_submissions from public, anon, authenticated;
revoke all on table public.recognition_submission_entries from public, anon, authenticated;
revoke all on table public.recognition_candidates from public, anon, authenticated;
revoke all on table public.recognition_candidate_sources from public, anon, authenticated;
revoke all on table public.recognition_candidate_photo_reviews from public, anon, authenticated;
revoke all on table public.recognition_presentation_exports from public, anon, authenticated;

grant all on table public.recognition_award_definitions to service_role;
grant all on table public.recognition_ppt_themes to service_role;
grant all on table public.recognition_admin_members to service_role;
grant all on table public.recognition_events to service_role;
grant all on table public.recognition_event_awards to service_role;
grant all on table public.recognition_submissions to service_role;
grant all on table public.recognition_submission_entries to service_role;
grant all on table public.recognition_candidates to service_role;
grant all on table public.recognition_candidate_sources to service_role;
grant all on table public.recognition_candidate_photo_reviews to service_role;
grant all on table public.recognition_presentation_exports to service_role;

-- ---------------------------------------------------------------------------
-- Private photo bucket: no client storage.objects policies.
-- Uploads and downloads remain server-mediated with service_role.
-- Do not add storage.objects policies for bucket recognition-photos.
-- ---------------------------------------------------------------------------

comment on table public.recognition_admin_members is
  'Canonical Recognition Center admin allowlist. is_active=true is required. President rank does not grant access. Client roles have no table grants.';
