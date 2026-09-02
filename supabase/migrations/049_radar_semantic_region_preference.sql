-- RADAR-SEMANTIC-01 — per-member development region preference.
-- Additive. Does not mutate historical snapshots or pipeline runs.
-- Changing region after a current value exists becomes effective the next
-- Asia/Taipei calendar day (pending_* + pending_effective_date).

CREATE TABLE IF NOT EXISTS public.member_radar_region_preferences (
  member_id UUID PRIMARY KEY REFERENCES public.members (id) ON DELETE CASCADE,
  current_city TEXT,
  current_district TEXT,
  pending_city TEXT,
  pending_district TEXT,
  pending_effective_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.member_radar_region_preferences IS
  'Partner preferred development region. Current applies to scoring/rank; pending applies from pending_effective_date (Asia/Taipei). Never rewrite today''s Top20.';

ALTER TABLE public.member_radar_region_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.member_radar_region_preferences FROM anon, authenticated;
GRANT ALL ON TABLE public.member_radar_region_preferences TO service_role;
