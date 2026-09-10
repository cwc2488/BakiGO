import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { decryptLose2kgToken, encryptLose2kgToken } from "@/lib/lose2kg/token-crypto";

const ROOT = process.cwd();

describe("lose2kg V3 token crypto", () => {
  it("round-trips encrypted share tokens", () => {
    const raw = "abcdefghijklmnopqrstuvwxyz12";
    const enc = encryptLose2kgToken(raw);
    expect(enc.startsWith("l2k1:")).toBe(true);
    expect(enc).not.toContain(raw);
    expect(decryptLose2kgToken(enc)).toBe(raw);
  });

  it("returns null for invalid payloads", () => {
    expect(decryptLose2kgToken(null)).toBeNull();
    expect(decryptLose2kgToken("not-encrypted")).toBeNull();
    expect(decryptLose2kgToken("l2k1:bad.payload.here")).toBeNull();
  });
});

describe("lose2kg V3 persistent URLs + delete permissions", () => {
  it("migration 080 is additive only", () => {
    const sql = readFileSync(
      resolve(ROOT, "supabase/migrations/080_lose2kg_v3_persistent_tokens.sql"),
      "utf8",
    );
    expect(sql).toContain("add column if not exists");
    expect(sql).toContain("staff_token_encrypted");
    expect(sql).toContain("live_token_encrypted");
    expect(sql.toLowerCase()).not.toContain("drop table");
    expect(sql.toLowerCase()).not.toContain("drop column");
  });

  it("admin control center and delete require Super Admin", () => {
    const control = readFileSync(
      resolve(ROOT, "src/app/api/admin/lose2kg/periods/[periodId]/control-center/route.ts"),
      "utf8",
    );
    const periodRoute = readFileSync(
      resolve(ROOT, "src/app/api/admin/lose2kg/periods/[periodId]/route.ts"),
      "utf8",
    );
    expect(control).toContain("requireLose2kgAdmin");
    expect(control).toContain("getAdminControlCenter");
    expect(periodRoute).toContain("export async function DELETE");
    expect(periodRoute).toContain("requireLose2kgAdmin");
    expect(periodRoute).toContain("deletePeriod");
  });

  it("staff APIs have no period delete endpoint", () => {
    const staffRoot = resolve(ROOT, "src/app/api/lose2kg/staff");
    expect(existsSync(resolve(staffRoot, "[token]/route.ts"))).toBe(true);
    expect(existsSync(resolve(staffRoot, "[token]/delete/route.ts"))).toBe(false);
    const measure = readFileSync(
      resolve(staffRoot, "[token]/measure/route.ts"),
      "utf8",
    );
    expect(measure).not.toContain("deletePeriod");
    const bootstrap = readFileSync(
      resolve(ROOT, "src/lib/lose2kg/v2-service.ts"),
      "utf8",
    );
    expect(bootstrap).toContain("getStaffBootstrap");
    expect(bootstrap).toContain("getStaffDrawBootstrap");
    // lean bootstrap must not pull draws/temp in the same function body as getStaffBootstrap return
    const bootFn = bootstrap.slice(
      bootstrap.indexOf("export async function getStaffBootstrap"),
      bootstrap.indexOf("export async function getStaffDrawBootstrap"),
    );
    expect(bootFn).not.toContain("lose2kg_draws");
    expect(bootFn).not.toContain("temp_draw");
  });

  it("admin UI removes one-time-only copy and adds danger delete", () => {
    const page = readFileSync(
      resolve(ROOT, "src/components/lose2kg/Lose2kgPeriodPage.tsx"),
      "utf8",
    );
    expect(page).not.toContain("只顯示一次");
    expect(page).toContain("PersistentShareUrl");
    expect(page).toContain("危險操作");
    expect(page).toContain("deleteLose2kgPeriod");
    expect(page).toContain("DELETE");
  });

  it("staff workstation exposes 4-slot grid and local updates", () => {
    const page = readFileSync(
      resolve(ROOT, "src/components/lose2kg/Lose2kgStaffWorkstationPage.tsx"),
      "utf8",
    );
    expect(page).toContain("第{s}次");
    expect(page).toContain("slots: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4]");
    expect(page).toContain("patchParticipant");
    const measureSave = page.slice(
      page.indexOf("async function saveMeasure"),
      page.indexOf("async function submitExtraTickets"),
    );
    expect(measureSave).not.toContain("loadBootstrap");
    const addTicketsFn = page.slice(
      page.indexOf("async function submitExtraTickets"),
      page.indexOf("if (!gate)"),
    );
    expect(addTicketsFn).not.toContain("loadBootstrap");
    expect(page).not.toContain("draw-bootstrap");
    expect(page).not.toContain("DrawRevealOverlay");
    expect(page).toContain("ticket-breakdown");
  });
});
