const WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 10;
const MAX_LOOKUPS_PER_WINDOW = 60;

type RateBucket = { timestamps: number[] };

const submissionBuckets = new Map<string, RateBucket>();
const lookupBuckets = new Map<string, RateBucket>();

function consume(map: Map<string, RateBucket>, key: string, limit: number, nowMs: number): boolean {
  const bucket = map.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => nowMs - ts < WINDOW_MS);
  if (bucket.timestamps.length >= limit) {
    map.set(key, bucket);
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
  return "unknown";
}

export function allowRecognitionPublicLookup(key: string, nowMs = Date.now()): boolean {
  return consume(lookupBuckets, key, MAX_LOOKUPS_PER_WINDOW, nowMs);
}

export function allowRecognitionPublicSubmission(key: string, nowMs = Date.now()): boolean {
  return consume(submissionBuckets, key, MAX_SUBMISSIONS_PER_WINDOW, nowMs);
}
