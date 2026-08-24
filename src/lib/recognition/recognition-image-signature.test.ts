import { describe, expect, it } from "vitest";
import {
  detectRecognitionImageFormat,
  validateRecognitionImageSignature,
} from "@/lib/recognition/recognition-image-signature";

describe("Recognition image signature validation", () => {
  it("rejects fake text declared as jpeg", () => {
    const buffer = Buffer.from("hello world", "utf8");
    expect(
      validateRecognitionImageSignature({ declaredMimeType: "image/jpeg", buffer }),
    ).not.toBeNull();
  });

  it("accepts valid JPEG signature", () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectRecognitionImageFormat(buffer)).toBe("jpeg");
    expect(
      validateRecognitionImageSignature({ declaredMimeType: "image/jpeg", buffer }),
    ).toBeNull();
  });

  it("accepts valid PNG signature", () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectRecognitionImageFormat(buffer)).toBe("png");
    expect(
      validateRecognitionImageSignature({ declaredMimeType: "image/png", buffer }),
    ).toBeNull();
  });

  it("accepts valid WEBP signature", () => {
    const buffer = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from("WEBP", "ascii"),
      Buffer.from("VP8 ", "ascii"),
    ]);
    expect(detectRecognitionImageFormat(buffer)).toBe("webp");
    expect(
      validateRecognitionImageSignature({ declaredMimeType: "image/webp", buffer }),
    ).toBeNull();
  });

  it("accepts HEIC/HEIF-family BMFF structure according to declared family", () => {
    const heic = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftyp", "ascii"),
      Buffer.from("heic", "ascii"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("mif1", "ascii"),
    ]);
    expect(detectRecognitionImageFormat(heic)).toBe("heic");
    expect(
      validateRecognitionImageSignature({ declaredMimeType: "image/heic", buffer: heic }),
    ).toBeNull();

    const heif = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftyp", "ascii"),
      Buffer.from("mif1", "ascii"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("heis", "ascii"),
    ]);
    expect(detectRecognitionImageFormat(heif)).toBe("heif");
    expect(
      validateRecognitionImageSignature({ declaredMimeType: "image/heif", buffer: heif }),
    ).toBeNull();
  });
});
