/**
 * Premium Coaching Brain — durable longitudinal understanding.
 *
 * Deterministic evidence accumulation + confidence gates.
 * Survives across conversations (enrollment JSON) and steers generation
 * without scripting every reply.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import type { CoachingAiV2LifecycleStage } from "@/types/coaching-ai-v2";
import type {
  Go21LongitudinalUnderstandingForAi,
  Go21UnderstandingCategory,
  Go21UnderstandingEvidence,
  Go21UnderstandingExperiment,
  Go21UnderstandingItem,
  Go21UnderstandingObservation,
  Go21UnderstandingRecord,
  Go21UtteranceMode,
} from "@/types/go21";

/** Min supporting evidence days before an insight may be shared with the customer. */
export const GO21_SHARE_MIN_EVIDENCE = 3 as const;
/** Min confidence to share a pattern aloud. */
export const GO21_SHARE_MIN_CONFIDENCE = 0.7 as const;
/** Min evidence to silently influence coaching judgment. */
export const GO21_INFLUENCE_MIN_EVIDENCE = 2 as const;
export const GO21_INFLUENCE_MIN_CONFIDENCE = 0.45 as const;
/** Bound stored raw observations. */
export const GO21_MAX_OBSERVATIONS = 60 as const;
export const GO21_MAX_ITEMS = 24 as const;

const PATTERN_SMALL_LUNCH_EVENING = "small_lunch_evening_overeating";
const PATTERN_LATE_NIGHT = "late_night_eating";
const PATTERN_WEEKEND_CHAOS = "weekend_chaos_eating";
const PATTERN_STRESS_TRIGGER = "stress_triggered_eating";
const PATTERN_POOR_SLEEP_CRAVING = "poor_sleep_next_day_craving";
const PATTERN_LOW_PROTEIN_HUNGER = "low_protein_afternoon_hunger";

export function emptyGo21UnderstandingRecord(): Go21UnderstandingRecord {
  return {
    version: 1,
    items: [],
    observations: [],
    preferences: [],
    experiments: [],
    coachingNotes: [],
    updatedAt: new Date().toISOString(),
  };
}

export function parseGo21UnderstandingRecord(raw: unknown): Go21UnderstandingRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) return null;
  const items = Array.isArray(obj.items)
    ? obj.items.map(parseItem).filter((x): x is Go21UnderstandingItem => Boolean(x))
    : [];
  const observations = Array.isArray(obj.observations)
    ? obj.observations
        .map(parseObservation)
        .filter((x): x is Go21UnderstandingObservation => Boolean(x))
        .slice(-GO21_MAX_OBSERVATIONS)
    : [];
  const preferences = Array.isArray(obj.preferences)
    ? obj.preferences
        .map((p) => {
          if (!p || typeof p !== "object") return null;
          const o = p as Record<string, unknown>;
          if (typeof o.content !== "string" || !o.content.trim()) return null;
          const polarity =
            o.polarity === "like" || o.polarity === "dislike" || o.polarity === "constraint"
              ? o.polarity
              : "like";
          return {
            content: o.content.trim().slice(0, 120),
            polarity,
            confidence: clamp01(typeof o.confidence === "number" ? o.confidence : 0.5),
            lastSeenLogDate:
              typeof o.lastSeenLogDate === "string" ? o.lastSeenLogDate : "1970-01-01",
          };
        })
        .filter((x): x is Go21UnderstandingRecord["preferences"][number] => Boolean(x))
        .slice(0, 16)
    : [];
  const experiments = Array.isArray(obj.experiments)
    ? obj.experiments
        .map(parseExperiment)
        .filter((x): x is Go21UnderstandingExperiment => Boolean(x))
        .slice(0, 12)
    : [];
  const coachingNotes = Array.isArray(obj.coachingNotes)
    ? obj.coachingNotes
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        .map((n) => n.trim().slice(0, 160))
        .slice(0, 8)
    : [];
  return {
    version: 1,
    items: items.slice(0, GO21_MAX_ITEMS),
    observations,
    preferences,
    experiments,
    coachingNotes,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString(),
  };
}

function parseItem(raw: unknown): Go21UnderstandingItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.patternKey !== "string") return null;
  if (typeof o.statement !== "string" || !o.statement.trim()) return null;
  const category = isCategory(o.category) ? o.category : "other";
  const status = isItemStatus(o.status) ? o.status : "emerging";
  return {
    id: o.id,
    category,
    patternKey: o.patternKey.slice(0, 80),
    statement: o.statement.trim().slice(0, 400),
    confidence: clamp01(typeof o.confidence === "number" ? o.confidence : 0.3),
    status,
    evidenceCount: Math.max(0, Number(o.evidenceCount) || 0),
    supportingEvidence: Array.isArray(o.supportingEvidence)
      ? o.supportingEvidence.map(parseEvidence).filter((x): x is Go21UnderstandingEvidence => Boolean(x)).slice(0, 10)
      : [],
    contradictingEvidence: Array.isArray(o.contradictingEvidence)
      ? o.contradictingEvidence
          .map(parseEvidence)
          .filter((x): x is Go21UnderstandingEvidence => Boolean(x))
          .slice(0, 10)
      : [],
    firstSeenLogDate: typeof o.firstSeenLogDate === "string" ? o.firstSeenLogDate : "1970-01-01",
    lastSeenLogDate: typeof o.lastSeenLogDate === "string" ? o.lastSeenLogDate : "1970-01-01",
    revisedFromId: typeof o.revisedFromId === "string" ? o.revisedFromId : null,
  };
}

