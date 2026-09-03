import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  formatTrainingDisplayDate,
  formatTrainingItemNumber,
  getValidTrainingLearningLinks,
} from "@/components/training/training-ui";
import type { TrainingLearningLink } from "@/types/training-checklist";

function link(
  partial: Partial<TrainingLearningLink> & Pick<TrainingLearningLink, "id" | "learningResourceId">,
): TrainingLearningLink {
  return {
    trainingItemId: "item",
    learningResourceTitle: partial.learningResourceTitle ?? null,
    learningResourceYoutubeUrl: partial.learningResourceYoutubeUrl ?? null,
    createdAt: "2026-09-01",
    ...partial,
  };
}

describe("training V3 compact UI + learning picker helpers", () => {
  it("formats display values", () => {
    expect(formatTrainingDisplayDate("2026-09-03T12:00:00.000Z")).toBe("2026.09.03");
    expect(formatTrainingItemNumber(3)).toBe("03");
  });

  it("filters invalid learning links and keeps order of valid ones", () => {
    const links = getValidTrainingLearningLinks([
      link({
        id: "1",
        learningResourceId: "a",
        learningResourceTitle: "A",
        learningResourceYoutubeUrl: "https://youtu.be/a",
      }),
      link({
        id: "2",
        learningResourceId: "bad",
        learningResourceTitle: null,
        learningResourceYoutubeUrl: null,
      }),
      link({
        id: "3",
        learningResourceId: "c",
        learningResourceTitle: "C",
        learningResourceYoutubeUrl: "https://youtu.be/c",
      }),
    ]);
    expect(links.map((item) => item.id)).toEqual(["1", "3"]);
  });

  it("uses compact list + learning picker + exit affordances", () => {
    const panel = readFileSync(
      resolve(process.cwd(), "src/components/training/TrainingChecklistViewPanel.tsx"),
      "utf8",
    );
    const ui = readFileSync(
      resolve(process.cwd(), "src/components/training/training-ui.tsx"),
      "utf8",
    );
    const member = readFileSync(
      resolve(process.cwd(), "src/components/training/TrainingMemberChecklistPage.tsx"),
      "utf8",
    );

    expect(panel).toContain("TrainingListSurface");
    expect(panel).toContain("LearningPickerSheet");
    expect(panel).toContain("links.length === 1");
    expect(panel).toContain("learningLinks.length > 1");
    expect(panel).toContain("onClose");
    expect(panel).toContain("確認完成培訓");
    expect(panel).toContain("applyLocalSignOff");
    expect(panel).toContain("checklistInflight");
    expect(ui).toContain("TrainingHeroCompact");
    expect(ui).toContain("學習內容");
    expect(member).toContain('backLabel="我的組織"');
    expect(member).toContain('backHref="/training/organization"');

    for (const src of [panel, ui]) {
      expect(src).not.toMatch(/完成率|星等|雷達|排行榜|AI 評分|confetti/i);
      expect(src).not.toContain("目前沒有教材");
      expect(src).not.toContain("learningLinks[0]");
    }
  });
});

describe("training V3 performance shape", () => {
  it("own checklist skips full org graph and batches training queries", () => {
    const service = readFileSync(
      resolve(process.cwd(), "src/lib/training/training-service.ts"),
      "utf8",
    );
    const access = readFileSync(
      resolve(process.cwd(), "src/lib/training/training-organization-access.ts"),
      "utf8",
    );

    expect(service).toContain("loadTrainingMemberById");
    expect(service).toContain("isOwnChecklist");
    expect(service).toMatch(
      /Promise\.all\(\[\s*[\s\S]*training_items[\s\S]*training_signoffs[\s\S]*training_item_learning_links/,
    );
    expect(access).toContain("id, member_number, name, sponsor_member_number, created_at");
    expect(access).toContain("parent_member_number, child_member_number");
    expect(access).not.toMatch(/\.from\("members"\)\s*\.select\("\*"\)/);
  });

  it("organization summary remains batched (no per-member training request)", () => {
    const service = readFileSync(
      resolve(process.cwd(), "src/lib/training/training-service.ts"),
      "utf8",
    );
    expect(service).toContain("listTrainingOrganizationSummaries");
    expect(service).toMatch(
      /training_signoffs[\s\S]*\.in\(\s*"trainee_member_id"/,
    );
  });
});
