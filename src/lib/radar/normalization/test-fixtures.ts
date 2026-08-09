import type { RawContentSnapshot } from "./schema";

const REFERENCE_DATE = new Date("2026-08-09T12:00:00.000Z");

export function buildRawSnapshot(
  overrides: Partial<RawContentSnapshot> & Pick<RawContentSnapshot, "external_content_id">,
): RawContentSnapshot {
  const payload = overrides.payload ?? {
    published_at: "2026-08-08T09:30:00.000Z",
    content_type: "text_post" as const,
    content_relationship: "original" as const,
    text: "想改善體態，最近對身型很不滿意。",
    is_authored_by_candidate: true,
  };

  return {
    raw_snapshot_id: `raw_${overrides.external_content_id}`,
    candidate_id: "cand_8f2a91",
    platform: "threads",
    fetched_at: "2026-08-09T03:00:00.000Z",
    adapter_version: "threads_adapter_v1",
    fetch_completeness: "full",
    ...overrides,
    payload,
  };
}

export { REFERENCE_DATE };
