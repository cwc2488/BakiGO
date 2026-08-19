import { describe, expect, it } from "vitest";
import { getPublicAppOrigin, PRODUCTION_APP_ORIGIN } from "@/lib/app/public-origin";
import {
  parseRecognitionPhotoRef,
  recognitionNamedPhotoError,
  recognitionPhotoHasUsableOriginal,
  recognitionPhotoStatusErrorMessage,
  recognitionPhotoStoragePathForDownload,
  RECOGNITION_MISSING_VALID_PHOTO,
} from "@/lib/recognition/recognition-photo-url";
import {
  buildRecognitionEventPptReadiness,
  isRecognitionPresentationPhotoReady,
  RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS,
  validateRecognitionPresentationPhoto,
} from "@/lib/recognition/recognition-photo-review";
import { listRecognitionPresentationPhotoBlockers } from "@/lib/recognition/recognition-presentation-readiness";

const STORAGE_PATH = "recognition/11111111-1111-1111-1111-111111111111/entries/22222222-2222-2222-2222-222222222222/original.jpg";
const ABSOLUTE_URL = "https://cdn.example.com/honoree.jpg";
const SUPABASE_PUBLIC_URL = `https://xyzcompany.supabase.co/storage/v1/object/public/recognition-photos/${STORAGE_PATH}`;
const SUPABASE_SIGNED_URL = `https://xyzcompany.supabase.co/storage/v1/object/sign/recognition-photos/${STORAGE_PATH}?token=abc.def`;
const DOUBLE_JOINED_URL = `https://xyzcompany.supabase.co/storage/v1/object/public/recognition-photos/${SUPABASE_PUBLIC_URL}`;
const VALID_CROP = { x: 0.1, y: 0.05, width: 0.45, height: 0.8 };

describe("Recognition photo URL / path boundary", () => {
  it("does not pass a storage object path to new URL, which is the production crash value", () => {
    let thrown: string | null = null;
    try {
      new URL(STORAGE_PATH);
    } catch (error) {
      thrown = error instanceof Error ? error.message : String(error);
    }
    expect(thrown).toBeTruthy();
    expect(thrown).toMatch(/Invalid URL|did not match the expected pattern|Failed to construct/i);
    const parsed = parseRecognitionPhotoRef(STORAGE_PATH);
    expect(parsed).toEqual({ ok: true, kind: "storage-path", storagePath: STORAGE_PATH });
    expect(recognitionPhotoStoragePathForDownload(STORAGE_PATH)).toBe(STORAGE_PATH);
  });

  it("keeps an absolute http(s) image URL", () => {
    expect(parseRecognitionPhotoRef(ABSOLUTE_URL)).toEqual({
      ok: true,
      kind: "https-url",
      url: ABSOLUTE_URL,
    });
    expect(recognitionPhotoHasUsableOriginal(ABSOLUTE_URL)).toBe(true);
    expect(recognitionPhotoStoragePathForDownload(ABSOLUTE_URL)).toBeNull();
  });

  it("converts a Supabase Storage public or signed URL into the object path", () => {
    expect(parseRecognitionPhotoRef(SUPABASE_PUBLIC_URL)).toEqual({
      ok: true,
      kind: "storage-path",
      storagePath: STORAGE_PATH,
    });
    expect(parseRecognitionPhotoRef(SUPABASE_SIGNED_URL)).toEqual({
      ok: true,
      kind: "storage-path",
      storagePath: STORAGE_PATH,
    });
    expect(parseRecognitionPhotoRef(DOUBLE_JOINED_URL)).toEqual({
      ok: true,
      kind: "storage-path",
      storagePath: STORAGE_PATH,
    });
  });

  it("treats empty and null refs as missing, never throws", () => {
    for (const value of [null, undefined, "", "   ", "null", "undefined"]) {
      expect(parseRecognitionPhotoRef(value)).toEqual({ ok: false, reason: "missing" });
      expect(recognitionPhotoHasUsableOriginal(value)).toBe(false);
    }
  });

  it("treats malformed refs as invalid without throwing", () => {
    for (const value of [
      "not a url",
      "http://",
      "https://",
      "://missing-scheme.com/a.jpg",
      "javascript:alert(1)",
      "recognition/../secret.jpg",
    ]) {
      const parsed = parseRecognitionPhotoRef(value);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.reason).toBe("malformed");
    }
  });

  it("keeps a valid data URL and rejects a blob URL for server-side PPT use", () => {
    const dataUrl = "data:image/jpeg;base64,AAAA";
    expect(parseRecognitionPhotoRef(dataUrl)).toEqual({
      ok: true,
      kind: "data-url",
      url: dataUrl,
    });
    const blob = parseRecognitionPhotoRef("blob:https://bakigo.tw/abc");
    expect(blob.ok).toBe(true);
    if (blob.ok) expect(blob.kind).toBe("blob-url");
    expect(recognitionPhotoHasUsableOriginal("blob:https://bakigo.tw/abc")).toBe(false);
  });

  it("resolves a relative app path against the public origin", () => {
    const parsed = parseRecognitionPhotoRef("/images/honoree.jpg");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.kind !== "https-url") {
      throw new Error("expected https-url");
    }
    expect(parsed.url).toBe(`${getPublicAppOrigin() || PRODUCTION_APP_ORIGIN}/images/honoree.jpg`);
  });

  it("maps the WebKit URL exception to 缺少有效照片", () => {
    const error = new Error("The string did not match the expected pattern.");
    expect(recognitionPhotoStatusErrorMessage(error)).toBe(RECOGNITION_MISSING_VALID_PHOTO);
    expect(recognitionNamedPhotoError("王小明")).toBe("王小明：缺少有效照片");
  });
});

