import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { CoachingServiceError } from "@/lib/coaching/coaching-service";
import {
  GO21_COACH_PLAN_PERIOD_LABELS,
  GO21_COACH_PLAN_PERIODS,
  type Go21CoachPlanForAi,
  type Go21CoachPlanItem,
  type Go21CoachPlanPeriod,
  type Go21CoachPlanPublicView,
  type Go21CoachPlanRecord,
  type Go21CoachPlanSnapshot,
  type Go21CoachPlanSource,
  type Go21PlanDayRecord,
} from "@/types/go21";

const PERIOD_SET = new Set<string>(GO21_COACH_PLAN_PERIODS);

export function parseGo21CoachPlanRecord(raw: unknown): Go21CoachPlanRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const current = parseSnapshot(obj.current);
  if (!current || current.items.length === 0) return null;
  const history = Array.isArray(obj.history)
    ? obj.history
        .map((entry): Go21CoachPlanRecord["history"][number] | null => {
          if (!entry || typeof entry !== "object") return null;
          const e = entry as Record<string, unknown>;
          const plan = parseSnapshot(e.plan);
          if (!plan || typeof e.at !== "string") return null;
          return {
            at: e.at,
            plan,
            reason: typeof e.reason === "string" ? e.reason.slice(0, 200) : "update",
          };
        })
        .filter((x): x is Go21CoachPlanRecord["history"][number] => Boolean(x))
        .slice(-20)
    : [];
  return { version: 1, current, history };
}

function parseSnapshot(raw: unknown): Go21CoachPlanSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;
  const items = o.items
    .map((row, index) => parseItem(row, index))
    .filter((x): x is Go21CoachPlanItem => Boolean(x));
  if (items.length === 0) return null;
  const source: Go21CoachPlanSource =
    o.source === "activation" || o.source === "coach_edit" ? o.source : "coach_edit";
  return {
    items: items.sort((a, b) => a.sortOrder - b.sortOrder),
    setAt: typeof o.setAt === "string" ? o.setAt : new Date().toISOString(),
    source,
    effectiveFrom: typeof o.effectiveFrom === "string" ? o.effectiveFrom.slice(0, 10) : null,
  };
}

function parseItem(raw: unknown, index: number): Go21CoachPlanItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim().slice(0, 80) : "";
  if (!name) return null;
  const period =
    typeof o.period === "string" && PERIOD_SET.has(o.period)
      ? (o.period as Go21CoachPlanPeriod)
      : "other";
  const recurrence = parseRecurrence(o.recurrence);
  const enabled = o.enabled === false ? false : true;
  return {
    id: typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 40) : `item_${index + 1}`,
    period,
    name,
    amount: typeof o.amount === "string" && o.amount.trim() ? o.amount.trim().slice(0, 40) : null,
    instruction:
      typeof o.instruction === "string" && o.instruction.trim()
        ? o.instruction.trim().slice(0, 200)
        : null,
    recurrence,
    sortOrder: typeof o.sortOrder === "number" && Number.isFinite(o.sortOrder) ? o.sortOrder : index,
    enabled,
  };
}

function parseRecurrence(raw: unknown): Go21CoachPlanItem["recurrence"] {
  if (raw === "weekdays" || raw === "weekends") return raw;
  if (Array.isArray(raw)) {
    const days = raw
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
      .slice(0, 7);
    if (days.length > 0) return days;
  }
  return "daily";
}

export function toGo21CoachPlanPublicView(
  record: Go21CoachPlanRecord | null,
): Go21CoachPlanPublicView | null {
  if (!record) return null;
  const items = record.current.items.filter((i) => i.enabled);
  if (items.length === 0) return null;
  return {
    items,
    setAt: record.current.setAt,
    source: record.current.source,
    effectiveFrom: record.current.effectiveFrom,
    hasAny: true,
  };
}

/** Items that apply on a given Taipei log date (recurrence + enabled). */
export function resolveGo21CoachPlanForDate(
  record: Go21CoachPlanRecord | null,
  logDate: string,
): Go21CoachPlanItem[] {
  const view = toGo21CoachPlanPublicView(record);
  if (!view) return [];
  const effective = view.effectiveFrom;
  if (effective && logDate < effective) {
    // New plan not yet in effect — try last historical snapshot that was active
    const prior = record?.history
      .slice()
      .reverse()
      .find((h) => !h.plan.effectiveFrom || h.plan.effectiveFrom <= logDate);
    if (prior) {
      return prior.plan.items.filter((i) => i.enabled && itemAppliesOnDate(i, logDate));
    }
    return [];
  }
  return view.items.filter((i) => itemAppliesOnDate(i, logDate));
}

function itemAppliesOnDate(item: Go21CoachPlanItem, logDate: string): boolean {
  const dow = weekdayIso(logDate); // 1=Mon … 7=Sun
  if (item.recurrence === "daily") return true;
  if (item.recurrence === "weekdays") return dow >= 1 && dow <= 5;
  if (item.recurrence === "weekends") return dow === 6 || dow === 7;
  if (Array.isArray(item.recurrence)) return item.recurrence.includes(dow);
  return true;
}

