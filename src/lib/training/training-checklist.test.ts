import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { collectDownlineMemberNumbers } from "@/lib/cloud/build-cloud-organization-tree";
import {
  canSignOffTrainingMember,
  canViewTrainingMember,
  isTrainingDownline,
  type TrainingOrgAuthContext,
} from "@/lib/training/training-organization-access";
import {
  TRAINING_V1_ITEM_KEYS,
  TRAINING_V1_ITEM_NAMES,
  buildIncompleteCount,
  formatTrainingSignedDate,
  partitionChecklistEntries,
} from "@/lib/training/training-checklist-helpers";
import type { CloudMember, CloudOrganizationRelationship } from "@/types/cloud";
import type { TrainingChecklistEntry } from "@/types/training-checklist";

function member(partial: Partial<CloudMember> & Pick<CloudMember, "id" | "memberNumber" | "name">): CloudMember {
  return {
    email: `${partial.memberNumber}@example.com`,
    role: "member",
    currentLevel: "supervisor",
    sponsorMemberNumber: null,
    avatarUrl: null,
    createdAt: "2026-01-01",
    ...partial,
  };
}

function buildCtx(): TrainingOrgAuthContext {
  const members = [
    member({ id: "upline", memberNumber: "100", name: "上線A" }),
    member({
      id: "downline",
      memberNumber: "200",
      name: "下線B",
      sponsorMemberNumber: "100",
    }),
    member({
      id: "downline2",
      memberNumber: "300",
      name: "下線C",
      sponsorMemberNumber: "200",
    }),
    member({ id: "outsider", memberNumber: "900", name: "外人D" }),
  ];
  const relationships: CloudOrganizationRelationship[] = [
    {
      id: "r1",
      parentMemberNumber: "100",
      childMemberNumber: "200",
      createdAt: "2026-01-01",
    },
  ];
  return {
    members,
    relationships,
    membersById: new Map(members.map((item) => [item.id, item])),
  };
}

describe("training organization access", () => {
  it("allows self view and blocks self sign-off", () => {
    const ctx = buildCtx();
    expect(canViewTrainingMember("downline", "downline", ctx)).toBe(true);
    expect(canSignOffTrainingMember("downline", "downline", ctx)).toBe(false);
  });

  it("allows upline to view/sign downline and blocks outsider", () => {
    const ctx = buildCtx();
    expect(canViewTrainingMember("upline", "downline", ctx)).toBe(true);
    expect(canSignOffTrainingMember("upline", "downline", ctx)).toBe(true);
    expect(canViewTrainingMember("upline", "downline2", ctx)).toBe(true);
    expect(canViewTrainingMember("outsider", "downline", ctx)).toBe(false);
    expect(canSignOffTrainingMember("outsider", "downline", ctx)).toBe(false);
    expect(isTrainingDownline("downline", "upline", ctx)).toBe(false);
  });

  it("reuses collectDownlineMemberNumbers dual-edge source of truth", () => {
    const ctx = buildCtx();
    const downline = collectDownlineMemberNumbers(
      "100",
      ctx.members,
      ctx.relationships,
    );
    expect(downline.has("200")).toBe(true);
    expect(downline.has("300")).toBe(true);
    expect(downline.has("900")).toBe(false);
  });
});

describe("training checklist helpers", () => {
  it("computes incomplete counts without inventing percentages", () => {
    expect(buildIncompleteCount(25, 3)).toBe(22);
    expect(buildIncompleteCount(25, 30)).toBe(0);
  });

  it("partitions incomplete before completed", () => {
    const entries = [
      { status: "completed" },
      { status: "incomplete" },
      { status: "completed" },
    ] as TrainingChecklistEntry[];
    const parts = partitionChecklistEntries(entries);
    expect(parts.incomplete).toHaveLength(1);
    expect(parts.completed).toHaveLength(2);
  });

  it("formats signed dates as yyyy/mm/dd", () => {
    expect(formatTrainingSignedDate("2026-09-01T12:00:00.000Z")).toBe("2026/09/01");
  });
});

