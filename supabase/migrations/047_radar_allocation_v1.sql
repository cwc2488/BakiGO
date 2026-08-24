-- RADAR-SCALE-01 P2A — allocation foundation.
--
-- Adds the durable state the allocation model needs (docs/AI_RADAR.md §6.10,
-- docs/BUSINESS_RULES.md → "Radar Candidate Supply & Allocation V1"):
--
--   member_candidate_state.skip_expires_at   timed 略過 exclusion (per member)
--   radar_pipeline_config.allocation         operator overrides for the rules
--   candidate_development_claims             current allocation lock, <=1 row per candidate
--   candidate_development_claim_events       append-only claim history
--   claim_candidate_development()            the atomic first-writer-wins claim
--
-- Durations are deliberately NOT encoded here. The caller computes claimed_at /
-- expires_at / allocatable_at from src/lib/radar/allocation/allocation-rules.ts,
-- so 30 / 90 / 14 / 40 / 20 live in exactly one place and stay tunable without
-- a migration.
--
-- No cron is required for correctness. "May another member take this candidate?"
-- is the single predicate `allocatable_at <= now()`, evaluated inside the claim
-- statement while the row is locked. A claim that simply runs out of its 90 days
-- stops blocking on its own, and nothing has to sweep expired rows.
--
-- Additive and idempotent: no existing column, constraint, or row is modified.
-- New tables and functions are locked down exactly like 045 — RLS enabled,
-- anon/authenticated revoked, service_role only.

-- 1. Timed skip -------------------------------------------------------------
-- 略過 excludes the candidate from THIS member's feed until skip_expires_at.
-- 我認識他 stays permanent and keeps skip_expires_at NULL.

ALTER TABLE public.member_candidate_state
  ADD COLUMN IF NOT EXISTS skip_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.member_candidate_state.skip_expires_at IS
  'Skip cooldown expiry (allocation rules skip_cooldown_days). NULL = no timed skip; already_known is permanent. Evaluated at read time, never swept.';

CREATE INDEX IF NOT EXISTS idx_member_candidate_state_skip_expiry
  ON public.member_candidate_state (member_id, skip_expires_at)
  WHERE skip_expires_at IS NOT NULL;

-- 2. Operator overrides ------------------------------------------------------
-- Empty object = defaults from allocation-rules.ts. Values are only written
-- here when an operator needs to tune a rule.

ALTER TABLE public.radar_pipeline_config
  ADD COLUMN IF NOT EXISTS allocation JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.radar_pipeline_config.allocation IS
  'Overrides for radar_allocation_v1 rules (skip_cooldown_days, development_claim_days, post_release_global_cooldown_days, minimum_qualified_score, daily_recommendation_cap). Empty = TS defaults.';

-- 3. Current allocation lock -------------------------------------------------
-- Exactly one row per candidate: the current claim, or the cooldown left behind
-- by the previous claim. History lives in candidate_development_claim_events.
--
-- allocatable_at is the only gate other members are tested against:
--   active claim      = expires_at + post-release cooldown
--   early release     = released_at + post-release cooldown (always earlier)
--   converted         = 'infinity' — a Customer is never handed out again;
--                       customers.owner_member_id stays the ownership authority
--                       and Radar must not lift this lock on its own.

CREATE TABLE IF NOT EXISTS public.candidate_development_claims (
  candidate_id TEXT PRIMARY KEY
    REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
  member_id UUID NOT NULL
    REFERENCES public.members (id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  allocatable_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  rules_version TEXT NOT NULL DEFAULT 'radar_allocation_v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT candidate_development_claims_reason_values CHECK (
    release_reason IS NULL
    OR release_reason IN ('failed', 'gave_up', 'converted')
  ),
  CONSTRAINT candidate_development_claims_reason_pairing CHECK (
    (released_at IS NULL) = (release_reason IS NULL)
  ),
  CONSTRAINT candidate_development_claims_window CHECK (expires_at > claimed_at),
  CONSTRAINT candidate_development_claims_cooldown CHECK (
    CASE
      -- A live claim can never become allocatable before it expires.
      WHEN released_at IS NULL THEN allocatable_at >= expires_at
      -- An early release pulls that date forward, but never into the past.
      ELSE allocatable_at >= released_at
    END
  )
);

