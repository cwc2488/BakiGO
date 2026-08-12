-- Phase 3d proposal: Coach Action Memory
-- APPLIED as supabase/migrations/031_coaching_coach_actions.sql
-- Kept for audit trail. Prefer the applied migration as source of truth.

-- Conceptual table: coaching_coach_actions
-- Ownership: owner_member_id (same as other coaching tables)
-- Customer portal: no SELECT (internal coach memory only)
-- Distinct from coaching_coach_directives (plan focus ≠ action resolution context).

/*
Applied schema (see migration 031):
- action_type: note | acknowledged | follow_up
- status: open | acknowledged | follow_up | resolved | superseded
- related_reason_codes, evidence_refs, is_material
- RLS: authenticated SELECT/INSERT/UPDATE own rows; no DELETE
*/

