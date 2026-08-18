-- Read-only preflight for Recognition Center Production recovery.
-- Does not create, alter, drop, or write any business data.

select
  to_regclass('public.members') as members,
  to_regclass('public.customers') as customers,
  to_regclass('public.recognition_events') as recognition_events,
  to_regclass('public.recognition_event_awards') as recognition_event_awards,
  to_regclass('public.recognition_submissions') as recognition_submissions,
  to_regclass('public.recognition_candidates') as recognition_candidates,
  to_regclass('public.recognition_candidate_photo_reviews') as photo_reviews,
  to_regclass('public.recognition_presentation_exports') as presentation_exports;

select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_recognition_event_with_awards',
    'reorder_recognition_event_awards',
    'create_public_recognition_submission',
    'consolidate_recognition_event_candidates',
    'reorder_recognition_event_candidates',
    'upsert_recognition_candidate_photo_review',
    'reset_recognition_candidate_photo_review',
    'delete_recognition_event'
  )
order by 1;

select id, public from storage.buckets where id = 'recognition-photos';
