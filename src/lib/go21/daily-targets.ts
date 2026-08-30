import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import type {
  Go21DailyTargetsPublicView,
  Go21DailyTargetsRecord,
  Go21DailyTargetsSnapshot,
  Go21DailyTargetsSource,
} from "@/types/go21";
import { GO21_DAILY_TARGET_PRESETS } from "@/types/go21";

export { GO21_DAILY_TARGET_PRESETS };

const WATER_MIN = 500;
const WATER_MAX = 6000;
const CAL_MIN = 800;
const CAL_MAX = 4500;
const PROTEIN_MIN = 20;
const PROTEIN_MAX = 250;
const SLEEP_MIN = 4;
const SLEEP_MAX = 12;

export function parseGo21DailyTargetsRecord(raw: unknown): Go21DailyTargetsRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const current = parseSnapshot(obj.current);
  if (!current) return null;
  const history = Array.isArray(obj.history)
    ? obj.history
        .map((entry): Go21DailyTargetsRecord["history"][number] | null => {
          if (!entry || typeof entry !== "object") return null;
          const e = entry as Record<string, unknown>;
          const targets = parseSnapshot(e.targets);
          if (!targets || typeof e.at !== "string") return null;
          return {
            at: e.at,
            targets,
            reason: typeof e.reason === "string" ? e.reason.slice(0, 200) : "update",
          };
        })
        .filter((x): x is Go21DailyTargetsRecord["history"][number] => Boolean(x))
        .slice(-20)
    : [];
  return { version: 1, current, history };
}

function parseSnapshot(raw: unknown): Go21DailyTargetsSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const waterMl = parseOptionalNumber(o.waterMl, WATER_MIN, WATER_MAX, 0);
  const caloriesKcal = parseOptionalNumber(o.caloriesKcal, CAL_MIN, CAL_MAX, 0);
  const proteinG = parseOptionalNumber(o.proteinG, PROTEIN_MIN, PROTEIN_MAX, 0);
  const sleepHours = parseOptionalNumber(o.sleepHours, SLEEP_MIN, SLEEP_MAX, 1);
  if (waterMl == null && caloriesKcal == null && proteinG == null && sleepHours == null) {
    return null;
  }
  const source: Go21DailyTargetsSource =
    o.source === "coach_edit" || o.source === "ui_edit" || o.source === "activation"
      ? o.source
      : "coach_edit";
  return {
    waterMl,
    caloriesKcal,
    proteinG,
    sleepHours,
    setAt: typeof o.setAt === "string" ? o.setAt : new Date().toISOString(),
    source,
  };
}

function parseOptionalNumber(
  value: unknown,
  min: number,
  max: number,
  decimals: 0 | 1,
): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  if (decimals === 0) return Math.round(n);
  return Math.round(n * 10) / 10;
}

export function toGo21DailyTargetsPublicView(
  record: Go21DailyTargetsRecord | null,
): Go21DailyTargetsPublicView | null {
  if (!record) return null;
  const c = record.current;
  const hasAny =
    c.waterMl != null || c.caloriesKcal != null || c.proteinG != null || c.sleepHours != null;
  if (!hasAny) return null;
  return {
    waterMl: c.waterMl,
    caloriesKcal: c.caloriesKcal,
    proteinG: c.proteinG,
    sleepHours: c.sleepHours,
    setAt: c.setAt,
    source: c.source,
    hasAny: true,
  };
}

export function enrollmentHasGo21DailyTargets(go21DailyTargetsJson: unknown): boolean {
  return Boolean(toGo21DailyTargetsPublicView(parseGo21DailyTargetsRecord(go21DailyTargetsJson)));
}

export function buildGo21DailyTargetsSnapshot(input: {
  waterMl?: number | null;
  caloriesKcal?: number | null;
  proteinG?: number | null;
  sleepHours?: number | null;
  source: Go21DailyTargetsSource;
  setAt?: string;
}): Go21DailyTargetsSnapshot {
  const waterMl = normalizeOrThrow(input.waterMl, WATER_MIN, WATER_MAX, 0, "每日喝水量");
  const caloriesKcal = normalizeOrThrow(input.caloriesKcal, CAL_MIN, CAL_MAX, 0, "每日熱量");
  const proteinG = normalizeOrThrow(input.proteinG, PROTEIN_MIN, PROTEIN_MAX, 0, "每日蛋白質");
  const sleepHours = normalizeOrThrow(input.sleepHours, SLEEP_MIN, SLEEP_MAX, 1, "每日睡眠");
  if (waterMl == null && caloriesKcal == null && proteinG == null && sleepHours == null) {
    throw new CoachingServiceError("請至少設定一項每日目標。", 400);
  }
  return {
    waterMl,
    caloriesKcal,
    proteinG,
    sleepHours,
    setAt: input.setAt ?? new Date().toISOString(),
    source: input.source,
  };
}

function normalizeOrThrow(
  value: number | null | undefined,
  min: number,
  max: number,
  decimals: 0 | 1,
  label: string,
): number | null {
  if (value == null || value === undefined || (typeof value === "number" && Number.isNaN(value))) {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new CoachingServiceError(`${label}看起來不合理，請再確認。`, 400);
  }
  if (decimals === 0) return Math.round(n);
  return Math.round(n * 10) / 10;
}

export async function loadGo21DailyTargetsRecord(
  enrollmentId: string,
): Promise<Go21DailyTargetsRecord | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_enrollments")
    .select("go21_daily_targets_json")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (error) {
    if (/go21_daily_targets_json/.test(error.message)) return null;
    throw new CoachingServiceError(error.message, 500);
  }
  return parseGo21DailyTargetsRecord(data?.go21_daily_targets_json);
}

export async function saveGo21DailyTargets(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  snapshot: Go21DailyTargetsSnapshot;
  reason?: string;
  prior?: Go21DailyTargetsRecord | null;
}): Promise<Go21DailyTargetsRecord> {
  const prior =
    input.prior ?? (await loadGo21DailyTargetsRecord(input.enrollmentId));
  const history = prior
    ? [
        ...prior.history,
        {
          at: new Date().toISOString(),
          targets: prior.current,
          reason: input.reason ?? "update",
        },
      ].slice(-20)
    : [];
  const record: Go21DailyTargetsRecord = {
    version: 1,
    current: input.snapshot,
    history,
  };
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("coaching_enrollments")
    .update({ go21_daily_targets_json: record })
    .eq("id", input.enrollmentId)
    .eq("customer_id", input.customerId)
    .eq("owner_member_id", input.ownerMemberId);
  if (error) {
    if (/go21_daily_targets_json/.test(error.message)) {
      throw new CoachingServiceError("每日目標欄位尚未就緒，請稍後再試。", 503);
    }
    throw new CoachingServiceError(error.message, 500);
  }
  return record;
}

/** Compact AI payload — silent coaching set-points, not a mantra. */
export function compactGo21DailyTargetsForAi(
  record: Go21DailyTargetsRecord | null,
): {
  waterMl: number | null;
  caloriesKcal: number | null;
  proteinG: number | null;
  sleepHours: number | null;
  guidance: string;
} | null {
  const view = toGo21DailyTargetsPublicView(record);
  if (!view) return null;
  return {
    waterMl: view.waterMl,
    caloriesKcal: view.caloriesKcal,
    proteinG: view.proteinG,
    sleepHours: view.sleepHours,
    guidance:
      "Daily targets are internal coaching set-points. Use them to judge today's approximate state. Do NOT recite remaining kcal/g/ml every turn. Mention numbers only when useful for this moment. Prefer one soft cue over a progress report. Never invent precision from photos.",
  };
}