describe("training V1 seed contract", () => {
  it("has exactly 25 items with required names and no 360 wording", () => {
    expect(TRAINING_V1_ITEM_NAMES).toHaveLength(25);
    expect(TRAINING_V1_ITEM_KEYS).toHaveLength(25);
    expect(TRAINING_V1_ITEM_NAMES).toContain("XPRO 深度營養培訓");
    expect(TRAINING_V1_ITEM_NAMES).toContain("BeU 體驗");
    expect(TRAINING_V1_ITEM_NAMES).toContain("主動釣竿（1）");
    expect(TRAINING_V1_ITEM_NAMES).toContain("主動釣竿（2）");
    expect(TRAINING_V1_ITEM_NAMES).toContain("被動釣竿（1）");
    expect(TRAINING_V1_ITEM_NAMES).toContain("締結諮詢");
    expect(TRAINING_V1_ITEM_NAMES).toContain("售後服務");
    expect(TRAINING_V1_ITEM_NAMES).toContain("邀約會議");
    for (const name of TRAINING_V1_ITEM_NAMES) {
      expect(name).not.toMatch(/360/);
    }
    expect(TRAINING_V1_ITEM_KEYS).toContain("xpro_deep_nutrition");
  });

  it("migration seeds 25 items and never maps XPRO learning links", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/076_training_checklist_v1.sql"),
      "utf8",
    );
    expect(sql).toContain("training_items");
    expect(sql).toContain("training_signoffs");
    expect(sql).toContain("training_item_learning_links");
    expect(sql).toContain("XPRO 深度營養培訓");
    expect(sql).toContain("締結諮詢");
    expect(sql).toContain("售後服務");
    expect(sql).toContain("邀約會議");
    expect(sql).not.toMatch(/360/);
    expect(sql).toContain("trainee_member_id <> signer_member_id");
    expect(sql).toContain("training_signoffs_trainee_item_uidx");
    // No learning link inserts in seed.
    expect(sql).not.toMatch(/insert into public\.training_item_learning_links/i);
  });

  it("service blocks XPRO learning mapping and ignores client signer id in API", () => {
    const service = readFileSync(
      resolve(process.cwd(), "src/lib/training/training-service.ts"),
      "utf8",
    );
    expect(service).toContain("xpro_deep_nutrition");
    expect(service).toContain("XPRO 深度營養培訓不建立學習庫對應");
    expect(service).toContain("signer_member_id: input.viewerMemberId");

    const signoffApi = readFileSync(
      resolve(process.cwd(), "src/app/api/training/signoff/route.ts"),
      "utf8",
    );
    expect(signoffApi).toContain("viewerMemberId: memberId");
    expect(signoffApi).toContain("void body.signerMemberId");

    const panel = readFileSync(
      resolve(process.cwd(), "src/components/training/TrainingChecklistViewPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("TrainingLearningActionLabel");
    expect(panel).toContain("LearningPickerSheet");
    expect(panel).not.toContain("目前沒有教材");
    expect(panel).not.toContain("尚未建立教材");

    const learningUi = readFileSync(
      resolve(process.cwd(), "src/components/training/training-ui.tsx"),
      "utf8",
    );
    expect(learningUi).toContain("學習內容");
  });

  it("home entry and admin center are wired without preloading training on home", () => {
    const home = readFileSync(
      resolve(process.cwd(), "src/lib/home/my-home-presentation.ts"),
      "utf8",
    );
    expect(home).toContain('href: "/training"');
    expect(home).toContain('title: "培訓檢核"');

    const homePage = readFileSync(
      resolve(process.cwd(), "src/components/home/HomePage.tsx"),
      "utf8",
    );
    expect(homePage).not.toContain("/api/training");

    const admin = readFileSync(
      resolve(process.cwd(), "src/components/admin/AdminCenterPage.tsx"),
      "utf8",
    );
    expect(admin).toContain("/admin/training");
  });
});