CREATE INDEX IF NOT EXISTS idx_candidate_development_claims_member
  ON public.candidate_development_claims (member_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_development_claims_allocatable
  ON public.candidate_development_claims (allocatable_at);

COMMENT ON TABLE public.candidate_development_claims IS
  'Current Radar allocation lock — one row per candidate. Time-boxed allocation, NOT ownership; customers.owner_member_id remains the only permanent ownership authority.';

COMMENT ON COLUMN public.candidate_development_claims.allocatable_at IS
  'When any member may claim this candidate again. infinity = converted to Customer. Read-time gate; no sweeper.';

COMMENT ON COLUMN public.candidate_development_claims.release_reason IS
  'Explicit human business action only (failed / gave_up / converted). Natural 90-day expiry is NOT recorded as gave_up.';

-- 4. Append-only claim history ----------------------------------------------

CREATE TABLE IF NOT EXISTS public.candidate_development_claim_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL
    REFERENCES public.candidate_pool (id) ON DELETE CASCADE,
  member_id UUID NOT NULL
    REFERENCES public.members (id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  reason TEXT,
  claimed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  allocatable_at TIMESTAMPTZ NOT NULL,
  rules_version TEXT NOT NULL,
  -- clock_timestamp, not now(): a takeover writes the ending claim and the new
  -- one in the same transaction, and the ledger has to keep them in that order.
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT candidate_development_claim_events_event_values CHECK (
    event IN ('claimed', 'released', 'superseded')
  ),
  CONSTRAINT candidate_development_claim_events_reason_values CHECK (
    reason IS NULL
    OR reason IN ('failed', 'gave_up', 'expired', 'converted')
  )
);

CREATE INDEX IF NOT EXISTS idx_candidate_development_claim_events_candidate
  ON public.candidate_development_claim_events (candidate_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_development_claim_events_member
  ON public.candidate_development_claim_events (member_id, recorded_at DESC);

COMMENT ON TABLE public.candidate_development_claim_events IS
  'Append-only claim history. reason=expired marks a claim that ran out its 90 days — recorded when the lock is taken over, and never a member action.';

-- 5. History is written by the database, not by callers ----------------------
-- The claim is a single statement that overwrites the lock row, so the previous
-- holder would otherwise be lost. A trigger guarantees the audit trail even if a
-- future write path forgets it.
--
-- A same-member idempotent retry preserves member_id, claimed_at and released_at
-- and therefore records nothing: repeated 開始開發 clicks cannot inflate history
-- or extend the 90 days.

CREATE OR REPLACE FUNCTION public.record_candidate_development_claim_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.member_id = OLD.member_id
      AND NEW.claimed_at = OLD.claimed_at
      AND NEW.released_at IS NOT DISTINCT FROM OLD.released_at
    THEN
      RETURN NULL;
    END IF;

    IF NEW.member_id <> OLD.member_id OR NEW.claimed_at <> OLD.claimed_at THEN
      INSERT INTO public.candidate_development_claim_events
        (candidate_id, member_id, event, reason,
         claimed_at, expires_at, allocatable_at, rules_version)
      VALUES (
        OLD.candidate_id,
        OLD.member_id,
        'superseded',
        COALESCE(OLD.release_reason, 'expired'),
        OLD.claimed_at,
        OLD.expires_at,
        OLD.allocatable_at,
        OLD.rules_version
      );
    END IF;
  END IF;

  INSERT INTO public.candidate_development_claim_events
    (candidate_id, member_id, event, reason,
     claimed_at, expires_at, allocatable_at, rules_version)
  VALUES (
    NEW.candidate_id,
    NEW.member_id,
    CASE WHEN NEW.released_at IS NULL THEN 'claimed' ELSE 'released' END,
    NEW.release_reason,
    NEW.claimed_at,
    NEW.expires_at,
    NEW.allocatable_at,
    NEW.rules_version
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_candidate_development_claim_events
  ON public.candidate_development_claims;

CREATE TRIGGER trg_candidate_development_claim_events
  AFTER INSERT OR UPDATE ON public.candidate_development_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.record_candidate_development_claim_event();

-- Append-only means history rows are never rewritten. DELETE stays available
-- for the retention policy in docs/AI_RADAR.md §12.

CREATE OR REPLACE FUNCTION public.reject_candidate_development_claim_event_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'candidate_development_claim_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_candidate_development_claim_events_append_only
  ON public.candidate_development_claim_events;

CREATE TRIGGER trg_candidate_development_claim_events_append_only
  BEFORE UPDATE ON public.candidate_development_claim_events
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_candidate_development_claim_event_update();

-- 6. Atomic claim ------------------------------------------------------------
-- First writer wins, decided by the database inside one statement:
--
--   1 row returned  = the caller holds the claim (new claim, or an idempotent
--                     retry of their own live claim with dates untouched)
--   0 rows returned = someone else holds it, or the global cooldown has not
--                     finished. The caller learns nothing else — no holder id,
--                     no development state.
--
-- No caller ever reads the row before deciding to write, so there is no
-- read-then-write window. PostgREST cannot express a conditional ON CONFLICT
-- DO UPDATE ... WHERE, which is why this is a function.

CREATE OR REPLACE FUNCTION public.claim_candidate_development(
  p_candidate_id TEXT,
  p_member_id UUID,
  p_expires_at TIMESTAMPTZ,
  p_allocatable_at TIMESTAMPTZ,
  p_rules_version TEXT DEFAULT 'radar_allocation_v1'
)
RETURNS SETOF public.candidate_development_claims
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.candidate_development_claims AS c
    (candidate_id, member_id, claimed_at, expires_at, allocatable_at, rules_version)
  VALUES (
    p_candidate_id,
    p_member_id,
    now(),
    p_expires_at,
    p_allocatable_at,
    p_rules_version
  )
  ON CONFLICT (candidate_id) DO UPDATE
  SET
    member_id = EXCLUDED.member_id,
    claimed_at = CASE
      WHEN c.member_id = EXCLUDED.member_id AND c.released_at IS NULL
      THEN c.claimed_at ELSE EXCLUDED.claimed_at END,
    expires_at = CASE
      WHEN c.member_id = EXCLUDED.member_id AND c.released_at IS NULL
      THEN c.expires_at ELSE EXCLUDED.expires_at END,
    allocatable_at = CASE
      WHEN c.member_id = EXCLUDED.member_id AND c.released_at IS NULL
      THEN c.allocatable_at ELSE EXCLUDED.allocatable_at END,
    rules_version = CASE
      WHEN c.member_id = EXCLUDED.member_id AND c.released_at IS NULL
      THEN c.rules_version ELSE EXCLUDED.rules_version END,
    released_at = NULL,
    release_reason = NULL,
    updated_at = now()
  WHERE
    -- the previous claim's protection and cooldown are both over
    c.allocatable_at <= now()
    -- or this member already holds a live claim (idempotent retry)
    OR (
      c.member_id = EXCLUDED.member_id
      AND c.released_at IS NULL
      AND c.expires_at > now()
    )
  RETURNING c.*;
$$;

COMMENT ON FUNCTION public.claim_candidate_development IS
  'Atomic first-writer-wins development claim. Returns 1 row for the holder, 0 rows for a collision (caller must answer with neutral copy only).';

-- 7. RADAR-SECURITY-01 lockdown ---------------------------------------------
-- Same pattern as 045: the browser never queries Radar tables; member ownership
-- is enforced in the API layer, so anon/authenticated need no privileges.
-- member_candidate_state and radar_pipeline_config were already locked by 045
-- and their new columns inherit that.

DO $$
DECLARE
  t TEXT;
  allocation_tables TEXT[] := ARRAY[
    'candidate_development_claims',
    'candidate_development_claim_events'
  ];
BEGIN
  FOREACH t IN ARRAY allocation_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    ELSE
      RAISE NOTICE 'RADAR-SCALE-01: table public.% not found, skipped', t;
    END IF;
  END LOOP;
END
$$;

-- Resolved through pg_proc so the real signature is always used, and so a later
-- signature change cannot silently leave a function executable by anon.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'claim_candidate_development',
        'record_candidate_development_claim_event',
        'reject_candidate_development_claim_event_update'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
  END LOOP;
END
$$;
