import type { NormalizedContentItem } from "./schema";

const MEANINGFUL_RELATIONSHIPS = new Set([
  "original",
  "reply",
  "quote",
  "thread_part",
]);

export function deriveLastMeaningfulActivityAt(
  analyzableItems: NormalizedContentItem[],
): string | null {
  const timestamps = analyzableItems
    .filter(
      (item) =>
        item.is_analyzable &&
        item.duplicate_of === null &&
        MEANINGFUL_RELATIONSHIPS.has(item.content_relationship),
    )
    .map((item) => new Date(item.published_at).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export function deriveDaysSinceLastMeaningfulActivity(
  last_meaningful_activity_at: string | null,
  referenceDate: Date = new Date(),
): number | null {
  if (!last_meaningful_activity_at) return null;

  const last = new Date(last_meaningful_activity_at);
  const days = Math.floor(
    (referenceDate.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Number.isFinite(days) ? Math.max(0, days) : null;
}

export type ActivityDerivation = {
  last_meaningful_activity_at: string | null;
  days_since_last_meaningful_activity: number | null;
  availability: "available" | "unknown" | "partial";
};

export function deriveActivity(input: {
  analyzableItems: NormalizedContentItem[];
  data_completeness: "full" | "partial";
  referenceDate?: Date;
}): ActivityDerivation {
  const last_meaningful_activity_at = deriveLastMeaningfulActivityAt(
    input.analyzableItems,
  );
  const days_since_last_meaningful_activity = deriveDaysSinceLastMeaningfulActivity(
    last_meaningful_activity_at,
    input.referenceDate,
  );

  let availability: ActivityDerivation["availability"] = "unknown";
  if (last_meaningful_activity_at) {
    availability = input.data_completeness === "partial" ? "partial" : "available";
  } else if (input.analyzableItems.length === 0 && input.data_completeness === "partial") {
    availability = "partial";
  }

  return {
    last_meaningful_activity_at,
    days_since_last_meaningful_activity,
    availability,
  };
}