function parseEvidence(raw: unknown): Go21UnderstandingEvidence | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.logDate !== "string" || typeof o.summary !== "string") return null;
  return {
    at: typeof o.at === "string" ? o.at : new Date().toISOString(),
    logDate: o.logDate,
    signal: typeof o.signal === "string" ? o.signal : "other",
    summary: o.summary.slice(0, 160),
  };
}

function parseObservation(raw: unknown): Go21UnderstandingObservation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.logDate !== "string" || typeof o.signal !== "string") return null;
  return {
    logDate: o.logDate,
    signal: o.signal.slice(0, 60),
    detail: typeof o.detail === "string" ? o.detail.slice(0, 160) : "",
    at: typeof o.at === "string" ? o.at : new Date().toISOString(),
  };
}

function parseExperiment(raw: unknown): Go21UnderstandingExperiment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.description !== "string") return null;
  const status =
    o.status === "proposed" ||
    o.status === "running" ||
    o.status === "worked" ||
    o.status === "failed" ||
    o.status === "inconclusive"
      ? o.status
      : "proposed";
  return {
    id: o.id,
    description: o.description.slice(0, 200),
    status,
    startedLogDate: typeof o.startedLogDate === "string" ? o.startedLogDate : "1970-01-01",
    relatedPatternKey: typeof o.relatedPatternKey === "string" ? o.relatedPatternKey : null,
    outcomeNote: typeof o.outcomeNote === "string" ? o.outcomeNote.slice(0, 200) : null,
  };
}

function isCategory(v: unknown): v is Go21UnderstandingCategory {
  return (
    typeof v === "string" &&
    [
      "eating_pattern",
      "preference",
      "difficulty",
      "trigger",
      "strategy_worked",
      "strategy_failed",
      "timing_goal_link",
      "communication",
      "other",
    ].includes(v)
  );
}

function isItemStatus(v: unknown): v is Go21UnderstandingItem["status"] {
  return (
    typeof v === "string" &&
    ["emerging", "active", "confirmed", "revised", "rejected"].includes(v)
  );
}

export function detectGo21UtteranceMode(input: {
  freeMessage: string | null | undefined;
}): Go21UtteranceMode {
  const msg = (input.freeMessage ?? "").trim();
  if (!msg) return "other";

  if (
    /(?:記得|跟你說|告訴過你|說過|講過).{0,24}(?:吃|喝|目標|照片)|我(?:跟你)?說(?:了)?什麼|你還記得/iu.test(
      msg,
    )
  ) {
    return "memory_check";
  }
  if (/為什麼|原理|什麼意思|是什麼|差在哪|有什麼幫助/.test(msg) && /[？?]/.test(msg)) {
    return "factual_question";
  }
  if (
    /怎麼辦|幫我|不知道該|卡住|好難|撐不住|救我|給我建議|該怎麼/.test(msg) ||
    (/建議|怎麼選|怎麼吃/.test(msg) && /[？?]/.test(msg))
  ) {
    return "seeking_help";
  }
  if (
    /(?:給|推薦|建議|幫).{0,8}(?:菜單|吃什麼)|菜單|今天吃什麼好|晚餐怎麼選/.test(msg) ||
    (/該不該|可不可以|好不好|要不要/.test(msg) && /[？?]/.test(msg))
  ) {
    return "asking_advice";
  }
  if (/等一下|待會|打算|準備吃|明天想|計畫|計劃|晚上想吃/.test(msg) && !/吃了|喝了|吃完/.test(msg)) {
    return "making_plan";
  }
  if (
    /(?:吃了|喝了|午餐|晚餐|早餐|宵夜|剛吃|剛剛吃|中午吃|早上吃)/.test(msg) &&
    !/[？?]/.test(msg)
  ) {
    return "reporting";
  }
  if (
    /哈哈|呵呵|嗯嗯|好啊|謝謝|收到|天氣|今天好累|最近忙|聊天/.test(msg) ||
    (msg.length <= 8 && !/吃|喝|餓|目標/.test(msg))
  ) {
    return "casual_chat";
  }
  return "other";
}

export type Go21TurnSignal = {
  signal: string;
  detail: string;
};

/**
 * Extract raw behavioral signals from a single customer message + today context.
 * Conservative — prefers miss over invent.
 */
