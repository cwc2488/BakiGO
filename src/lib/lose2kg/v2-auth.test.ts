import { describe, expect, it } from "vitest";
import {
  hashStaffPassword,
  isValidStaffPassword,
  verifyStaffPassword,
} from "@/lib/lose2kg/staff-auth";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPublicPath } from "@/lib/auth/public-paths";

describe("lose2kg V2 staff auth", () => {
  it("accepts 4-8 alphanumeric passwords only", () => {
    expect(isValidStaffPassword("0821")).toBe(true);
    expect(isValidStaffPassword("Ab12")).toBe(true);
    expect(isValidStaffPassword("123")).toBe(false);
    expect(isValidStaffPassword("123456789")).toBe(false);
    expect(isValidStaffPassword("ab cd")).toBe(false);
  });

  it("hashes passwords (no plaintext equality)", () => {
    const hash = hashStaffPassword("0821");
    expect(hash).not.toBe("0821");
    expect(verifyStaffPassword("0821", hash)).toBe(true);
    expect(verifyStaffPassword("0822", hash)).toBe(false);
  });
});

describe("lose2kg V2 routes are public-open", () => {
  it("opens staff and live paths without app login", () => {
    expect(isPublicPath("/lose2kg/staff/abcdefghijklmnopqrstuv")).toBe(true);
    expect(isPublicPath("/lose2kg/live/abcdefghijklmnopqrstuv")).toBe(true);
  });

  it("keeps migration additive", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/079_lose2kg_v2_staff_live.sql"),
      "utf8",
    );
    expect(sql).toContain("add column if not exists");
    expect(sql.toLowerCase()).not.toContain("drop table");
    expect(sql.toLowerCase()).not.toContain("drop column");
  });
});
