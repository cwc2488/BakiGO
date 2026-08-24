import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Recognition presentation security and immutability", () => {
  it("loads private originals server-side and does not create public URLs", () => {
    const images = read("src/lib/recognition/recognition-presentation-images.ts");
    const service = read("src/lib/recognition/recognition-presentation-service.ts");
    expect(service).toContain("getRecognitionCandidatePhotoObject");
    expect(images).not.toContain("getPublicUrl");
    expect(images).not.toContain("createSignedUrl");
    expect(service).not.toContain("getPublicUrl");
    expect(service).not.toContain("createSignedUrl");
  });

  it("does not mutate raw evidence or photo-review state during generation", () => {
    const service = read("src/lib/recognition/recognition-presentation-service.ts");
    expect(service).not.toMatch(/\.from\(["']recognition_submissions["']\)/);
    expect(service).not.toMatch(/\.from\(["']recognition_submission_entries["']\)/);
    expect(service).not.toMatch(/\.from\(["']recognition_candidates["']\)\.update/);
    expect(service).not.toMatch(/upsert_recognition_candidate_photo_review/);
    expect(service).not.toMatch(/reset_recognition_candidate_photo_review/);
    expect(service).toContain("insertRecognitionPresentationExportSuccess");
  });

  it("does not introduce face recognition or identity inference", () => {
    const files = [
      "src/lib/recognition/recognition-presentation-service.ts",
      "src/lib/recognition/recognition-presentation-images.ts",
      "src/lib/recognition/recognition-presentation-crop.ts",
      "src/lib/recognition/recognition-presentation-pptx.ts",
      "src/lib/recognition/load-pptxgenjs.ts",
    ];
    for (const file of files) {
      const source = read(file).toLowerCase();
      expect(source).not.toContain("face-recognition");
      expect(source).not.toContain("face_recognition");
      expect(source).not.toContain("facelandmark");
      expect(source).not.toContain("identity inference");
    }
  });

  it("converts HEIC/HEIF instead of silently skipping it", () => {
    const images = read("src/lib/recognition/recognition-presentation-images.ts");
    expect(images).toContain("heic-convert");
    expect(images).toContain("無法轉換 HEIC 照片");
    expect(images).toContain("format === \"heic\"");
  });

  it("inserts export audit only after a successful render", () => {
    const service = read("src/lib/recognition/recognition-presentation-service.ts");
    const generateFn = service.slice(service.indexOf("export async function generateRecognitionPresentationPptx"));
    const renderIndex = generateFn.indexOf("await renderRecognitionPresentationPptx");
    const insertIndex = generateFn.indexOf("await insertRecognitionPresentationExportSuccess");
    expect(renderIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(renderIndex);
    expect(generateFn.indexOf("status: \"failed\"")).toBe(-1);
  });
});