export function extractGo21TurnSignals(input: {
  freeMessage: string | null | undefined;
  logDate: string;
  todayMealNotes?: Array<{ slot: string; note: string | null | undefined }>;
}): Go21TurnSignal[] {
  const msg = (input.freeMessage ?? "").trim();
  const signals: Go21TurnSignal[] = [];
  if (!msg) return signals;

  const push = (signal: string, detail: string) => {
    signals.push({ signal, detail: detail.slice(0, 120) });
  };

  if (/宵夜|半夜|很晚才吃|十一點|12點|凌晨|睡前.*吃|晚上.*爆|晚上又/.test(msg)) {
    push("late_night_eating", msg.slice(0, 80));
  }
  if (/晚上.*餓|又餓爆|餓爆|晚上失控|晚餐.*補|晚上狂吃|晚上又吃很多/.test(msg)) {
    push("evening_overeating", msg.slice(0, 80));
  }
  if (/突然.*想吃|超想吃|很想吃|一直想吃|想吃甜|嘴饞/.test(msg)) {
    push("evening_craving", msg.slice(0, 80));
  }
  if (/午餐只|中午只|中午沒吃|沒吃午餐|午餐沒吃|中午吃很少|午餐吃很少|隨便吃一點|只吃.*水果|只喝.*咖啡/.test(msg)) {
    push("small_lunch", msg.slice(0, 80));
  }
  if (/沒吃早餐|早餐沒吃|早上沒吃/.test(msg)) {
    push("skipped_breakfast", msg.slice(0, 80));
  }
  if (/壓力大|很煩|吵架|加班很累|情緒.*吃|煩到想吃/.test(msg)) {
    push("stress_eating", msg.slice(0, 80));
  }
  if (/週末|假日|出去玩|聚餐|應酬/.test(msg) && /亂吃|爆|失控|吃很多|喝很多/.test(msg)) {
    push("weekend_chaos", msg.slice(0, 80));
  }
  if (/不喜歡|超雷|不要再|討厭|吃不慣/.test(msg)) {
    const m = msg.match(/(?:不喜歡|討厭|吃不慣)\s*([^\n。！？,]{1,20})/);
    push("dislike_stated", m?.[1]?.trim() || msg.slice(0, 40));
  }
  if (/好喜歡|最愛|比較愛吃|超愛/.test(msg)) {
    const m = msg.match(/(?:好喜歡|最愛|比較愛吃|超愛)\s*([^\n。！？,]{1,20})/);
    push("like_stated", m?.[1]?.trim() || msg.slice(0, 40));
  }
  if (/不能吃|過敏|素食|忌口|戒了/.test(msg)) {
    push("constraint_stated", msg.slice(0, 80));
  }
  if (/下午先吃|下午點心|先把午餐吃完整|試著.*午餐|照你說的/.test(msg)) {
    push("strategy_tried", msg.slice(0, 80));
  }
  if (/真的比較穩|有用|比較不會餓|晚上穩多了|好像有用/.test(msg)) {
    push("strategy_worked_ack", msg.slice(0, 80));
  }
  if (/沒用|還是一樣|晚上還是|沒差|失敗/.test(msg) && /實驗|點心|午餐|試/.test(msg)) {
    push("strategy_failed_ack", msg.slice(0, 80));
  }

  // Adequate lunch signal (for contradiction) — only when clearly stated
  if (/午餐吃得很飽|中午吃很飽|午餐吃完整|中午有好好吃|午餐.*雞胸|午餐.*便當/.test(msg)) {
    push("adequate_lunch", msg.slice(0, 80));
  }
  if (/晚上很穩|晚上沒亂吃|今晚沒爆|宵夜沒吃|晚上還好/.test(msg)) {
    push("stable_evening", msg.slice(0, 80));
  }

  // Sleep / recovery — only when clearly stated (never invent hours)
  if (
    /只睡\s*\d|睡了?\s*\d|睡很少|失眠|幾乎沒睡|沒怎麼睡|睡超差|四個半小時|五小時|不到六小時/.test(msg) ||
    /只睡[一二兩三四五六七八九十半]+小時/.test(msg) ||
    /睡了?[一二兩三四五六七八九十半]+小時/.test(msg)
  ) {
    push("poor_sleep_stated", msg.slice(0, 80));
  }
  if (/睡很好|睡飽|睡了?\s*[七八九]|睡滿/.test(msg)) {
    push("good_sleep_stated", msg.slice(0, 80));
  }
  if (/蛋白質.*少|蛋白不夠|沒吃什麼肉|幾乎沒蛋白質/.test(msg)) {
    push("low_protein_stated", msg.slice(0, 80));
  }
  if (
    signals.some((s) => s.signal === "evening_craving" || s.signal === "evening_overeating") &&
    /睡|失眠|熬夜/.test(msg)
  ) {
    push("sleep_linked_craving", msg.slice(0, 80));
  }

  // Infer small lunch from today meal notes when message is evening hunger
  const lunchNote = input.todayMealNotes?.find((m) => m.slot === "lunch")?.note?.trim() ?? "";
  if (
    signals.some((s) => s.signal === "evening_overeating" || s.signal === "evening_craving") &&
    lunchNote &&
    (/只|很少|水果|沙拉葉|咖啡|沒吃|空/.test(lunchNote) || lunchNote.length <= 4)
  ) {
    if (!signals.some((s) => s.signal === "small_lunch")) {
      push("small_lunch", `today_lunch:${lunchNote}`);
    }
  }

  return signals;
}

/**
 * Merge turn signals into the durable understanding record.
 * Pure function — caller persists.
 */
