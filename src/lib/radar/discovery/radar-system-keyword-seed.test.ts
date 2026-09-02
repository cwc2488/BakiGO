import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "../jobs/queue";
import { buildOrgKeywordPool } from "../keywords/build-org-keyword-pool";
import { InMemoryPipelineStore } from "../pipeline/in-memory-pipeline-store";
import { runDailyPipelineOrchestrator } from "../pipeline/orchestrator";
import {
  BLOCKED_META_PHRASES,
  experimentArmATopicNouns,
  experimentArmBFirstPerson,
  phrasesForClass,
} from "./phrase-inventory-v1";
import {
  radarV1SeededPhrases,
  radarV1SystemKeywordSeed,
  radarV1SystemKeywordsForPipeline,
} from "./radar-system-keyword-seed";

const SEED_SQL = join(
  process.cwd(),
  "supabase/migrations/048_radar_system_keywords_v1_seed.sql",
);
const PIPELINE_STORE = join(
  process.cwd(),
  "src/lib/radar/pipeline/supabase-pipeline-store.ts",
);

describe("Radar V1 system keyword seed", () => {
  it("seeds only SCALE-03 Arm A topic nouns that Meta served", () => {
    const seeded = radarV1SeededPhrases();
    const measuredTopicNouns = experimentArmATopicNouns().map((entry) => entry.phrase);

    expect(seeded).toEqual([
      "健身",
      "運動",
      "健康生活",
      "副業",
      "重訓",
      "跑步",
      "兼職",
      "創業",
    ]);
    expect(seeded).toEqual(measuredTopicNouns);
    expect(seeded).toHaveLength(8);
    expect(radarV1SystemKeywordSeed().every((row) => row.is_active)).toBe(true);
    expect(radarV1SystemKeywordSeed().every((row) => row.signal_type === "broad_need")).toBe(
      true,
    );
  });

  it("does not activate first-person phrases or blocked Meta terms", () => {
    const seeded = radarV1SeededPhrases();
    const firstPerson = [
      ...experimentArmBFirstPerson(),
      ...phrasesForClass("first_person_need"),
    ].map((entry) => entry.phrase);

    for (const phrase of new Set(firstPerson)) {
      expect(seeded).not.toContain(phrase);
    }
    for (const phrase of BLOCKED_META_PHRASES) {
      expect(seeded).not.toContain(phrase);
    }
  });

  it("keeps radar_system_keywords as the daily-pipeline DB source of truth", () => {
    const store = readFileSync(PIPELINE_STORE, "utf8");
    expect(store).toContain('.from("radar_system_keywords")');
    expect(store).toContain('.eq("is_active", true)');
    expect(store).not.toContain("phrase_inventory");
    expect(store).not.toContain("radar_system_keyword_seed");
  });

  it("daily pipeline reads the seeded active keywords and enqueues one discover job each", async () => {
    const store = new InMemoryPipelineStore();
    const queueStore = new InMemoryRadarJobQueueStore();
    const queue = new RadarJobQueue(queueStore);
    const systemKeywords = radarV1SystemKeywordsForPipeline();

    store.members = [{ member_id: "member-a" }, { member_id: "member-b" }];
    store.keywordsByMember = {
      "member-a": systemKeywords,
      "member-b": systemKeywords,
    };

    const pool = buildOrgKeywordPool(store.keywordsByMember);
    expect(pool.map((entry) => entry.display_phrase).sort()).toEqual(
      [...radarV1SeededPhrases()].sort(),
    );

    const result = await runDailyPipelineOrchestrator(
      { store, queue },
      { run_date: "2026-08-22", now: new Date("2026-08-22T03:00:00.000Z") },
    );

    expect(result.discovery_jobs_enqueued).toBe(8);
    expect(queueStore.jobCount).toBe(8);
  });

  it("SQL seed is idempotent, targets radar_system_keywords, and matches the measured set", () => {
    const sql = readFileSync(SEED_SQL, "utf8");

    expect(sql).toContain("INSERT INTO public.radar_system_keywords");
    expect(sql).toContain("WHERE NOT EXISTS");
    expect(sql).toContain("is_active");

    for (const phrase of radarV1SeededPhrases()) {
      expect(sql).toContain(`'${phrase}'`);
    }
    for (const phrase of BLOCKED_META_PHRASES) {
      expect(sql).not.toContain(`'${phrase}'`);
    }
    for (const phrase of experimentArmBFirstPerson().map((entry) => entry.phrase)) {
      expect(sql).not.toContain(`'${phrase}'`);
    }
  });
});
