import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import {
  GO21_PRIMARY_DIRECTION_LABELS,
  GO21_PRIMARY_DIRECTIONS,
  type Go21GoalHistoryEntry,
  type Go21GoalPublicView,
  type Go21GoalRecord,
  type Go21GoalSnapshot,
  type Go21GoalSource,
  type Go21PrimaryDirection,
} from "@/types/go21";

const PLACEHOLDER_GOALS = new Set(["21 天體驗", "21天體驗", "陪跑目標"]);

export function isGo21PrimaryDirection(value: unknown): value is Go21PrimaryDirection {
  return (
    typeof value === "string" &&
    (GO21_PRIMARY_DIRECTIONS as readonly string[]).includes(value)
  );
}

export function parseGo21GoalRecord(raw: unknown): Go21GoalRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const current = parseSnapshot(obj.current);
  const original = parseSnapshot(obj.original) ?? current;
  if (!current || !original) return null;
  const history = Array.isArray(obj.history)
    ? obj.history
        .map((entry): Go21GoalHistoryEntry | null => {
          if (!entry || typeof entry !== "object") return null;
          const e = entry as Record<string, unknown>;
          const goal = parseSnapshot(e.goal);
          if (!goal || typeof e.at !== "string") return null;
          return {
            at: e.at,
            goal,
            reason: typeof e.reason === "string" ? e.reason.slice(0, 200) : "update",
          };
        })
        .filter((x): x is Go21GoalHistoryEntry => Boolean(x))
        .slice(-20)
    : [];
  return { version: 1, current, original, history };
}

function parseSnapshot(raw: unknown): Go21GoalSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isGo21PrimaryDirection(o.primaryDirection)) return null;
  const personalGoal = typeof o.personalGoal === "string" ? o.personalGoal.trim() : "";
  if (!personalGoal || personalGoal.length > 400) return null;
  let targetWeightKg: number | null = null;
  if (o.targetWeightKg != null) {
    const n = Number(o.targetWeightKg);
    if (!Number.isFinite(n) || n < 35 || n > 200) return null;
    targetWeightKg = Math.round(n * 100) / 100;
  }
  return {
    primaryDirection: o.primaryDirection,
    personalGoal,
    targetWeightKg,
    setAt: typeof o.setAt === "string" ? o.setAt : new Date().toISOString(),
    source:
      o.source === "chat_confirmed" || o.source === "ui_edit" || o.source === "onboarding"
        ? o.source
        : "onboarding",
  };
}

export function toGo21GoalPublicView(record: Go21GoalRecord | null): Go21GoalPublicView | null {
  if (!record) return null;
  const wasRefined =
    record.current.personalGoal !== record.original.personalGoal ||
    record.current.primaryDirection !== record.original.primaryDirection ||
    record.current.targetWeightKg !== record.original.targetWeightKg ||
    record.history.length > 0;
  return {
    primaryDirection: record.current.primaryDirection,
    primaryDirectionLabel: GO21_PRIMARY_DIRECTION_LABELS[record.current.primaryDirection],
    personalGoal: record.current.personalGoal,
    targetWeightKg: record.current.targetWeightKg,
    originalPersonalGoal: wasRefined ? record.original.personalGoal : null,
    wasRefined,
    setAt: record.current.setAt,
  };
}

/** Short label synced to enrollment.goal for existing profileMemory.goal path. */
export function go21GoalDisplayLabel(snapshot: Go21GoalSnapshot): string {
  const direction = GO21_PRIMARY_DIRECTION_LABELS[snapshot.primaryDirection];
  const personal = snapshot.personalGoal.trim();
  if (personal.length <= 40) return personal;
  return `${direction}｜${personal.slice(0, 36)}…`;
}

export function enrollmentNeedsGo21Goal(input: {
  go21GoalJson?: unknown;
  goal?: string | null;
}): boolean {
  const record = parseGo21GoalRecord(input.go21GoalJson);
  if (record?.current.personalGoal.trim()) return false;
  const legacy = input.goal?.trim() ?? "";
  if (!legacy || PLACEHOLDER_GOALS.has(legacy)) return true;
  // Free-text coach goal without structured Go21 record → invite once, don't block forever after set.
  return true;
}

export type Go21GoalSafetyResult = {
  ok: boolean;
  reasons: string[];
  /** Soft warning — still store but coach should not treat as optimization target. */
  caution: boolean;
  message: string | null;
};

/**
 * Lightweight unsafe-target checks. Reuses Go21 safety philosophy — not medical diagnosis.
 */
export function assessGo21GoalSafety(input: {
  personalGoal: string;
  targetWeightKg: number | null;
  currentWeightKg?: number | null;
}): Go21GoalSafetyResult {
  const reasons: string[] = [];
  const text = input.personalGoal;
  if (/斷食|絕食|不吃東西|只喝水減肥|瀉藥|催吐|極限減重|一天只吃一餐減肥/.test(text)) {
    reasons.push("dangerous_restriction_language");
  }
  if (input.targetWeightKg != null && input.currentWeightKg != null) {
    const delta = input.currentWeightKg - input.targetWeightKg;
    // >8 kg in a 21-day window is an aggressive ask — caution, do not optimize toward it.
    if (delta >= 8) reasons.push("aggressive_weight_target");
    if (input.targetWeightKg < 40 && input.currentWeightKg >= 50) {
      reasons.push("unsafe_low_target_weight");
    }
  }
  if (reasons.some((r) => r === "dangerous_restriction_language" || r === "unsafe_low_target_weight")) {
    return {
      ok: false,
      reasons,
      caution: true,
      message:
        "這個目標對健康風險偏高，我不會把它當成要拼命達成的數字。我們可以改成更安全、可延續的方向；必要時請跟真人教練／醫療專業確認。",
    };
  }
  if (reasons.includes("aggressive_weight_target")) {
    return {
      ok: true,
      reasons,
      caution: true,
      message:
        "21 天內想降很多體重通常不容易也不建議硬衝。我會陪你往更好的飲食節奏走，但不會把極端數字當成功標準。",
    };
  }
  return { ok: true, reasons: [], caution: false, message: null };
}

