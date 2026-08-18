export type RecognitionDetectedImageFormat = "jpeg" | "png" | "webp" | "heic" | "heif" | null;

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function detectHeifFamily(buffer: Buffer): RecognitionDetectedImageFormat {
  if (buffer.length < 16) return null;
  const brandBox = buffer.subarray(4, 8).toString("ascii");
  if (brandBox !== "ftyp") return null;

  const brands: string[] = [];
  for (let i = 8; i + 4 <= Math.min(buffer.length, 32); i += 4) {
    brands.push(buffer.subarray(i, i + 4).toString("ascii"));
  }

  const heicBrands = new Set(["heic", "heix", "hevc", "hevx"]);
  const heifBrands = new Set(["mif1", "msf1", "heim", "heis"]);

  if (brands.some((brand) => heicBrands.has(brand))) return "heic";
  if (brands.some((brand) => heifBrands.has(brand))) return "heif";
  return null;
}

export function detectRecognitionImageFormat(buffer: Buffer): RecognitionDetectedImageFormat {
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (isWebp(buffer)) return "webp";
  return detectHeifFamily(buffer);
}

export function validateRecognitionImageSignature(input: {
  declaredMimeType: string;
  buffer: Buffer;
}): string | null {
  const detected = detectRecognitionImageFormat(input.buffer);
  if (!detected) {
    return "圖片內容格式無效。";
  }

  const declared = input.declaredMimeType;
  if (declared === "image/jpeg" && detected !== "jpeg") return "圖片內容與宣告格式不符。";
  if (declared === "image/png" && detected !== "png") return "圖片內容與宣告格式不符。";
  if (declared === "image/webp" && detected !== "webp") return "圖片內容與宣告格式不符。";
  if (declared === "image/heic" && detected !== "heic") return "圖片內容與宣告格式不符。";
  if (declared === "image/heif" && detected !== "heif" && detected !== "heic") {
    return "圖片內容與宣告格式不符。";
  }

  return null;
}
