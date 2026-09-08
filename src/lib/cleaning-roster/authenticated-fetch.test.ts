import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("cleaning roster authenticated client wiring", () => {
  it("routes all client API calls through cleaningRosterFetch + Bearer helper", () => {
    const client = readFileSync(resolve(ROOT, "src/lib/cleaning-roster/client.ts"), "utf8");
    const authFetch = readFileSync(
      resolve(ROOT, "src/lib/cleaning-roster/authenticated-fetch.ts"),
      "utf8",
    );

    expect(authFetch).toContain('from "@/lib/quiz/quiz-member-fetch"');
    expect(authFetch).toContain("fetchWithMemberAuth");
    expect(authFetch).toContain("cleaningRosterFetch");

    expect(client).toContain("cleaningRosterFetch");
    expect(client).not.toMatch(/\bfetch\s*\(/);

    for (const path of [
      "/api/admin/cleaning-roster",
      "/api/admin/cleaning-roster/areas",
      "/api/admin/cleaning-roster/members",
      "/api/admin/cleaning-roster/draw",
      "/api/admin/cleaning-roster/confirm",
      "/api/admin/cleaning-roster/reset-fairness",
    ]) {
      expect(client).toContain(path);
    }
  });

  it("keeps server Super Admin gate intact", () => {
    const api = readFileSync(resolve(ROOT, "src/lib/cleaning-roster/api.ts"), "utf8");
    expect(api).toContain("requireCleaningRosterAdmin");
    expect(api).toContain("getMemberIdFromRequest");
    expect(api).toContain("assertSuperAdmin");
  });
});
