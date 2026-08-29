import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BAKI_GO_DEFAULT_DESCRIPTION,
  BAKI_GO_DEFAULT_TITLE,
} from "./default-metadata";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("global default metadata", () => {
  it("uses consumer-facing brand copy", () => {
    expect(BAKI_GO_DEFAULT_TITLE).toBe("Baki Go｜讓改變更容易開始");
    expect(BAKI_GO_DEFAULT_DESCRIPTION).toBe(
      "從了解自己、開始行動到持續進步，Baki Go 陪你一步一步完成改變。",
    );
  });

  it("removes legacy direct-sales positioning from global defaults", () => {
    const layout = readRepoFile("src/app/layout.tsx");
    const manifest = readRepoFile("public/manifest.json");

    expect(layout).not.toContain("直銷組織的每日成長夥伴");
    expect(manifest).not.toContain("直銷組織的每日成長夥伴");
    expect(layout).toContain("BAKI_GO_DEFAULT_TITLE");
    expect(layout).toContain("BAKI_GO_DEFAULT_DESCRIPTION");
    expect(manifest).toContain(BAKI_GO_DEFAULT_DESCRIPTION);
  });

  it("does not modify quiz-specific metadata modules", () => {
    const quizMetadata = readRepoFile("src/lib/quiz/fat-loss/public-metadata.ts");
    expect(quizMetadata).toContain("FAT_LOSS_QUIZ_OG_TITLE");
    expect(quizMetadata).not.toContain("直銷組織的每日成長夥伴");
  });
});