export function updateGo21UnderstandingFromTurn(input: {
  prior: Go21UnderstandingRecord | null;
  freeMessage: string | null | undefined;
  logDate: string;
  todayMealNotes?: Array<{ slot: string; note: string | null | undefined }>;
  lifecycleDay?: number | null;
  lifecycleStage?: CoachingAiV2LifecycleStage | null;
}): {
  record: Go21UnderstandingRecord;
  utteranceMode: Go21UtteranceMode;
  newSignals: Go21TurnSignal[];
} {
  const prior = input.prior ?? emptyGo21UnderstandingRecord();
  const utteranceMode = detectGo21UtteranceMode({ freeMessage: input.freeMessage });
  const newSignals = extractGo21TurnSignals({
    freeMessage: input.freeMessage,
    logDate: input.logDate,
    todayMealNotes: input.todayMealNotes,
  });

  const now = new Date().toISOString();
  const observations: Go21UnderstandingObservation[] = [
    ...prior.observations,
    ...newSignals.map((s) => ({
      logDate: input.logDate,
      signal: s.signal,
      detail: s.detail,
      at: now,
    })),
  ].slice(-GO21_MAX_OBSERVATIONS);

  let preferences = [...prior.preferences];
  for (const s of newSignals) {
    if (s.signal === "like_stated") {
      preferences = upsertPreference(preferences, s.detail, "like", input.logDate);
    } else if (s.signal === "dislike_stated") {
      preferences = upsertPreference(preferences, s.detail, "dislike", input.logDate);
    } else if (s.signal === "constraint_stated") {
      preferences = upsertPreference(preferences, s.detail, "constraint", input.logDate);
    }
  }

  let items = prior.items
    .filter((i) => i.status !== "revised")
    .map((i) => ({ ...i, supportingEvidence: [...i.supportingEvidence], contradictingEvidence: [...i.contradictingEvidence] }));

  // Late night — observe, don't over-claim
  if (newSignals.some((s) => s.signal === "late_night_eating")) {
    items = upsertPatternItem(items, {
      patternKey: PATTERN_LATE_NIGHT,
      category: "difficulty",
      statement: "晚上偏晚才吃／宵夜出現的頻率偏高",
      logDate: input.logDate,
      signal: "late_night_eating",
      summary: newSignals.find((s) => s.signal === "late_night_eating")?.detail ?? "late night",
      supportDelta: 0.12,
    });
  }

  // Small lunch → evening overeating link (the flagship longitudinal pattern)
  const hasSmallLunch =
    newSignals.some((s) => s.signal === "small_lunch") ||
    sameDayHasSignal(observations, input.logDate, "small_lunch");
  const hasEveningProblem = newSignals.some(
    (s) => s.signal === "evening_overeating" || s.signal === "evening_craving" || s.signal === "late_night_eating",
  );
  if (hasSmallLunch && hasEveningProblem) {
    items = upsertPatternItem(items, {
      patternKey: PATTERN_SMALL_LUNCH_EVENING,
      category: "timing_goal_link",
      statement: "中午／白天吃太少的日子，晚上容易暴餓或失控——比較像白天空太久，不是單純晚上意志力差",
      logDate: input.logDate,
      signal: "small_lunch_evening_link",
      summary: "small lunch + evening problem same day",
      supportDelta: 0.18,
    });
  }

  // Contradiction: adequate lunch + stable evening weakens the link
  if (
    newSignals.some((s) => s.signal === "adequate_lunch") &&
    newSignals.some((s) => s.signal === "stable_evening")
  ) {
    items = contradictPatternItem(items, {
      patternKey: PATTERN_SMALL_LUNCH_EVENING,
      logDate: input.logDate,
      signal: "adequate_lunch_stable_evening",
      summary: "adequate lunch and stable evening same day",
      confidenceDelta: 0.22,
    });
  } else if (newSignals.some((s) => s.signal === "adequate_lunch") && !hasEveningProblem) {
    // Soft contradict if they had the pattern before
    const existing = items.find(
      (i) => i.patternKey === PATTERN_SMALL_LUNCH_EVENING && i.status !== "rejected",
    );
    if (existing && existing.evidenceCount >= 2) {
      items = contradictPatternItem(items, {
        patternKey: PATTERN_SMALL_LUNCH_EVENING,
        logDate: input.logDate,
        signal: "adequate_lunch_no_evening_problem",
        summary: "adequate lunch; no evening problem reported",
        confidenceDelta: 0.15,
      });
    }
  }

  if (newSignals.some((s) => s.signal === "weekend_chaos")) {
    items = upsertPatternItem(items, {
      patternKey: PATTERN_WEEKEND_CHAOS,
      category: "trigger",
      statement: "週末／聚餐情境較容易亂吃",
      logDate: input.logDate,
      signal: "weekend_chaos",
      summary: newSignals.find((s) => s.signal === "weekend_chaos")?.detail ?? "weekend",
      supportDelta: 0.15,
    });
  }

  if (newSignals.some((s) => s.signal === "stress_eating")) {
    items = upsertPatternItem(items, {
      patternKey: PATTERN_STRESS_TRIGGER,
      category: "trigger",
      statement: "壓力／情緒高的時候比較容易往吃的方向走",
      logDate: input.logDate,
      signal: "stress_eating",
      summary: newSignals.find((s) => s.signal === "stress_eating")?.detail ?? "stress",
      supportDelta: 0.15,
    });
  }

  // Poor sleep ↔ craving (only with co-occurring evidence; never invent)
  const hasPoorSleep =
    newSignals.some((s) => s.signal === "poor_sleep_stated") ||
    sameDayHasSignal(observations, input.logDate, "poor_sleep_stated");
  const hasCraving =
    newSignals.some(
      (s) =>
        s.signal === "evening_craving" ||
        s.signal === "evening_overeating" ||
        s.signal === "sleep_linked_craving",
    ) || sameDayHasSignal(observations, input.logDate, "evening_craving");
  if (hasPoorSleep && hasCraving) {
    items = upsertPatternItem(items, {
      patternKey: PATTERN_POOR_SLEEP_CRAVING,
      category: "timing_goal_link",
      statement: "睡得明顯偏少的日子，隔天或當天晚上比較容易嘴饞、想吃高熱量的東西",
      logDate: input.logDate,
      signal: "poor_sleep_craving_link",
      summary: "poor sleep + craving/overeating",
      supportDelta: 0.16,
    });
  }

  if (
    newSignals.some((s) => s.signal === "low_protein_stated") &&
    newSignals.some((s) => s.signal === "evening_craving" || s.signal === "evening_overeating")
  ) {
    items = upsertPatternItem(items, {
      patternKey: PATTERN_LOW_PROTEIN_HUNGER,
      category: "timing_goal_link",
      statement: "蛋白質吃得比較不完整的日子，下午或晚上比較容易爆餓",
      logDate: input.logDate,
      signal: "low_protein_hunger_link",
      summary: "low protein + hunger/craving",
      supportDelta: 0.14,
    });
  }

  let experiments = [...prior.experiments];
  let coachingNotes = [...prior.coachingNotes];

  if (newSignals.some((s) => s.signal === "strategy_tried")) {
    const detail = newSignals.find((s) => s.signal === "strategy_tried")?.detail ?? "小實驗";
    if (!experiments.some((e) => e.status === "running" || e.status === "proposed")) {
      experiments.push({
        id: newId(),
        description: detail.slice(0, 120),
        status: "running",
        startedLogDate: input.logDate,
        relatedPatternKey: PATTERN_SMALL_LUNCH_EVENING,
        outcomeNote: null,
      });
    }
  }

  if (newSignals.some((s) => s.signal === "strategy_worked_ack")) {
    experiments = experiments.map((e) =>
      e.status === "running"
        ? {
            ...e,
            status: "worked" as const,
            outcomeNote: newSignals.find((s) => s.signal === "strategy_worked_ack")?.detail ?? "worked",
          }
        : e,
    );
    items = upsertPatternItem(items, {
      patternKey: "strategy_lunch_completeness_worked",
      category: "strategy_worked",
      statement: "把午餐吃完整／白天先吃穩，對這個人晚上較有幫助",
      logDate: input.logDate,
      signal: "strategy_worked_ack",
      summary: "customer acknowledged strategy helped",
      supportDelta: 0.25,
    });
    coachingNotes = uniqueNotes([
      ...coachingNotes,
      "這個人對「先顧白天／午餐」的介入比較有感，勝過只罵晚上意志力",
    ]);
  }

  if (newSignals.some((s) => s.signal === "strategy_failed_ack")) {
    experiments = experiments.map((e) =>
      e.status === "running"
        ? {
            ...e,
            status: "failed" as const,
            outcomeNote: newSignals.find((s) => s.signal === "strategy_failed_ack")?.detail ?? "failed",
          }
        : e,
    );
    items = upsertPatternItem(items, {
      patternKey: "strategy_lunch_completeness_failed",
      category: "strategy_failed",
      statement: "單純強調午餐完整度，對這個人似乎不夠",
      logDate: input.logDate,
      signal: "strategy_failed_ack",
      summary: "customer said experiment did not help",
      supportDelta: 0.2,
    });
  }

  // Promote status by confidence / evidence
  items = items.map((item) => {
    if (item.status === "rejected" || item.status === "revised") return item;
    let status = item.status;
    if (item.evidenceCount >= GO21_SHARE_MIN_EVIDENCE && item.confidence >= GO21_SHARE_MIN_CONFIDENCE) {
      status = "confirmed";
    } else if (
      item.evidenceCount >= GO21_INFLUENCE_MIN_EVIDENCE &&
      item.confidence >= GO21_INFLUENCE_MIN_CONFIDENCE
    ) {
      status = "active";
    } else {
      status = "emerging";
    }
    return { ...item, status };
  });

  // Auto-propose experiment when pattern becomes shareable and none running
  const shareableLunch = items.find(
    (i) =>
      i.patternKey === PATTERN_SMALL_LUNCH_EVENING &&
      (i.status === "confirmed" || i.status === "active") &&
      i.confidence >= GO21_SHARE_MIN_CONFIDENCE &&
      i.evidenceCount >= GO21_SHARE_MIN_EVIDENCE,
  );
  if (
    shareableLunch &&
    !experiments.some((e) => e.relatedPatternKey === PATTERN_SMALL_LUNCH_EVENING) &&
    (input.lifecycleStage === "find_patterns" ||
      input.lifecycleStage === "experiment" ||
      input.lifecycleStage === "build_autonomy" ||
      (input.lifecycleDay != null && input.lifecycleDay >= 4))
  ) {
    experiments.push({
      id: newId(),
      description: "明天先把午餐吃完整，觀察晚上是否自然穩一點",
      status: "proposed",
      startedLogDate: input.logDate,
      relatedPatternKey: PATTERN_SMALL_LUNCH_EVENING,
      outcomeNote: null,
    });
  }

  const record: Go21UnderstandingRecord = {
    version: 1,
    items: items.slice(0, GO21_MAX_ITEMS),
    observations,
    preferences: preferences.slice(0, 16),
    experiments: experiments.slice(-12),
    coachingNotes: coachingNotes.slice(0, 8),
    updatedAt: now,
  };

  return { record, utteranceMode, newSignals };
}

