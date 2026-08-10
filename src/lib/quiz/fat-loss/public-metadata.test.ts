import { describe, expect, it } from "vitest";
import {
  FAT_LOSS_QUIZ_OG_DESCRIPTION,
  FAT_LOSS_QUIZ_OG_IMAGE_PATH,
  FAT_LOSS_QUIZ_OG_TITLE,
  FAT_LOSS_QUIZ_PUBLIC_DESCRIPTION,
  FAT_LOSS_QUIZ_PUBLIC_PAGE_TITLE,
  buildFatLossQuizPublicMetadata,
} from "./public-metadata";

const FORBIDDEN_PUBLIC_WORDS = [
  "直銷",
  "直銷組織",
  "組織成長",
  "開發名單",
  "潛在客戶",
  "招募",
  "Herbalife",
  "賀寶芙",
  "AI Radar",
  "陌生開發",
];

describe("fat-loss public metadata", () => {
  it("uses consumer-facing quiz copy", () => {
    const metadata = buildFatLossQuizPublicMetadata({
      requestOrigin: "https://bakigo.tw",
    });

    expect(metadata.title).toBe(FAT_LOSS_QUIZ_PUBLIC_PAGE_TITLE);
    expect(metadata.description).toBe(FAT_LOSS_QUIZ_PUBLIC_DESCRIPTION);
    expect(metadata.openGraph?.title).toBe(FAT_LOSS_QUIZ_OG_TITLE);
    expect(metadata.openGraph?.description).toBe(FAT_LOSS_QUIZ_OG_DESCRIPTION);
    expect(metadata.metadataBase?.toString()).toBe("https://bakigo.tw/");
    const images = metadata.openGraph?.images;
    const firstImage = Array.isArray(images) ? images[0] : images;
    expect(firstImage).toMatchObject({
      url: FAT_LOSS_QUIZ_OG_IMAGE_PATH,
      width: 1200,
      height: 630,
    });
  });

  it("does not include internal positioning words", () => {
    const metadata = buildFatLossQuizPublicMetadata();
    const serialized = JSON.stringify(metadata);

    for (const word of FORBIDDEN_PUBLIC_WORDS) {
      expect(serialized).not.toContain(word);
    }
  });
});
