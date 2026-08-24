const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 10;
const MAX_LOOKUPS_PER_WINDOW = 60;

type RateBucket = { timestamps: number[] };

const submissionBuckets = new Map<string, RateBucket>();
const lookupBuckets = new Map<string, RateBucket>();
let operationCount = 0;

function prune(map: Map<string, RateBucket>, nowMs: number): void {
  for (const [key, bucket] of map.entries()) {
    bucket.timestamps = bucket.timestamps.filter((ts) => nowMs - ts < WINDOW_MS);
    if (bucket.timestamps.length === 0) {
      map.delete(key);
    } else {
      map.set(key, bucket);
    }
  }
}

function consume(map: Map<string, RateBucket>, key: string, limit: number, nowMs: number): boolean {
  operationCount += 1;
  if (operationCount % 50 === 0) {
    prune(submissionBuckets, nowMs);
    prune(lookupBuckets, nowMs);
  }
  const bucket = map.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => nowMs - ts < WINDOW_MS);
  if (bucket.timestamps.length >= limit) {
    if (bucket.timestamps.length === 0) map.delete(key);
    else map.set(key, bucket);
    return false;
  }
  bucket.timestamps.push(nowMs);
  map.set(key, bucket);
  return true;
}

export function getRecognitionClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  const userAgent = request.headers.get("user-agent")?.trim() ?? "ua:unknown";
  const language = request.headers.get("accept-language")?.trim() ?? "lang:unknown";
  return `fallback:${userAgent}|${language}`;
}

export function allowRecognitionPublicLookup(key: string, nowMs = Date.now()): boolean {
  return consume(lookupBuckets, key, MAX_LOOKUPS_PER_WINDOW, nowMs);
}

export function allowRecognitionPublicSubmission(key: string, nowMs = Date.now()): boolean {
  return consume(submissionBuckets, key, MAX_SUBMISSIONS_PER_WINDOW, nowMs);
}

export function __resetRecognitionPublicRateLimitForTests(): void {
  submissionBuckets.clear();
  lookupBuckets.clear();
  operationCount = 0;
}

export function __getRecognitionPublicRateLimitBucketCountsForTests(): {
  submissionBuckets: number;
  lookupBuckets: number;
} {
  return {
    submissionBuckets: submissionBuckets.size,
    lookupBuckets: lookupBuckets.size,
  };
}