function upsertPreference(
  list: Go21UnderstandingRecord["preferences"],
  content: string,
  polarity: "like" | "dislike" | "constraint",
  logDate: string,
): Go21UnderstandingRecord["preferences"] {
  const cleaned = content.trim().slice(0, 80);
  if (!cleaned) return list;
  const idx = list.findIndex((p) => p.content === cleaned && p.polarity === polarity);
  if (idx >= 0) {
    const next = [...list];
    next[idx] = {
      ...next[idx],
      confidence: clamp01(next[idx].confidence + 0.1),
      lastSeenLogDate: logDate,
    };
    return next;
  }
  return [...list, { content: cleaned, polarity, confidence: 0.55, lastSeenLogDate: logDate }];
}

function upsertPatternItem(
  items: Go21UnderstandingItem[],
  input: {
    patternKey: string;
    category: Go21UnderstandingCategory;
    statement: string;
    logDate: string;
    signal: string;
    summary: string;
    supportDelta: number;
  },
): Go21UnderstandingItem[] {
  const existing = items.find(
    (i) => i.patternKey === input.patternKey && i.status !== "rejected" && i.status !== "revised",
  );
  const evidence: Go21UnderstandingEvidence = {
    at: new Date().toISOString(),
    logDate: input.logDate,
    signal: input.signal,
    summary: input.summary,
  };
  if (!existing) {
    return [
      ...items,
      {
        id: newId(),
        category: input.category,
        patternKey: input.patternKey,
        statement: input.statement,
        confidence: clamp01(0.28 + input.supportDelta),
        status: "emerging",
        evidenceCount: 1,
        supportingEvidence: [evidence],
        contradictingEvidence: [],
        firstSeenLogDate: input.logDate,
        lastSeenLogDate: input.logDate,
        revisedFromId: null,
      },
    ];
  }
  // Same calendar day — strengthen slightly but don't double-count evidence days
  const sameDay = existing.supportingEvidence.some((e) => e.logDate === input.logDate);
  const supportingEvidence = [...existing.supportingEvidence, evidence].slice(-10);
  const evidenceCount = sameDay
    ? existing.evidenceCount
    : existing.evidenceCount + 1;
  return items.map((i) =>
    i.id === existing.id
      ? {
          ...i,
          statement: input.statement,
          confidence: clamp01(i.confidence + (sameDay ? input.supportDelta * 0.35 : input.supportDelta)),
          evidenceCount,
          supportingEvidence,
          lastSeenLogDate: input.logDate,
        }
      : i,
  );
}

