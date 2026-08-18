import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readMigration(name: string): string {
  return readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");
}

describe("Recognition Center migration security", () => {
  const migration = readMigration("036_recognition_event_rpcs.sql");

  it("revokes transactional RPC execute from public/anon/authenticated", () => {
    expect(migration).toContain("revoke all on function public.create_recognition_event_with_awards(");
    expect(migration).toContain(") from public;");
    expect(migration).toContain(") from anon;");
    expect(migration).toContain(") from authenticated;");

    expect(migration).toContain("revoke all on function public.reorder_recognition_event_awards(uuid, uuid[]) from public;");
    expect(migration).toContain("revoke all on function public.reorder_recognition_event_awards(uuid, uuid[]) from anon;");
    expect(migration).toContain("revoke all on function public.reorder_recognition_event_awards(uuid, uuid[]) from authenticated;");
  });

  it("grants transactional RPC execute only to service_role", () => {
    expect(migration).toContain(") to service_role;");
    expect(migration).not.toContain(") to authenticated;");
    expect(migration).not.toContain(") to anon;");
  });
});

describe("Recognition public submission RPC defense-in-depth", () => {
  const migration = readMigration("038_recognition_public_submission_rpc_guards.sql");
  const functionBody = migration.slice(
    migration.indexOf("as $$"),
    migration.indexOf("$$;"),
  );
  const insertIndex = functionBody.indexOf("insert into public.recognition_submissions");

  it("keeps public submission RPC execute on service_role only", () => {
    expect(migration).toContain(
      "revoke all on function public.create_public_recognition_submission(",
    );
    expect(migration).toContain(") from public;");
    expect(migration).toContain(") from anon;");
    expect(migration).toContain(") from authenticated;");
    expect(migration).toContain(") to service_role;");
    expect(migration).not.toContain(") to authenticated;");
    expect(migration).not.toContain(") to anon;");
  });

  it("rechecks collecting-state before inserting rows", () => {
    const collectingIndex = functionBody.indexOf("status is distinct from 'collecting'");
    expect(collectingIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(collectingIndex);
    expect(functionBody).toContain("raise exception 'recognition public collection is not collecting'");
  });

  it("rechecks collection-window against current DB time before inserting rows", () => {
    const nowIndex = functionBody.indexOf("v_now := now();");
    const startIndex = functionBody.indexOf("v_now < v_event.collect_starts_at");
    const endIndex = functionBody.indexOf("v_now > v_event.collect_ends_at");
    expect(nowIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeGreaterThan(nowIndex);
    expect(endIndex).toBeGreaterThan(startIndex);
    expect(insertIndex).toBeGreaterThan(endIndex);
    expect(functionBody).toContain("if v_event.collect_starts_at is not null");
    expect(functionBody).toContain("if v_event.collect_ends_at is not null");
  });

  it("requires enabled awards that belong to the target event before inserting rows", () => {
    const awardIndex = functionBody.indexOf("and rea.is_enabled = true");
    expect(awardIndex).toBeGreaterThan(-1);
    expect(functionBody).toContain("and rea.event_id = p_event_id");
    expect(insertIndex).toBeGreaterThan(awardIndex);
    expect(functionBody).toContain(
      "raise exception 'one or more entries reference an invalid or disabled event award'",
    );
  });

  it("verifies the target event still exists before inserting rows", () => {
    const eventLookupIndex = functionBody.indexOf("from public.recognition_events");
    expect(eventLookupIndex).toBeGreaterThan(-1);
    expect(functionBody).toContain("where id = p_event_id");
    expect(functionBody).toContain("raise exception 'recognition event not found'");
    expect(insertIndex).toBeGreaterThan(eventLookupIndex);
  });
});

describe("Recognition candidate consolidation RPC security", () => {
  const migration = readMigration("039_recognition_candidates.sql");

  it("revokes consolidation and reorder RPC execute from public/anon/authenticated", () => {
    expect(migration).toContain("revoke all on function public.consolidate_recognition_event_candidates(uuid) from public;");
    expect(migration).toContain("revoke all on function public.consolidate_recognition_event_candidates(uuid) from anon;");
    expect(migration).toContain("revoke all on function public.consolidate_recognition_event_candidates(uuid) from authenticated;");
    expect(migration).toContain("revoke all on function public.reorder_recognition_event_candidates(uuid, uuid, uuid[]) from public;");
    expect(migration).toContain("revoke all on function public.reorder_recognition_event_candidates(uuid, uuid, uuid[]) from anon;");
    expect(migration).toContain("revoke all on function public.reorder_recognition_event_candidates(uuid, uuid, uuid[]) from authenticated;");
  });

  it("grants candidate RPCs only to service_role", () => {
    expect(migration).toContain("grant execute on function public.consolidate_recognition_event_candidates(uuid) to service_role;");
    expect(migration).toContain("grant execute on function public.reorder_recognition_event_candidates(uuid, uuid, uuid[]) to service_role;");
    expect(migration).not.toContain(") to authenticated;");
    expect(migration).not.toContain(") to anon;");
  });

  it("uses uniqueness plus ON CONFLICT to keep consolidation idempotent", () => {
    expect(migration).toContain("unique (event_id, event_award_id, normalized_name)");
    expect(migration).toContain("unique (submission_entry_id)");
    expect(migration).toContain("on conflict (event_id, event_award_id, normalized_name) do nothing");
    expect(migration).toContain("on conflict (submission_entry_id) do nothing");
  });

  it("does not overwrite review_status on reconsolidation", () => {
    expect(migration).toContain("on conflict (event_id, event_award_id, normalized_name) do nothing");
    expect(migration).not.toContain("do update set review_status");
    expect(migration).not.toContain("set review_status = 'pending'");
  });

  it("does not mutate raw submitted_name from candidate operations", () => {
    expect(migration).not.toMatch(/update public\.recognition_submission_entries/i);
    expect(migration).not.toMatch(/update public\.recognition_submissions/i);
  });
});