describe("PPT readiness for approved photo refs", () => {
  it("marks an approved entry with a valid storage photo as ready when cropped", () => {
    const input = {
      requiresPhoto: true,
      reviewStatus: "approved" as const,
      hasOriginalPhoto: true,
      originalPhotoStoragePath: STORAGE_PATH,
      preferredSourceEntryId: "entry-1",
      preferredSourceBelongsToCandidate: true,
      preferredSourceHasOriginalPhoto: true,
      photoReview: {
        sourceEntryId: "entry-1",
        crop: VALID_CROP,
        isBlocked: false,
      },
    };
    expect(isRecognitionPresentationPhotoReady(input)).toBe(true);
    expect(validateRecognitionPresentationPhoto(input).blockers).toEqual([]);
    const readiness = buildRecognitionEventPptReadiness({ candidates: [input] });
    expect(readiness.readyPhotos).toBe(1);
    expect(readiness.invalidPhotos).toBe(0);
    expect(readiness.totalBlockingIssues).toBe(0);
  });

  it("does not crash, and reports 缺少有效照片, when an approved entry has a malformed photo string", () => {
    const input = {
      requiresPhoto: true,
      reviewStatus: "approved" as const,
      hasOriginalPhoto: false,
      originalPhotoStoragePath: "not a url",
      preferredSourceEntryId: "entry-1",
      preferredSourceBelongsToCandidate: true,
      preferredSourceHasOriginalPhoto: false,
      photoReview: {
        sourceEntryId: "entry-1",
        crop: VALID_CROP,
        isBlocked: false,
      },
    };
    expect(isRecognitionPresentationPhotoReady(input)).toBe(false);
    expect(validateRecognitionPresentationPhoto(input).blockers).toEqual([
      RECOGNITION_STRUCTURAL_PHOTO_BLOCKERS.invalidPhoto,
    ]);
    const readiness = buildRecognitionEventPptReadiness({ candidates: [input] });
    expect(readiness.invalidPhotos).toBe(1);
    expect(readiness.readyPhotos).toBe(0);
    expect(readiness.totalBlockingIssues).toBe(1);
    const blockers = listRecognitionPresentationPhotoBlockers({
      candidates: [{
        id: "cand-1",
        displayName: "王小明",
        ...input,
      }],
    });
    expect(blockers).toEqual([{
      candidateId: "cand-1",
      displayName: "王小明",
      reason: "缺少有效照片",
    }]);
  });

  it("reports missing original when the approved entry has a null/empty photo", () => {
    const input = {
      requiresPhoto: true,
      reviewStatus: "approved" as const,
      hasOriginalPhoto: false,
      originalPhotoStoragePath: null,
      preferredSourceEntryId: null,
      photoReview: null,
    };
    const readiness = buildRecognitionEventPptReadiness({ candidates: [input] });
    expect(readiness.missingOriginalPhotos).toBe(1);
    expect(readiness.invalidPhotos).toBe(0);
  });
});
