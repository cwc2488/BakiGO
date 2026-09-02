import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BAKI_GO_DEFAULT_DESCRIPTION,
  BAKI_GO_DEFAULT_OG_IMAGE_HEIGHT,
  BAKI_GO_DEFAULT_OG_IMAGE_PATH,
  BAKI_GO_DEFAULT_OG_IMAGE_WIDTH,
  BAKI_GO_DEFAULT_TITLE,
} from "./default-metadata";
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_OG_IMAGE_SIZE,
} from "./generate-default-og-image";

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

  it("defines a native 1200×630 social preview image", () => {
    expect(BAKI_GO_DEFAULT_OG_IMAGE_PATH).toBe("/opengraph-image");
    expect(BAKI_GO_DEFAULT_OG_IMAGE_WIDTH).toBe(1200);
    expect(BAKI_GO_DEFAULT_OG_IMAGE_HEIGHT).toBe(630);
    expect(DEFAULT_OG_IMAGE_PATH).toBe(BAKI_GO_DEFAULT_OG_IMAGE_PATH);
    expect(DEFAULT_OG_IMAGE_SIZE).toEqual({ width: 1200, height: 630 });
  });

  it("wires global OG/Twitter image metadata without legacy copy", () => {
    const layout = readRepoFile("src/app/layout.tsx");
    const manifest = readRepoFile("public/manifest.json");
    const ogRoute = readRepoFile("src/app/opengraph-image.tsx");
    const twitterRoute = readRepoFile("src/app/twitter-image.tsx");

    expect(layout).not.toContain("直銷組織的每日成長夥伴");
    expect(manifest).not.toContain("直銷組織的每日成長夥伴");
    expect(layout).toContain("BAKI_GO_DEFAULT_OG_IMAGE_PATH");
    expect(layout).toContain("BAKI_GO_DEFAULT_OG_IMAGE_WIDTH");
    expect(layout).toContain("BAKI_GO_DEFAULT_OG_IMAGE_HEIGHT");
    expect(layout).toContain('card: "summary_large_image"');
    expect(layout).toContain("metadataBase");
    expect(ogRoute).toContain("generateDefaultOgImage");
    expect(twitterRoute).toContain("generateDefaultOgImage");
    expect(manifest).toContain(BAKI_GO_DEFAULT_DESCRIPTION);
  });

  it("does not modify quiz-specific metadata or OG image modules", () => {
    const quizMetadata = readRepoFile("src/lib/quiz/fat-loss/public-metadata.ts");
    const quizOgRoute = readRepoFile("src/app/quiz/fat-loss/opengraph-image.tsx");
    expect(quizMetadata).toContain("FAT_LOSS_QUIZ_OG_TITLE");
    expect(quizMetadata).toContain("FAT_LOSS_QUIZ_OG_IMAGE_PATH");
    expect(quizMetadata).toContain('"/quiz/fat-loss/opengraph-image"');
    expect(quizMetadata).not.toContain("直銷組織的每日成長夥伴");
    expect(quizMetadata).not.toContain("BAKI_GO_DEFAULT_OG_IMAGE_PATH");
    expect(quizOgRoute).toContain("generateFatLossQuizOgImage");
    expect(quizOgRoute).not.toContain("generateDefaultOgImage");
  });
});
