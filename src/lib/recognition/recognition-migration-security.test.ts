import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Recognition Center migration security", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/036_recognition_event_rpcs.sql"),
    "utf8",
  );

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
