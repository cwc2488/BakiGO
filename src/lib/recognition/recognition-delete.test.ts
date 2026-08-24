import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { humanizeRecognitionDatabaseError } from "@/lib/recognition/recognition-service";

describe("Recognition event delete", () => {
  it("exposes a transactional delete RPC granted only to service_role", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/044_recognition_delete_event.sql"),
      "utf8",
    );
    expect(migration).toContain("create or replace function public.delete_recognition_event(p_event_id uuid)");
    expect(migration).toContain("delete from public.recognition_events");
    expect(migration).toContain("storage.objects");
    expect(migration).toContain("recognition-photos");
    expect(migration).toContain("revoke all on function public.delete_recognition_event(uuid) from public;");
    expect(migration).toContain("revoke all on function public.delete_recognition_event(uuid) from anon;");
    expect(migration).toContain("revoke all on function public.delete_recognition_event(uuid) from authenticated;");
    expect(migration).toContain("grant execute on function public.delete_recognition_event(uuid) to service_role;");
    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("truncate");
  });

  it("requires Super Admin on the DELETE API and a named confirm in the event UI", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/recognition/events/[eventId]/route.ts"),
      "utf8",
    );
    expect(route).toContain("export async function DELETE");
    expect(route).toContain("assertRecognitionAdmin");
    expect(route).toContain("deleteRecognitionEvent");

    const page = readFileSync(
      resolve(process.cwd(), "src/components/recognition/RecognitionEventPage.tsx"),
      "utf8",
    );
    expect(page).toContain("刪除活動");
    expect(page).toContain("確定刪除這個表揚活動？");
    expect(page).toContain("event.name");
    expect(page).toContain("deleteRecognitionEvent");
    expect(page).not.toContain("window.confirm");
  });

  it("maps missing Production schema to a human-readable recovery message", () => {
    expect(
      humanizeRecognitionDatabaseError("Could not find the table 'public.recognition_events' in the schema cache"),
    ).toContain("035_recognition_foundation.sql");
    expect(
      humanizeRecognitionDatabaseError(
        "Could not find the function public.create_recognition_event_with_awards(...) in the schema cache",
      ),
    ).toContain("036_recognition_event_rpcs.sql");
  });
});
