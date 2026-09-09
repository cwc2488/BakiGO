import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/081_web_push_lead_tracking_v1.sql";
const SW = "public/sw.js";

describe("081 web push + lead tracking migration", () => {
  const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

  it("is additive and creates required tables", () => {
    expect(sql).toMatch(/create table if not exists public\.push_subscriptions/i);
    expect(sql).toMatch(/create table if not exists public\.notification_deliveries/i);
    expect(sql).toMatch(/create table if not exists public\.lead_tracking/i);
    expect(sql).toMatch(/create table if not exists public\.lead_tracking_history/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/alter table public\.(members|customers|calendar_event_participants)/i);
  });

  it("enables RLS and owner policies", () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toContain("push_subscriptions_select_own");
    expect(sql).toContain("lead_tracking_select_own");
    expect(sql).toContain("lead_tracking_history_select_own");
  });

  it("unique endpoint + delivery dedupe constraints", () => {
    expect(sql).toContain("push_subscriptions_endpoint_unique");
    expect(sql).toContain("notification_deliveries_dedupe_unique");
  });
});

describe("service worker push handler", () => {
  const sw = readFileSync(resolve(process.cwd(), SW), "utf8");

  it("handles push and keeps notificationclick", () => {
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain("showNotification");
    expect(sw).toContain('addEventListener("notificationclick"');
    expect(sw).toContain("SYNC_CALENDAR_REMINDERS");
  });

  it("sanitizes deep link urls", () => {
    expect(sw).toContain("sanitizeUrl");
    expect(sw).toContain("javascript:");
  });
});
