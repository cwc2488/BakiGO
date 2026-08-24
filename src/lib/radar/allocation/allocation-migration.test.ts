import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/047_radar_allocation_v1.sql"),
  "utf8",
);

const CLAIM_TABLE = "public.candidate_development_claims";
const EVENT_TABLE = "public.candidate_development_claim_events";

describe("047 — additive and idempotent", () => {
  it("guards every create against re-runs", () => {
    for (const match of migration.matchAll(/CREATE (TABLE|INDEX)(?: (\w+))?/g)) {
      expect(migration.slice(match.index, match.index + 40)).toContain(
        "IF NOT EXISTS",
      );
    }
    expect(migration).toContain(
      "ALTER TABLE public.member_candidate_state\n  ADD COLUMN IF NOT EXISTS skip_expires_at",
    );
    expect(migration).toContain(
      "ALTER TABLE public.radar_pipeline_config\n  ADD COLUMN IF NOT EXISTS allocation",
    );
  });

  it("replaces functions and triggers instead of failing on a second run", () => {
    const createdTriggers = [...migration.matchAll(/CREATE TRIGGER (\w+)/g)].map(
      (match) => match[1],
    );
    expect(createdTriggers.length).toBeGreaterThan(0);
    for (const trigger of createdTriggers) {
      expect(migration).toContain(`DROP TRIGGER IF EXISTS ${trigger}`);
    }
    for (const match of migration.matchAll(/CREATE (?:OR REPLACE )?FUNCTION/g)) {
      expect(match[0]).toBe("CREATE OR REPLACE FUNCTION");
    }
  });

  it("never destroys or rewrites existing data", () => {
    expect(migration).not.toMatch(/DROP (TABLE|COLUMN|CONSTRAINT)/i);
    expect(migration).not.toMatch(/\bDELETE FROM\b/i);
    expect(migration).not.toMatch(/ALTER COLUMN/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });
});

describe("047 — allocation invariants", () => {
  it("allows at most one lock row per candidate", () => {
    expect(migration).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.candidate_development_claims \(\s*\n\s*candidate_id TEXT PRIMARY KEY/,
    );
  });

  it("stores allocatable_at as a plain timestamp so infinity is legal", () => {
    expect(migration).toContain("allocatable_at TIMESTAMPTZ NOT NULL");
    expect(migration).not.toMatch(/allocatable_at[^\n]*GENERATED/i);
    expect(migration).not.toMatch(/CHECK[^\n]*allocatable_at\s*<\s*'infinity'/i);
  });

  it("keeps a live claim blocking until at least its own expiry", () => {
    expect(migration).toContain(
      "WHEN released_at IS NULL THEN allocatable_at >= expires_at",
    );
  });

  it("lets an early release only move the cooldown forward from the release", () => {
    expect(migration).toContain("ELSE allocatable_at >= released_at");
  });

  it("records natural expiry as expired, never as a member giving up", () => {
    expect(migration).toContain("COALESCE(OLD.release_reason, 'expired')");
    expect(migration).toMatch(
      /release_reason IN \('failed', 'gave_up', 'converted'\)/,
    );
    expect(migration).toMatch(
      /reason IN \('failed', 'gave_up', 'expired', 'converted'\)/,
    );
  });

  it("keeps the rule durations out of SQL", () => {
    expect(migration).not.toMatch(/INTERVAL/i);
    expect(migration).not.toMatch(/\b(30|90|14|40|20)\s*\*/);
  });
});

describe("047 — atomic claim", () => {
  it("decides the winner inside one conditional upsert", () => {
    expect(migration).toContain("ON CONFLICT (candidate_id) DO UPDATE");
    expect(migration).toContain("c.allocatable_at <= now()");
    expect(migration).toContain("RETURNING c.*");
  });

  it("treats a repeat claim by the same member as idempotent", () => {
    expect(migration).toMatch(
      /claimed_at = CASE\s*\n\s*WHEN c\.member_id = EXCLUDED\.member_id AND c\.released_at IS NULL\s*\n\s*THEN c\.claimed_at/,
    );
    expect(migration).toMatch(
      /expires_at = CASE\s*\n\s*WHEN c\.member_id = EXCLUDED\.member_id AND c\.released_at IS NULL\s*\n\s*THEN c\.expires_at/,
    );
  });

  it("does not append history for a no-op retry", () => {
    expect(migration).toMatch(
      /NEW\.member_id = OLD\.member_id\s*\n\s*AND NEW\.claimed_at = OLD\.claimed_at\s*\n\s*AND NEW\.released_at IS NOT DISTINCT FROM OLD\.released_at\s*\n\s*THEN\s*\n\s*RETURN NULL;/,
    );
  });

  it("needs no scheduled job for expiry", () => {
    expect(migration).not.toMatch(/pg_cron|cron\.schedule|pg_sleep/i);
  });
});

describe("047 — RADAR-SECURITY-01 lockdown", () => {
  it("locks both new tables the same way 045 locked the rest", () => {
    for (const table of [CLAIM_TABLE, EVENT_TABLE]) {
      expect(migration).toContain(`'${table.replace("public.", "")}'`);
    }
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE public.%I FROM anon, authenticated");
    expect(migration).toContain("GRANT ALL ON TABLE public.%I TO service_role");
  });

  it("keeps every new function off the anon key and on the service role", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION %s FROM public, anon, authenticated",
    );
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    for (const fn of [
      "claim_candidate_development",
      "record_candidate_development_claim_event",
      "reject_candidate_development_claim_event_update",
    ]) {
      expect(migration).toContain(`'${fn}'`);
    }
  });

  it("adds no RLS policy, so the tables stay service-role only", () => {
    expect(migration).not.toMatch(/CREATE POLICY/i);
    expect(migration).not.toMatch(/SECURITY DEFINER/i);
  });

  it("pins search_path on every new function", () => {
    const functions = [...migration.matchAll(/CREATE OR REPLACE FUNCTION/g)];
    const searchPaths = [...migration.matchAll(/SET search_path = public, pg_temp/g)];
    expect(searchPaths).toHaveLength(functions.length);
  });
});
