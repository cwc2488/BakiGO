import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("076 training checklist migration security", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/076_training_checklist_v1.sql"),
    "utf8",
  );

  it("is additive and service-role only", () => {
    expect(sql).toMatch(/create table if not exists public\.training_items/i);
    expect(sql).toMatch(/create table if not exists public\.training_signoffs/i);
    expect(sql).toMatch(/create table if not exists public\.training_item_learning_links/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/alter table public\.members/i);
    expect(sql).not.toMatch(/alter table public\.organization_relationships/i);
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on table public.training_items from anon, authenticated");
    expect(sql).toContain("revoke all on table public.training_signoffs from anon, authenticated");
    expect(sql).toContain("grant all on table public.training_items to service_role");
    expect(sql).toContain("grant all on table public.training_signoffs to service_role");
  });

  it("protects against duplicate and self sign-off", () => {
    expect(sql).toContain("training_signoffs_trainee_item_uidx");
    expect(sql).toContain("trainee_member_id <> signer_member_id");
    expect(sql).toContain("on delete restrict");
  });

  it("seeds 25 V1 names without 360 and without learning link seed", () => {
    const names = [
      "開名單轉介紹",
      "主動釣竿（1）",
      "主動釣竿（2）",
      "被動釣竿（1）",
      "XPRO 深度營養培訓",
      "BeU 體驗",
      "締結諮詢",
      "售後服務",
      "邀約會議",
    ];
    for (const name of names) {
      expect(sql).toContain(name);
    }
    expect(sql).not.toMatch(/360/);
    expect(sql).not.toMatch(/insert into public\.training_item_learning_links/i);
  });
});
