import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";

const MIGRATION_072 = "supabase/migrations/072_member_app_data_downline_sponsor_rls.sql";

/** Exact keys authorized for upline→downline member_app_data SELECT. */
const DOWNLINE_APP_DATA_KEY_ALLOWLIST = [
  STORAGE_KEYS.bakiEvents,
  STORAGE_KEYS.retailTransactions,
  STORAGE_KEYS.retailPipelineLeads,
] as const;

const FORBIDDEN_DOWNLINE_KEYS = [
  STORAGE_KEYS.calendarEvents,
  STORAGE_KEYS.calendarEventDeletionTombstones,
  STORAGE_KEYS.calendarGoogleDeletionTombstones,
  STORAGE_KEYS.calendarSharedAttendance,
  STORAGE_KEYS.calendarReminderQueue,
  STORAGE_KEYS.googleCalendarAuth,
  STORAGE_KEYS.homeDisplayMode,
  STORAGE_KEYS.memberGoals,
  STORAGE_KEYS.superLeagueEntries,
  STORAGE_KEYS.authSession,
  "baki-go:future-unknown-key",
] as const;

function migrationSql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION_072), "utf8");
}

function extractDownlinePolicyBody(sql: string): string {
  const marker = 'create policy "member_app_data_select_downline"';
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start);
}

describe("SECURITY — Migration 072 downline RLS data_key allowlist", () => {
  it("allowlist matches DOWNLINE_SYNC_KEYS / Product VP authorized keys exactly", () => {
    expect(DOWNLINE_APP_DATA_KEY_ALLOWLIST).toEqual([
      "baki-go:baki-events",
      "baki-go:retail-transactions",
      "baki-go:retail-pipeline-leads",
    ]);
  });

  it("policy requires BOTH hierarchy membership AND data_key allowlist", () => {
    const policy = extractDownlinePolicyBody(migrationSql());
    expect(policy).toContain("data_key in (");
    for (const key of DOWNLINE_APP_DATA_KEY_ALLOWLIST) {
      expect(policy).toContain(`'${key}'`);
    }
    expect(policy).toContain("member_id in (");
    expect(policy).toContain("with recursive downline as");
    expect(policy).toContain("organization_relationships");
    expect(policy).toContain("sponsor_member_number");
  });

  it("sponsor A cannot read B calendar / tombstones / future unknown keys via downline policy", () => {
    const policy = extractDownlinePolicyBody(migrationSql());
    for (const key of FORBIDDEN_DOWNLINE_KEYS) {
      expect(policy).not.toContain(`'${key}'`);
    }
    // Must not be a blanket member_id-only SELECT (no data_key gate).
    expect(policy).toMatch(/data_key\s+in\s*\(/i);
  });

  it("does not drop or redefine member_app_data_select_own (B keeps full own access)", () => {
    const sql = migrationSql();
    expect(sql).not.toMatch(/drop policy.*member_app_data_select_own/i);
    expect(sql).not.toMatch(/create policy "member_app_data_select_own"/i);
  });

  it("backfill remains idempotent ON CONFLICT DO NOTHING", () => {
    const sql = migrationSql();
    expect(sql).toContain("insert into public.organization_relationships");
    expect(sql).toContain("on conflict (parent_member_number, child_member_number) do nothing");
  });

  it("contract matrix — documented intended outcomes", () => {
    // A → B allowlisted keys: allowed by downline policy when B ∈ A's hierarchy
    const allowedForSponsor = new Set(DOWNLINE_APP_DATA_KEY_ALLOWLIST);
    expect(allowedForSponsor.has(STORAGE_KEYS.retailTransactions)).toBe(true);
    expect(allowedForSponsor.has(STORAGE_KEYS.bakiEvents)).toBe(true);
    expect(allowedForSponsor.has(STORAGE_KEYS.retailPipelineLeads)).toBe(true);

    // A → B calendar / unknown: denied by downline policy (own-only)
    expect(allowedForSponsor.has(STORAGE_KEYS.calendarEvents)).toBe(false);
    expect(allowedForSponsor.has("baki-go:future-unknown-key" as never)).toBe(false);

    // B → B calendar: via select_own (not this policy) — migration must leave it intact
    expect(migrationSql()).not.toMatch(/drop policy.*member_app_data_select_own/i);

    // Unrelated C → B retail: denied because C's downline CTE does not include B
    // (hierarchy gate retained — not data_key alone)
    const policy = extractDownlinePolicyBody(migrationSql());
    expect(policy).toContain("auth.jwt() ->> 'email'");
    expect(policy).toContain("and member_id in (");
  });
});