export function buildGo21GoalSnapshot(input: {
  primaryDirection: Go21PrimaryDirection;
  personalGoal: string;
  targetWeightKg?: number | null;
  source: Go21GoalSource;
  setAt?: string;
}): Go21GoalSnapshot {
  const personalGoal = input.personalGoal.trim().slice(0, 400);
  if (!personalGoal) {
    throw new CoachingServiceError("請用一句話告訴我，21 天後你最希望有什麼改變。", 400);
  }
  if (!isGo21PrimaryDirection(input.primaryDirection)) {
    throw new CoachingServiceError("請選擇一個主要方向。", 400);
  }
  let targetWeightKg: number | null = null;
  if (input.targetWeightKg != null && input.targetWeightKg !== undefined) {
    const n = Number(input.targetWeightKg);
    if (!Number.isFinite(n) || n < 35 || n > 200) {
      throw new CoachingServiceError("目標體重看起來不合理，請再確認。", 400);
    }
    targetWeightKg = Math.round(n * 100) / 100;
  }
  return {
    primaryDirection: input.primaryDirection,
    personalGoal,
    targetWeightKg,
    setAt: input.setAt ?? new Date().toISOString(),
    source: input.source,
  };
}

export async function loadGo21GoalRecord(enrollmentId: string): Promise<Go21GoalRecord | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_enrollments")
    .select("go21_goal_json, goal")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (error) {
    // Column may be missing pre-068 — treat as no goal.
    if (/go21_goal_json/.test(error.message)) return null;
    throw new CoachingServiceError(error.message, 500);
  }
  return parseGo21GoalRecord(data?.go21_goal_json);
}

export async function saveGo21Goal(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  snapshot: Go21GoalSnapshot;
  /** When refining an existing goal. */
  reason?: string;
  replaceOriginal?: boolean;
}): Promise<{ record: Go21GoalRecord; safety: Go21GoalSafetyResult }> {
  const supabase = createSupabaseServiceClient();
  const { data: existing, error: readError } = await supabase
    .from("coaching_enrollments")
    .select("id, customer_id, owner_member_id, go21_goal_json, goal")
    .eq("id", input.enrollmentId)
    .maybeSingle();

  if (readError) {
    if (/go21_goal_json/.test(readError.message)) {
      throw new CoachingServiceError("目標功能尚未就緒，請稍後再試。", 503);
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

  const prior = parseGo21GoalRecord(existing.go21_goal_json);
  const safety = assessGo21GoalSafety({
    personalGoal: input.snapshot.personalGoal,
    targetWeightKg: input.snapshot.targetWeightKg,
  });

  // Still persist cautious goals (with caution flag for AI); block only hard unsafe.
  if (!safety.ok) {
    return { record: prior ?? { version: 1, current: input.snapshot, original: input.snapshot, history: [] }, safety };
  }

  let record: Go21GoalRecord;
  if (!prior) {
    record = {
      version: 1,
      current: input.snapshot,
      original: input.snapshot,
      history: [],
    };
  } else {
    const history = [
      ...prior.history,
      {
        at: new Date().toISOString(),
        goal: prior.current,
        reason: input.reason ?? "refined",
      },
    ].slice(-20);
    record = {
      version: 1,
      current: input.snapshot,
      original: input.replaceOriginal ? input.snapshot : prior.original,
      history,
    };
  }

  const display = go21GoalDisplayLabel(input.snapshot);
  const { error: writeError } = await supabase
    .from("coaching_enrollments")
    .update({
      go21_goal_json: record,
      goal: display,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.enrollmentId)
    .eq("customer_id", input.customerId)
    .eq("owner_member_id", input.ownerMemberId);

  if (writeError) {
    throw new CoachingServiceError(writeError.message, 500);
  }

  return { record, safety };
}

/** Compact payload for V2 prompts — silent coaching anchor, not a daily mantra. */
export function compactGo21GoalForAi(record: Go21GoalRecord | null): {
  primaryDirection: string;
  primaryDirectionLabel: string;
  personalGoal: string;
  targetWeightKg: number | null;
  originalPersonalGoal: string | null;
  wasRefined: boolean;
  guidance: string;
} | null {
  if (!record) return null;
  const view = toGo21GoalPublicView(record)!;
  return {
    primaryDirection: view.primaryDirection,
    primaryDirectionLabel: view.primaryDirectionLabel,
    personalGoal: view.personalGoal,
    targetWeightKg: view.targetWeightKg,
    originalPersonalGoal: view.originalPersonalGoal,
    wasRefined: view.wasRefined,
    guidance:
      "Protect the live goal with professional judgment. current personalGoal is the coaching anchor; originalPersonalGoal is history. Do not recite the goal as a mantra. When today's food or plans conflict with the goal, have a clear opinion (may disagree, may say you wouldn't choose that today, may offer one practical compromise) — never empty praise. A concrete alternative is optional, not a required second paragraph. Never invent progress.",
  };
}