function contradictPatternItem(
  items: Go21UnderstandingItem[],
  input: {
    patternKey: string;
    logDate: string;
    signal: string;
    summary: string;
    confidenceDelta: number;
  },
): Go21UnderstandingItem[] {
  const existing = items.find(
    (i) => i.patternKey === input.patternKey && i.status !== "revised",
  );
  if (!existing) return items;
  const evidence: Go21UnderstandingEvidence = {
    at: new Date().toISOString(),
    logDate: input.logDate,
    signal: input.signal,
    summary: input.summary,
  };
  const nextConfidence = clamp01(existing.confidence - input.confidenceDelta);
  const contradictingEvidence = [...existing.contradictingEvidence, evidence].slice(-10);

  // Enough contradiction → revise into a weaker / alternate statement
  if (contradictingEvidence.length >= 2 && nextConfidence < 0.5) {
    const revised: Go21UnderstandingItem = {
      id: newId(),
      category: existing.category,
      patternKey: existing.patternKey,
      statement: "先前以為晚上失控主要來自白天吃太少；最近有反證，這條關聯先降級，改觀察其他觸發",
      confidence: Math.max(0.2, nextConfidence),
      status: "emerging",
      evidenceCount: 1,
      supportingEvidence: [],
      contradictingEvidence: [],
      firstSeenLogDate: input.logDate,
      lastSeenLogDate: input.logDate,
      revisedFromId: existing.id,
    };
    return [
      ...items.map((i) =>
        i.id === existing.id
          ? {
              ...i,
              status: "revised" as const,
              confidence: nextConfidence,
              contradictingEvidence,
              lastSeenLogDate: input.logDate,
            }
          : i,
      ),
      revised,
    ];
  }

  return items.map((i) =>
    i.id === existing.id
      ? {
          ...i,
          confidence: nextConfidence,
          status: nextConfidence <= 0.25 ? ("rejected" as const) : ("active" as const),
          contradictingEvidence,
          lastSeenLogDate: input.logDate,
        }
      : i,
  );
}

function sameDayHasSignal(
  observations: Go21UnderstandingObservation[],
  logDate: string,
  signal: string,
): boolean {
  return observations.some((o) => o.logDate === logDate && o.signal === signal);
}

