import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_RECOGNITION_AWARDS,
  generateRecognitionPublicToken,
  hashRecognitionPublicToken,
  normalizeRecognitionSubmittedName,
  RECOGNITION_PUBLIC_MAX_ENTRIES,
  resolveRecognitionCollectionState,
  toRecognitionSubmissionRpcEntries,
  validateRecognitionPublicEntryCount,
  validateRecognitionPublicPhoto,
  validateRecognitionPublicSubmissionAgainstAwards,
} from "@/lib/recognition/recognition-domain";

describe("Recognition public domain", () => {
  it("generates an opaque high-entropy token", () => {
    const token = generateRecognitionPublicToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes token deterministically", () => {
    const token = "abc123_token";
    expect(hashRecognitionPublicToken(token)).toBe(hashRecognitionPublicToken(token));
  });

  it("does not strip frozen titles during normalization", () => {
    expect(normalizeRecognitionSubmittedName(" 王小明老師 ")).toBe("王小明老師");
    expect(normalizeRecognitionSubmittedName("王 小明 督導")).toBe("王 小明 督導");
  });

  it("resolves open collection only when status=collecting and inside time window", () => {
    const now = Date.parse("2026-09-10T12:00:00Z");
    expect(
      resolveRecognitionCollectionState({
        exists: true,
        status: "collecting",
        collectStartsAt: "2026-09-01T00:00:00Z",
        collectEndsAt: "2026-09-30T00:00:00Z",
        nowMs: now,
      }),
    ).toBe("open");
  });

  it("rejects collection before start", () => {
    expect(
      resolveRecognitionCollectionState({
        exists: true,
        status: "collecting",
        collectStartsAt: "2026-09-11T00:00:00Z",
        collectEndsAt: "2026-09-30T00:00:00Z",
        nowMs: Date.parse("2026-09-10T12:00:00Z"),
      }),
    ).toBe("not_started");
  });

  it("rejects collection after end", () => {
    expect(
      resolveRecognitionCollectionState({
        exists: true,
        status: "collecting",
        collectStartsAt: "2026-09-01T00:00:00Z",
        collectEndsAt: "2026-09-09T00:00:00Z",
        nowMs: Date.parse("2026-09-10T12:00:00Z"),
      }),
    ).toBe("expired");
  });

  it("rejects draft and closed events", () => {
    expect(
      resolveRecognitionCollectionState({
        exists: true,
        status: "draft",
        collectStartsAt: null,
        collectEndsAt: null,
      }),
    ).toBe("not_started");
    expect(
      resolveRecognitionCollectionState({
        exists: true,
        status: "closed",
        collectStartsAt: null,
        collectEndsAt: null,
      }),
    ).toBe("closed");
  });

  it("enforces max entry count", () => {
    expect(validateRecognitionPublicEntryCount(RECOGNITION_PUBLIC_MAX_ENTRIES + 1)).not.toBeNull();
  });

  it("accepts valid image mime and size", () => {
    expect(validateRecognitionPublicPhoto({ mimeType: "image/jpeg", byteSize: 1024 })).toBeNull();
  });

  it("rejects invalid image mime", () => {
    expect(validateRecognitionPublicPhoto({ mimeType: "application/pdf", byteSize: 1024 })).not.toBeNull();
  });

  it("rejects oversized image", () => {
    expect(validateRecognitionPublicPhoto({ mimeType: "image/jpeg", byteSize: 11 * 1024 * 1024 })).not.toBeNull();
  });

  it("accepts enabled non-photo award without photo", () => {
    const awards = [{
      eventAwardId: "evt-award-1",
      awardDefinitionId: "def-1",
      slug: DEFAULT_RECOGNITION_AWARDS[0].slug,
      name: DEFAULT_RECOGNITION_AWARDS[0].name,
      requiresPhoto: false,
      sortOrder: 1,
    }];
    expect(validateRecognitionPublicSubmissionAgainstAwards({
      entries: [{ submittedName: "王小明", eventAwardId: "evt-award-1", originalPhotoStoragePath: null }],
      awards,
    })).toBeNull();
  });

  it("rejects missing photo for photo-required award", () => {
    const awards = [{
      eventAwardId: "evt-award-1",
      awardDefinitionId: "def-1",
      slug: DEFAULT_RECOGNITION_AWARDS[2].slug,
      name: DEFAULT_RECOGNITION_AWARDS[2].name,
      requiresPhoto: true,
      sortOrder: 1,
    }];
    expect(validateRecognitionPublicSubmissionAgainstAwards({
      entries: [{ submittedName: "王小明", eventAwardId: "evt-award-1", originalPhotoStoragePath: null }],
      awards,
    })).toBe(`「${DEFAULT_RECOGNITION_AWARDS[2].name}」需要照片。`);
  });

  it("rejects disabled or foreign award ids", () => {
    const awards = [{
      eventAwardId: "evt-award-1",
      awardDefinitionId: "def-1",
      slug: DEFAULT_RECOGNITION_AWARDS[0].slug,
      name: DEFAULT_RECOGNITION_AWARDS[0].name,
      requiresPhoto: false,
      sortOrder: 1,
    }];
    expect(validateRecognitionPublicSubmissionAgainstAwards({
      entries: [{ submittedName: "王小明", eventAwardId: "evt-award-2", originalPhotoStoragePath: null }],
      awards,
    })).toBe("包含無效或已停用的表揚項目。");
  });

  it("supports multiple entries in one submission", () => {
    const awards = [
      {
        eventAwardId: "evt-award-1",
        awardDefinitionId: "def-1",
        slug: DEFAULT_RECOGNITION_AWARDS[0].slug,
        name: DEFAULT_RECOGNITION_AWARDS[0].name,
        requiresPhoto: false,
        sortOrder: 1,
      },
      {
        eventAwardId: "evt-award-2",
        awardDefinitionId: "def-2",
        slug: DEFAULT_RECOGNITION_AWARDS[2].slug,
        name: DEFAULT_RECOGNITION_AWARDS[2].name,
        requiresPhoto: true,
        sortOrder: 2,
      },
    ];
    expect(validateRecognitionPublicSubmissionAgainstAwards({
      entries: [
        { submittedName: "王小明", eventAwardId: "evt-award-1", originalPhotoStoragePath: null },
        { submittedName: "李小華", eventAwardId: "evt-award-2", originalPhotoStoragePath: "path/a.jpg" },
      ],
      awards,
    })).toBeNull();
  });

  it("preserves raw names while generating normalized names", () => {
    const payload = toRecognitionSubmissionRpcEntries([
      {
        id: "entry-1",
        eventAwardId: "evt-award-1",
        submittedName: " 王小明老師 ",
        normalizedName: "ignored",
        originalPhotoStoragePath: null,
        originalPhotoMimeType: null,
        originalPhotoSizeBytes: null,
      },
    ]);
    expect(payload[0]?.submitted_name).toBe(" 王小明老師 ");
    expect(payload[0]?.normalized_name).toBe("王小明老師");
  });

  it("phase 4 migration does not create candidate approval behavior", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/037_recognition_public_collection.sql"),
      "utf8",
    );
    expect(migration).not.toContain("recognition_candidates");
    expect(migration).not.toContain("approved");
  });

  it("public collection UX does not require organization and defers photo checks", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/components/recognition/RecognitionPublicCollectionPage.tsx"),
      "utf8",
    );
    expect(page).not.toContain("組織 / 團隊名稱");
    expect(page).not.toContain("A 組");
    expect(page).not.toContain("PresentationCropEditor");
    expect(page).not.toContain("縮放");
    expect(page).toContain("檢查並送出");
    expect(page).toContain("📷 上傳照片");
    expect(page).toContain("🔄 更換照片");
    expect(page).toContain("還有");
    expect(page).toContain("確認照片沒問題");
    expect(page).toContain("✅ 投稿完成");
    expect(page).toContain("sr-only");
  });
});
