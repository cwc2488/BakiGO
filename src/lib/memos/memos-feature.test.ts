import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/082_memos_v1.sql";
const PROCESS_ROUTE = "src/app/api/push/process/route.ts";
const HOME = "src/components/home/HomePage.tsx";
const SW = "public/sw.js";

describe("082 memos migration", () => {
  const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

  it("is additive create-if-not-exists only", () => {
    expect(sql).toMatch(/create table if not exists public\.memos/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(
      /alter table public\.(members|push_subscriptions|notification_deliveries|lead_tracking)/i,
    );
  });

  it("stores reminder fields + due index", () => {
    expect(sql).toContain("reminder_type");
    expect(sql).toContain("next_reminder_at");
    expect(sql).toContain("last_notified_at");
    expect(sql).toContain("memos_due_reminder_idx");
    expect(sql).toContain("NONE");
    expect(sql).toContain("DAILY");
    expect(sql).toContain("WEEKLY");
    expect(sql).toContain("SPECIFIC_DATE");
  });

  it("enables owner-only RLS", () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toContain("memos_select_own");
    expect(sql).toContain("memos_insert_own");
    expect(sql).toContain("memos_update_own");
    expect(sql).toContain("memos_delete_own");
  });
});

describe("memo home placement", () => {
  const home = readFileSync(resolve(process.cwd(), HOME), "utf8");

  it("renders memos between greeting and 我的進度 (Case A)", () => {
    const greeting = home.indexOf("<GreetingHeader");
    const memos = home.indexOf("<HomeMemosCard");
    const progress = home.indexOf("我的進度");
    expect(greeting).toBeGreaterThan(-1);
    expect(memos).toBeGreaterThan(greeting);
    expect(progress).toBeGreaterThan(memos);
    expect(home).not.toContain('href: "/memos"');
  });
});

describe("memo push integrates existing worker (Case J)", () => {
  const route = readFileSync(resolve(process.cwd(), PROCESS_ROUTE), "utf8");
  const sw = readFileSync(resolve(process.cwd(), SW), "utf8");

  it("keeps calendar + lead schedulers and adds memo", () => {
    expect(route).toContain("processCalendarPushReminders");
    expect(route).toContain("processLeadTrackingPushReminders");
    expect(route).toContain("processMemoPushReminders");
  });

  it("does not replace the existing service worker push handler", () => {
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain("showNotification");
  });
});