function uniqueNotes(notes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of notes) {
    const t = n.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function canShareInsight(item: Go21UnderstandingItem, input: {
  lifecycleDay: number | null;
  lifecycleStage: CoachingAiV2LifecycleStage | null;
}): boolean {
  if (item.status === "rejected" || item.status === "revised" || item.status === "emerging") {
    return false;
  }
  if (item.evidenceCount < GO21_SHARE_MIN_EVIDENCE) return false;
  if (item.confidence < GO21_SHARE_MIN_CONFIDENCE) return false;
  // Early days: learn only — never claim established patterns
  if (input.lifecycleStage === "understand") return false;
  if (input.lifecycleDay != null && input.lifecycleDay < 4) return false;
  return true;
}

export function canInfluenceJudgment(item: Go21UnderstandingItem): boolean {
  if (item.status === "rejected" || item.status === "revised") return false;
  return (
    item.evidenceCount >= GO21_INFLUENCE_MIN_EVIDENCE &&
    item.confidence >= GO21_INFLUENCE_MIN_CONFIDENCE
  );
}

export function customerFacingInsightHint(item: Go21UnderstandingItem): string {
  if (item.patternKey === PATTERN_SMALL_LUNCH_EVENING) {
    return "我好像抓到你最近晚上容易爆掉的原因了。不是你晚上意志力差，是你這幾次中午都吃太少。明天我們先不要管晚餐，把午餐吃完整，我想看看晚上會不會自然穩一點。";
  }
  if (item.patternKey === PATTERN_LATE_NIGHT) {
    return "我注意到你這幾天晚上偏晚才吃的次數不少。先記著這件事，之後若跟目標卡住，我們再一起看要不要調整節奏。";
  }
  if (item.patternKey === PATTERN_STRESS_TRIGGER) {
    return "我感覺你壓力上來的時候，比較容易往吃的方向走。下次那種時刻，我們可以先有一個比較不傷目標的備案。";
  }
  if (item.patternKey === PATTERN_WEEKEND_CHAOS) {
    return "週末那一段好像比較容易亂。不是要你禁止玩，是我們可以提前想好一個底線。";
  }
  if (item.patternKey === PATTERN_POOR_SLEEP_CRAVING) {
    return "你睡不到 6 小時的隔天，晚上比較容易想吃高熱量的東西。這幾天有點重複——我先不怪飲食，先看睡眠。";
  }
  if (item.patternKey === PATTERN_LOW_PROTEIN_HUNGER) {
    return "蛋白質吃得比較完整的幾天，你下午比較不容易爆餓。之後我們可以先把蛋白質顧好。";
  }
  if (item.category === "strategy_worked") {
    return `看起來「${item.statement}」對你是有感的，值得繼續。`;
  }
  return item.statement;
}

/**
 * Compact generation context — what the model (and fixtures) may use.
 */
export function compactGo21UnderstandingForAi(input: {
  record: Go21UnderstandingRecord | null;
  utteranceMode: Go21UtteranceMode;
  lifecycleDay: number | null;
  lifecycleStage: CoachingAiV2LifecycleStage | null;
}): Go21LongitudinalUnderstandingForAi | null {
  const record = input.record;
  if (!record) return null;

  const liveItems = record.items.filter((i) => i.status !== "revised" && i.status !== "rejected");
  const emergingObservations = liveItems
    .filter((i) => !canInfluenceJudgment(i))
    .slice(0, 6)
    .map((i) => ({
      statement: i.statement,
      confidence: round2(i.confidence),
      evidenceCount: i.evidenceCount,
    }));

  const activeInsights = liveItems
    .filter((i) => canInfluenceJudgment(i))
    .slice(0, 8)
    .map((i) => ({
      statement: i.statement,
      confidence: round2(i.confidence),
      evidenceCount: i.evidenceCount,
      patternKey: i.patternKey,
      category: i.category,
    }));

  const shareableInsights = liveItems
    .filter((i) => canShareInsight(i, input))
    .slice(0, 4)
    .map((i) => ({
      statement: i.statement,
      confidence: round2(i.confidence),
      evidenceCount: i.evidenceCount,
      patternKey: i.patternKey,
      customerFacingHint: customerFacingInsightHint(i),
    }));

  const strategiesWorked = liveItems
    .filter((i) => i.category === "strategy_worked" && canInfluenceJudgment(i))
    .map((i) => i.statement)
    .slice(0, 4);
  const strategiesFailed = liveItems
    .filter((i) => i.category === "strategy_failed" && canInfluenceJudgment(i))
    .map((i) => i.statement)
    .slice(0, 4);

  const openExperiments = record.experiments
    .filter((e) => e.status === "proposed" || e.status === "running")
    .map((e) => ({ description: e.description, status: e.status }))
    .slice(0, 3);

  const stage = input.lifecycleStage ?? "understand";
  const coachingPosture = buildCoachingPosture({
    stage,
    day: input.lifecycleDay,
    shareableCount: shareableInsights.length,
    notes: record.coachingNotes,
  });

  return {
    relationshipDay: input.lifecycleDay,
    stage,
    utteranceMode: input.utteranceMode,
    coachingPosture,
    knownPreferences: record.preferences.slice(0, 8).map((p) => ({
      content: p.content,
      polarity: p.polarity,
      confidence: round2(p.confidence),
    })),
    emergingObservations,
    activeInsights,
    shareableInsights,
    strategiesWorked,
    strategiesFailed,
    openExperiments,
    day21SynthesisReady: stage === "day21_ending" || (input.lifecycleDay != null && input.lifecycleDay >= 21),
    guidance: buildUnderstandingGuidance({
      utteranceMode: input.utteranceMode,
      stage,
      shareableCount: shareableInsights.length,
      emergingCount: emergingObservations.length,
    }),
  };
}

function buildCoachingPosture(input: {
  stage: CoachingAiV2LifecycleStage | string;
  day: number | null;
  shareableCount: number;
  notes: string[];
}): string {
  const personal = input.notes[0] ? ` 個人化：${input.notes[0]}` : "";
  switch (input.stage) {
    case "understand":
      return `早期：多觀察、多記得，少下定論。不要對顧客宣稱已抓到模式。${personal}`;
    case "find_patterns":
      return input.shareableCount > 0
        ? `中期：有足夠證據時可點出模式，並提議小實驗。${personal}`
        : `中期：繼續累積證據；證據不足時只記得，不硬講模式。${personal}`;
    case "experiment":
      return `實驗期：記得先前實驗與結果，個人化介入。${personal}`;
    case "build_autonomy":
      return `後期：幫對方看懂自己，少說教。${personal}`;
    case "day21_ending":
      return `Day21：用真實理解收束——學到什麼、什麼有用、什麼沒用。禁止空洞畢業詞。${personal}`;
    default:
      return `依證據與當下意圖回應。${personal}`;
  }
}

function buildUnderstandingGuidance(input: {
  utteranceMode: Go21UtteranceMode;
  stage: string;
  shareableCount: number;
  emergingCount: number;
}): string {
  const modeHints: Record<Go21UtteranceMode, string> = {
    reporting: "對方在報狀況——可短確認或幾乎不說；不要硬給建議／問句／營養課。",
    asking_advice: "對方在要建議——給可執行觀點，仍可短。",
    factual_question: "對方在問事實／原理——直接回答。",
    seeking_help: "對方在求助——先幫決策或拆一步。",
    making_plan: "對方在計畫——用今天脈絡＋目標＋已知理解一起判斷。",
    casual_chat: "閒聊——當人聊；不必拉回飲食。",
    memory_check: "在檢查你是否記得——據實回答歷史，不要改念講義。",
    other: "依意圖自由選擇有用行為（含沉默／短回／挑戰／點出模式）。",
  };
  const insightGate =
    input.shareableCount > 0
      ? "有可分享的 longitudinal insight：僅在這一輪真正有用時點出；不要每則都講。"
      : input.emergingCount > 0
        ? "只有 emerging 觀察：內部記得即可，禁止宣稱已抓到穩定模式。"
        : "尚無足夠個人模式證據：不要發明模式。";
  return `${modeHints[input.utteranceMode]} ${insightGate} 階段=${input.stage}。`;
}

export async function loadGo21UnderstandingRecord(
  enrollmentId: string,
): Promise<Go21UnderstandingRecord | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_enrollments")
    .select("go21_understanding_json")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (error) {
    if (/go21_understanding_json/.test(error.message)) return null;
    throw new CoachingServiceError(error.message, 500);
  }
  return parseGo21UnderstandingRecord(data?.go21_understanding_json);
}