function weekdayIso(logDate: string): number {
  // Parse as UTC noon to avoid TZ edge; logDate is calendar date in Taipei.
  const d = new Date(`${logDate}T12:00:00+08:00`);
  const js = d.getUTCDay(); // 0=Sun
  return js === 0 ? 7 : js;
}

export function buildGo21CoachPlanSnapshot(input: {
  items: Array<{
    id?: string;
    period: Go21CoachPlanPeriod | string;
    name: string;
    amount?: string | null;
    instruction?: string | null;
    recurrence?: Go21CoachPlanItem["recurrence"];
    sortOrder?: number;
    enabled?: boolean;
  }>;
  source: Go21CoachPlanSource;
  effectiveFrom?: string | null;
  setAt?: string;
}): Go21CoachPlanSnapshot {
  const items: Go21CoachPlanItem[] = [];
  for (let i = 0; i < input.items.length; i++) {
    const raw = input.items[i];
    const name = raw.name?.trim().slice(0, 80) ?? "";
    if (!name) continue;
    const period =
      typeof raw.period === "string" && PERIOD_SET.has(raw.period)
        ? (raw.period as Go21CoachPlanPeriod)
        : "other";
    items.push({
      id: raw.id?.trim() || `item_${i + 1}_${Math.random().toString(36).slice(2, 7)}`,
      period,
      name,
      amount: raw.amount?.trim() ? raw.amount.trim().slice(0, 40) : null,
      instruction: raw.instruction?.trim() ? raw.instruction.trim().slice(0, 200) : null,
      recurrence: raw.recurrence ?? "daily",
      sortOrder: raw.sortOrder ?? i,
      enabled: raw.enabled !== false,
    });
  }
  if (items.length === 0) {
    throw new CoachingServiceError("請至少加入一項每日安排。", 400);
  }
  if (items.length > 12) {
    throw new CoachingServiceError("每日安排最多 12 項。", 400);
  }
  return {
    items,
    setAt: input.setAt ?? new Date().toISOString(),
    source: input.source,
    effectiveFrom: input.effectiveFrom?.slice(0, 10) ?? null,
  };
}

export async function loadGo21CoachPlanRecord(
  enrollmentId: string,
): Promise<Go21CoachPlanRecord | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_enrollments")
    .select("go21_coach_plan_json")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (error) {
    // Column may not exist yet pre-migration — treat as no plan
    if (/go21_coach_plan_json|column/i.test(error.message)) return null;
    throw new CoachingServiceError(error.message, 500);
  }
  return parseGo21CoachPlanRecord(data?.go21_coach_plan_json ?? null);
}

export async function saveGo21CoachPlan(input: {
  enrollmentId: string;
  customerId: string;
  ownerMemberId: string;
  snapshot: Go21CoachPlanSnapshot;
  reason: string;
  prior: Go21CoachPlanRecord | null;
}): Promise<Go21CoachPlanRecord> {
  const history = input.prior
    ? [
        ...input.prior.history,
        {
          at: new Date().toISOString(),
          plan: input.prior.current,
          reason: input.reason.slice(0, 200),
        },
      ].slice(-20)
    : [];
  const record: Go21CoachPlanRecord = {
    version: 1,
    current: input.snapshot,
    history,
  };
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("coaching_enrollments")
    .update({ go21_coach_plan_json: record })
    .eq("id", input.enrollmentId)
    .eq("customer_id", input.customerId)
    .eq("owner_member_id", input.ownerMemberId);
  if (error) {
    if (/go21_coach_plan_json|column/i.test(error.message)) {
      throw new CoachingServiceError("資料庫尚未支援每日安排，請先套用 migration 071。", 503);
    }
    throw new CoachingServiceError(error.message, 500);
  }
  return record;
}

export function compactGo21CoachPlanForAi(input: {
  planItems: Go21CoachPlanItem[];
  dayRecord: Go21PlanDayRecord | null;
}): Go21CoachPlanForAi | null {
  if (input.planItems.length === 0) return null;
  return {
    items: input.planItems.map((i) => ({
      id: i.id,
      period: i.period,
      periodLabel: GO21_COACH_PLAN_PERIOD_LABELS[i.period],
      name: i.name,
      amount: i.amount,
      instruction: i.instruction,
    })),
    today: (input.dayRecord?.items ?? []).map((s) => ({
      itemId: s.itemId,
      status: s.status,
      evidence: s.evidence,
      confidence: s.confidence,
    })),
    guidance:
      "coachDailyPlan 是教練開的處方安排（權威）。AI 可提醒／解讀／注意到完成或偏離，但不可默默改寫計畫。" +
      "不要每則背誦整份計畫。偏離不是道德分數。today 是推斷執行狀態，不確定就別假裝完成。",
  };
}

export function formatGo21CoachPlanItemLabel(item: Pick<Go21CoachPlanItem, "period" | "name" | "amount">): string {
  const period = GO21_COACH_PLAN_PERIOD_LABELS[item.period] ?? item.period;
  const amount = item.amount ? ` ${item.amount}` : "";
  return `${period}：${item.name}${amount}`;
}
