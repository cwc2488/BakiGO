import { createHash } from "node:crypto";
import type { PreparedCoachingMealImage } from "@/types/coaching-ai";
import type { CoachingPhotoReuseDetection } from "@/types/coaching-signals";

export type PriorMealPhotoHash = {
  logDate: string;
  mealSlot: "breakfast" | "lunch" | "dinner";
  contentSha256: string;
  phash: string | null;
};

function hammingDistanceHex(left: string, right: string): number {
  if (left.length !== right.length) {
    return Number.POSITIVE_INFINITY;
  }
  let distance = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = Number.parseInt(left[i]!, 16);
    const b = Number.parseInt(right[i]!, 16);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return Number.POSITIVE_INFINITY;
    }
    let x = a ^ b;
    while (x > 0) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

/** 8x8 average hash → 16 hex chars. */
export async function computeMealImagePhash(buffer: Buffer): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;
    const { data } = await sharp(buffer)
      .greyscale()
      .resize(8, 8, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const values = Array.from(data);
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    let bits = "";
    for (const value of values) {
      bits += value >= avg ? "1" : "0";
    }

    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
      hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch {
    return null;
  }
}

export function computeMealImageContentSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function detectCoachingPhotoReuse(input: {
  preparedImages: PreparedCoachingMealImage[];
  priorHashes: PriorMealPhotoHash[];
  /** Max Hamming distance (of 64 bits) treated as similar. */
  phashMaxDistance?: number;
}): Promise<CoachingPhotoReuseDetection[]> {
  const maxDistance = input.phashMaxDistance ?? 8;
  const results: CoachingPhotoReuseDetection[] = [];

  for (const image of input.preparedImages) {
    const contentSha256 = computeMealImageContentSha256(image.buffer);
    const phash = await computeMealImagePhash(image.buffer);

    const exact = input.priorHashes.find((prior) => prior.contentSha256 === contentSha256);
    if (exact) {
      results.push({
        suspected: true,
        similarityScore: 1,
        matchedLogDate: exact.logDate,
        matchedMealSlot: exact.mealSlot,
        method: "sha256",
        mealSlot: image.mealSlot,
      });
      continue;
    }

    if (phash) {
      let best: { prior: PriorMealPhotoHash; distance: number } | null = null;
      for (const prior of input.priorHashes) {
        if (!prior.phash) continue;
        const distance = hammingDistanceHex(phash, prior.phash);
        if (!best || distance < best.distance) {
          best = { prior, distance };
        }
      }
      if (best && best.distance <= maxDistance) {
        const similarityScore = Math.max(0, 1 - best.distance / 64);
        results.push({
          suspected: true,
          similarityScore,
          matchedLogDate: best.prior.logDate,
          matchedMealSlot: best.prior.mealSlot,
          method: "phash",
          mealSlot: image.mealSlot,
        });
        continue;
      }
    }

    results.push({
      suspected: false,
      similarityScore: 0,
      matchedLogDate: null,
      matchedMealSlot: null,
      method: "none",
      mealSlot: image.mealSlot,
    });
  }

  return results;
}

export async function buildMealPhotoHashRecord(input: {
  logDate: string;
  image: PreparedCoachingMealImage;
}): Promise<PriorMealPhotoHash> {
  return {
    logDate: input.logDate,
    mealSlot: input.image.mealSlot,
    contentSha256: computeMealImageContentSha256(input.image.buffer),
    phash: await computeMealImagePhash(input.image.buffer),
  };
}
