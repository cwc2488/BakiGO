import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  applyRecognitionPersonConfidenceGate,
  clearRecognitionPersonDetectionCache,
  detectRecognitionPhotoPersons,
  RECOGNITION_PERSON_DETECT_CONFIDENCE_THRESHOLD,
} from "@/lib/recognition/recognition-person-detect";
import {
  evaluateRecognitionEntryValidation,
  RECOGNITION_UNCERTAIN_PERSON_MESSAGE,
} from "@/lib/recognition/recognition-validation";

const PHOTO_AWARD = { eventAwardId: "award-1", name: "新科督導", requiresPhoto: true };
const JPEG_PATH = "recognition/sub-1/entries/entry-1/original.jpg";
const PORTRAIT = { ok: true as const, width: 1200, height: 1600 };

async function sampleJpegBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  }).jpeg().toBuffer();
}

describe("Recognition person Vision confidence threshold", () => {
  afterEach(() => {
    clearRecognitionPersonDetectionCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exports the fail-closed threshold at 0.70", () => {
    expect(RECOGNITION_PERSON_DETECT_CONFIDENCE_THRESHOLD).toBe(0.70);
  });

  it("1. single + confidence 0.95 → PASS", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: {
        personCount: 1,
        personCountCategory: "single",
        confidence: 0.95,
      },
    });
    expect(result.submissionComplete).toBe(true);
    expect(result.pptReady).toBe(true);
    expect(result.issues.some((issue) => issue.code === "uncertain_person")).toBe(false);
  });

  it("2. single + confidence 0.69 → uncertain / blocked", () => {
    const gated = applyRecognitionPersonConfidenceGate({
      personCountCategory: "single",
      personCount: 1,
      confidence: 0.69,
    });
    expect(gated.personCountCategory).toBe("uncertain");

    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: {
        personCount: 1,
        personCountCategory: "single",
        confidence: 0.69,
      },
    });
    expect(result.issues.some((issue) => issue.code === "uncertain_person")).toBe(true);
    expect(result.issues.find((issue) => issue.code === "uncertain_person")?.message)
      .toBe(RECOGNITION_UNCERTAIN_PERSON_MESSAGE);
    expect(result.submissionComplete).toBe(false);
    expect(result.pptReady).toBe(false);
    expect(result.issues.some((issue) => issue.code === "multi_person")).toBe(false);
  });

  it("3. multiple + confidence 0.95 → existing multi-person confirm flow", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明、李小華",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: {
        personCount: 2,
        personCountCategory: "multiple",
        confidence: 0.95,
      },
    });
    expect(result.issues.some((issue) => issue.code === "multi_person")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "uncertain_person")).toBe(false);
    expect(result.submissionComplete).toBe(false);
    expect(result.pptReady).toBe(false);
  });

  it("4. multiple + confidence 0.69 → uncertain / blocked (not multi confirm)", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明、李小華",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: {
        personCount: 2,
        personCountCategory: "multiple",
        confidence: 0.69,
      },
      confirmedWarnings: ["multi_person"],
    });
    expect(result.issues.some((issue) => issue.code === "uncertain_person")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "multi_person")).toBe(false);
    expect(result.submissionComplete).toBe(false);
    expect(result.pptReady).toBe(false);
  });

  it("5. none + high confidence → no-person blocked", () => {
    const result = evaluateRecognitionEntryValidation({
      submittedName: "張少軒",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: {
        personCount: 0,
        personCountCategory: "none",
        confidence: 0.95,
      },
    });
    expect(result.issues.some((issue) => issue.code === "no_person")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "uncertain_person")).toBe(false);
    expect(result.pptReady).toBe(false);
  });

  it("6. missing confidence → uncertain / blocked", () => {
    const gated = applyRecognitionPersonConfidenceGate({
      personCountCategory: "single",
      personCount: 1,
      confidence: undefined,
    });
    expect(gated.personCountCategory).toBe("uncertain");

    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: {
        personCount: 1,
        personCountCategory: "single",
        // Simulate missing confidence without inventing a high default.
        confidence: undefined as unknown as number,
      },
    });
    expect(result.issues.some((issue) => issue.code === "uncertain_person")).toBe(true);
    expect(result.pptReady).toBe(false);
  });

  it("7. malformed confidence → uncertain / blocked", () => {
    expect(applyRecognitionPersonConfidenceGate({
      personCountCategory: "single",
      confidence: Number.NaN,
    }).personCountCategory).toBe("uncertain");

    expect(applyRecognitionPersonConfidenceGate({
      personCountCategory: "multiple",
      confidence: Number.POSITIVE_INFINITY,
    }).personCountCategory).toBe("uncertain");

    const result = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: {
        personCount: 1,
        personCountCategory: "single",
        confidence: Number.NaN,
      },
    });
    expect(result.issues.some((issue) => issue.code === "uncertain_person")).toBe(true);
    expect(result.pptReady).toBe(false);
  });

  it("8. Vision API failure → fail-closed uncertain", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await detectRecognitionPhotoPersons({
      buffer: await sampleJpegBuffer(),
      mimeType: "image/jpeg",
      apiKey: "test-key",
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(result.personCountCategory).toBe("uncertain");
    expect(result.confidence).toBe(0);
  });

  it("9. threshold boundary confidence = 0.70 → keep classification", () => {
    expect(RECOGNITION_PERSON_DETECT_CONFIDENCE_THRESHOLD).toBe(0.70);

    const single = applyRecognitionPersonConfidenceGate({
      personCountCategory: "single",
      personCount: 1,
      confidence: 0.70,
    });
    expect(single.personCountCategory).toBe("single");

    const multi = applyRecognitionPersonConfidenceGate({
      personCountCategory: "multiple",
      personCount: 2,
      confidence: 0.70,
    });
    expect(multi.personCountCategory).toBe("multiple");

    const pass = evaluateRecognitionEntryValidation({
      submittedName: "王小明",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: {
        personCount: 1,
        personCountCategory: "single",
        confidence: 0.70,
      },
    });
    expect(pass.pptReady).toBe(true);
    expect(pass.submissionComplete).toBe(true);

    const multiFlow = evaluateRecognitionEntryValidation({
      submittedName: "夫妻",
      award: PHOTO_AWARD,
      photoStoragePath: JPEG_PATH,
      photoMimeType: "image/jpeg",
      imageInspect: PORTRAIT,
      personDetection: {
        personCount: 2,
        personCountCategory: "multiple",
        confidence: 0.70,
      },
    });
    expect(multiFlow.issues.some((issue) => issue.code === "multi_person")).toBe(true);
    expect(multiFlow.issues.some((issue) => issue.code === "uncertain_person")).toBe(false);
  });
});
