-- RADAR-FEEDBACK-01 — per-member human evaluation of Radar recommendations.
-- Additive. Evaluation evidence only. Does NOT modify scores, Top20, allocation,
-- exclusion, prompts, or other members' recommendations.
-- evaluation_context is frozen on first save; feedback polarity may be corrected.

CREATE TABLE IF NOT EXISTS public.member_radar_recommendation_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  recommendation_date DATE NOT NULL,
  feedback TEXT NOT NULL CHECK (feedback IN ('worth_developing', 'not_worth_developing')),
  rejection_reason TEXT NULL CHECK (
    rejection_reason IS NULL
    OR rejection_reason IN (
      'not_self_need',
      'already_resolved',
      'peer_provider',
      'language_region_unfit',
      'ai_misunderstood',
      'other'
    )
  ),
  optional_note TEXT NULL,
  evaluation_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_radar_recommendation_feedback_unique
    UNIQUE (member_id, candidate_id, recommendation_date),
  CONSTRAINT member_radar_recommendation_feedback_reason_shape CHECK (
    (feedback = 'worth_developing' AND rejection_reason IS NULL AND optional_note IS NULL)
    OR (feedback = 'not_worth_developing' AND rejection_reason IS NOT NULL)
  )
);

COMMENT ON TABLE public.member_radar_recommendation_feedback IS
  'Partner 👍/👎 evaluation of a daily Radar recommendation. Member-specific. Never auto-learns or rewrites Top20.';

CREATE INDEX IF NOT EXISTS member_radar_recommendation_feedback_member_date_idx
  ON public.member_radar_recommendation_feedback (member_id, recommendation_date);

ALTER TABLE public.member_radar_recommendation_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.member_radar_recommendation_feedback FROM anon, authenticated;
GRANT ALL ON TABLE public.member_radar_recommendation_feedback TO service_role;
