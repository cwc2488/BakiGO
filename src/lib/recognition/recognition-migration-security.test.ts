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

  it("does not auto-select preferred_source_entry_id during consolidation", () => {
    const functionBody = migration.slice(
      migration.indexOf("create or replace function public.consolidate_recognition_event_candidates"),
      migration.indexOf("revoke all on function public.consolidate_recognition_event_candidates"),
    );
    expect(functionBody).toContain("Do not auto-select preferred_source_entry_id");
    expect(functionBody).not.toMatch(/set\s+preferred_source_entry_id/i);
    expect(functionBody).not.toContain("preferred_source_entry_id = picked");
    expect(functionBody).toContain("preferred_source_entry_id is omitted on insert so new candidates stay null");
  });
});

describe("Recognition photo review migration security", () => {
  const migration = readMigration("040_recognition_photo_review.sql");

  it("revokes photo-review RPC execute from public/anon/authenticated", () => {
    expect(migration).toContain("revoke all on function public.upsert_recognition_candidate_photo_review(");
    expect(migration).toContain("from public;");
    expect(migration).toContain("from anon;");
    expect(migration).toContain("from authenticated;");
    expect(migration).toContain("revoke all on function public.reset_recognition_candidate_photo_review(uuid) from public;");
    expect(migration).toContain("revoke all on function public.reset_recognition_candidate_photo_review(uuid) from anon;");
    expect(migration).toContain("revoke all on function public.reset_recognition_candidate_photo_review(uuid) from authenticated;");
  });

  it("grants photo-review RPCs only to service_role", () => {
    expect(migration).toContain("grant execute on function public.upsert_recognition_candidate_photo_review(");
    expect(migration).toContain("grant execute on function public.reset_recognition_candidate_photo_review(uuid) to service_role;");
    expect(migration).not.toContain(") to authenticated;");
    expect(migration).not.toContain(") to anon;");
  });

  it("does not mutate original submission evidence or photos", () => {
    expect(migration).not.toMatch(/update public\.recognition_submission_entries/i);
    expect(migration).not.toMatch(/update public\.recognition_submissions/i);
    expect(migration).not.toMatch(/storage\.objects/i);
    expect(migration).not.toContain("original_photo_storage_path =");
  });

  it("rejects stale crop saves when preferred source changes", () => {
    expect(migration).toContain("preferred source changed; crop save rejected");
    expect(migration).toContain("v_candidate.preferred_source_entry_id is distinct from p_source_entry_id");
  });

  it("resets crop metadata when preferred source changes", () => {
    expect(migration).toContain("after update of preferred_source_entry_id on public.recognition_candidates");
    expect(migration).toContain("perform public.reset_recognition_candidate_photo_review(new.id)");
    expect(migration).toContain("this trigger runs in the SAME transaction as the");
    expect(migration).toContain("If reset raises,");
    expect(migration).toContain("rolls back the preferred-source change");
    expect(migration).toContain("This trigger is the sole automatic reset owner");
    expect(migration).not.toMatch(/constraint trigger/i);
    expect(migration).not.toMatch(/deferrable/i);
  });

  it("keeps preferred-source update and photo-review reset in one database transaction", () => {
    const triggerFn = migration.slice(
      migration.indexOf("create or replace function public.recognition_reset_photo_review_on_preferred_source_change"),
      migration.indexOf("drop trigger if exists recognition_candidates_preferred_source_change"),
    );
    const trigger = migration.slice(
      migration.indexOf("create trigger recognition_candidates_preferred_source_change"),
      migration.indexOf("revoke all on function public.upsert_recognition_candidate_photo_review"),
    );
    expect(trigger).toContain("after update of preferred_source_entry_id");
    expect(trigger).toContain("for each row");
    expect(trigger).toContain("execute function public.recognition_reset_photo_review_on_preferred_source_change()");
    expect(triggerFn).toContain("new.preferred_source_entry_id is distinct from old.preferred_source_entry_id");
    expect(triggerFn).toContain("perform public.reset_recognition_candidate_photo_review(new.id)");
    expect(triggerFn).toContain("SAME transaction");
    expect(triggerFn).toContain("Application code must not");
    expect(triggerFn).toContain("call reset_recognition_candidate_photo_review after updating preferred source");
  });

  it("keeps original photos immutable and crop metadata separate", () => {
    expect(migration).toContain("create table if not exists public.recognition_candidate_photo_reviews");
    expect(migration).toContain("crop_x numeric");
    expect(migration).toContain("Original evidence stays immutable");
    expect(migration.toLowerCase()).not.toContain("face-recognition");
    expect(migration.toLowerCase()).not.toContain("face_recognition");
  });
});

describe("Recognition presentation export migration security", () => {
  const migration = readMigration("041_recognition_presentation_exports.sql");

  it("adds an additive audit table without mutating evidence", () => {
    expect(migration).toContain("create table if not exists public.recognition_presentation_exports");
    expect(migration).not.toMatch(/update public\.recognition_submission_entries/i);
    expect(migration).not.toMatch(/update public\.recognition_submissions/i);
    expect(migration).not.toMatch(/update public\.recognition_candidates/i);
    expect(migration).not.toMatch(/update public\.recognition_candidate_photo_reviews/i);
    expect(migration).not.toMatch(/drop table/i);
    expect(migration.toLowerCase()).not.toContain("face-recognition");
  });

  it("keeps export audit internal to service_role", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("force row level security");
    expect(migration).toContain("revoke all on table public.recognition_presentation_exports from public;");
    expect(migration).toContain("revoke all on table public.recognition_presentation_exports from anon;");
    expect(migration).toContain("revoke all on table public.recognition_presentation_exports from authenticated;");
    expect(migration).toContain("grant all on table public.recognition_presentation_exports to service_role;");
  });

  it("does not store PPTX bytes", () => {
    expect(migration).toContain("The PPTX file is not stored");
    expect(migration).not.toContain("bytea");
    expect(migration).not.toContain("storage.objects");
  });
});

describe("Recognition admin-only table grants", () => {
  const migration = readMigration("043_recognition_admin_only_grants.sql");

  it("forces RLS and revokes client roles from Recognition tables", () => {
    const tables = [
      "recognition_award_definitions",
      "recognition_ppt_themes",
      "recognition_admin_members",
      "recognition_events",
      "recognition_event_awards",
      "recognition_submissions",
      "recognition_submission_entries",
      "recognition_candidates",
      "recognition_candidate_sources",
      "recognition_candidate_photo_reviews",
      "recognition_presentation_exports",
    ];
    for (const table of tables) {
      expect(migration).toContain(`alter table public.${table} force row level security;`);
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated;`);
      expect(migration).toContain(`grant all on table public.${table} to service_role;`);
    }
  });

  it("does not add client storage policies for recognition photos", () => {
    expect(migration.toLowerCase()).not.toContain("create policy");
    expect(migration).toContain("Do not add storage.objects policies for bucket recognition-photos");
  });

  it("does not treat recognition_admin_members as a grant source", () => {
    expect(migration).toContain("President rank does not grant access");
    const service = readFileSync(resolve(process.cwd(), "src/lib/recognition/recognition-service.ts"), "utf8");
    expect(service).toContain("resolveIsSuperAdmin");
    expect(service).not.toContain('.from("recognition_admin_members")');
  });
});