export async function saveGo21UnderstandingRecord(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  record: Go21UnderstandingRecord;
}): Promise<Go21UnderstandingRecord> {
  const supabase = createSupabaseServiceClient();
  const { data: existing, error: readError } = await supabase
    .from("coaching_enrollments")
    .select("id, customer_id, owner_member_id")
    .eq("id", input.enrollmentId)
    .maybeSingle();
  if (readError) {
    if (/go21_understanding_json/.test(readError.message)) {
      // Column missing — soft no-op for older envs
      return input.record;
    }
    throw new CoachingServiceError(readError.message, 500);
  }
  if (!existing) throw new CoachingServiceError("Enrollment not found", 404);
  if (
    existing.customer_id !== input.customerId ||
    existing.owner_member_id !== input.ownerMemberId
  ) {
    throw new CoachingServiceError("Forbidden", 403);
  }

  const { error: writeError } = await supabase
    .from("coaching_enrollments")
    .update({
      go21_understanding_json: input.record,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.enrollmentId)
    .eq("customer_id", input.customerId)
    .eq("owner_member_id", input.ownerMemberId);

  if (writeError) {
    if (/go21_understanding_json/.test(writeError.message)) return input.record;
    throw new CoachingServiceError(writeError.message, 500);
  }
  return input.record;
}

/** Build Day 21 synthesis bullets from durable understanding (evidence only). */
export function synthesizeDay21Understanding(record: Go21UnderstandingRecord | null): {
  majorPatterns: string[];
  whatWorked: string[];
  whatDidNot: string[];
  recurringDifficulties: string[];
} {
  if (!record) {
    return { majorPatterns: [], whatWorked: [], whatDidNot: [], recurringDifficulties: [] };
  }
  const live = record.items.filter((i) => i.status === "active" || i.status === "confirmed");
  return {
    majorPatterns: live
      .filter((i) => i.category === "eating_pattern" || i.category === "timing_goal_link")
      .filter((i) => canInfluenceJudgment(i))
      .map((i) => i.statement)
      .slice(0, 5),
    whatWorked: live
      .filter((i) => i.category === "strategy_worked")
      .map((i) => i.statement)
      .slice(0, 5),
    whatDidNot: live
      .filter((i) => i.category === "strategy_failed")
      .map((i) => i.statement)
      .slice(0, 5),
    recurringDifficulties: live
      .filter((i) => i.category === "difficulty" || i.category === "trigger")
      .filter((i) => canInfluenceJudgment(i))
      .map((i) => i.statement)
      .slice(0, 5),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function newId(): string {
  return crypto.randomUUID();
}
