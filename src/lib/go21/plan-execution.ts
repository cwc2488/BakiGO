import type {
  Go21CoachPlanItem,
  Go21PlanDayItemState,
  Go21PlanDayRecord,
} from "@/types/go21";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";

/**
 * Infer plan item completion / intentional skip from natural conversation.
 * Conservative — never fake certainty.
 */
export function inferGo21PlanExecutionFromMessage(input: {
  message: string;
  planItems: Go21CoachPlanItem[];
  prior: Go21PlanDayRecord | null;
  logDate: string;
  visionIsFood?: boolean | null;
  visionFoodLabel?: string | null;
}): Go21PlanDayRecord | null {
  if (input.planItems.length === 0) return null;
  const msg = input.message.trim();
  if (!msg && !input.visionIsFood) {
    return input.prior;
  }

  const now = new Date().toISOString();
  const byId = new Map<string, Go21PlanDayItemState>();
  for (const prev of input.prior?.items ?? []) {
    byId.set(prev.itemId, { ...prev });
  }
  for (const item of input.planItems) {
    if (!byId.has(item.id)) {
      byId.set(item.id, {
        itemId: item.id,
        status: "unknown",
        evidence: null,
        confidence: "low",
        note: null,
        updatedAt: now,
      });
    }
  }

  let changed = false;

  // Intentional skip / deviation
  if (/先不|今天不|不喝|不吃|改成|聚餐|應酬|忘記|沒喝|沒吃|跳過/.test(msg)) {
    for (const item of input.planItems) {
      if (!messageMentionsPlanItem(msg, item)) continue;
      const intentional = /先不|今天不|改成|聚餐|應酬|跳過/.test(msg);
      const missed = /忘記|沒喝|沒吃/.test(msg) && !intentional;
      const next: Go21PlanDayItemState = {
        itemId: item.id,
        status: intentional ? "skipped_intentional" : missed ? "missed" : "adjusted",
        evidence: msg.slice(0, 120),
        confidence: intentional || missed ? "high" : "medium",
        note: intentional ? "intentional_deviation" : missed ? "forgot" : "adjusted",
        updatedAt: now,
      };
      byId.set(item.id, next);
      changed = true;
    }
  }

  // Completion language
  if (/喝完|吃完|做完|完成|搞定|好了|已經喝|已經吃|剛喝|剛吃/.test(msg)) {
    for (const item of input.planItems) {
      if (!messageMentionsPlanItem(msg, item) && !periodHintMatches(msg, item)) continue;
      byId.set(item.id, {
        itemId: item.id,
        status: "completed",
        evidence: msg.slice(0, 120),
        confidence: messageMentionsPlanItem(msg, item) ? "high" : "medium",
        note: null,
        updatedAt: now,
      });
      changed = true;
    }
  }

  // Vision food may complete a matching period item when labels align
  if (input.visionIsFood && input.visionFoodLabel) {
    const label = input.visionFoodLabel;
    for (const item of input.planItems) {
      if (!foodLabelMatchesItem(label, item)) continue;
      const existing = byId.get(item.id);
      if (existing?.status === "completed" && existing.confidence === "high") continue;
      byId.set(item.id, {
        itemId: item.id,
        status: "completed",
        evidence: `vision:${label}`.slice(0, 120),
        confidence: "medium",
        note: "vision_inferred",
        updatedAt: now,
      });
      changed = true;
    }
  }

  if (!changed && input.prior) return input.prior;
  if (!changed) return null;

  return {
    version: 1,
    logDate: input.logDate,
    appliedItemIds: input.planItems.map((i) => i.id),
    items: Array.from(byId.values()),
    updatedAt: now,
  };
}

function messageMentionsPlanItem(msg: string, item: Go21CoachPlanItem): boolean {
  const name = item.name.trim();
  if (name.length >= 2 && msg.includes(name)) return true;
  // Soft aliases for common free-text names without hardcoding brands
  if (/奶昔|蛋白飲|代餐/.test(name) && /奶昔|蛋白飲|代餐/.test(msg)) return true;
  if (/正常|一般餐|正餐/.test(name) && /正常|便當|午餐|晚餐|吃飯/.test(msg)) return true;
  return false;
}

function periodHintMatches(msg: string, item: Go21CoachPlanItem): boolean {
  const map: Record<string, RegExp> = {
    breakfast: /早餐|早上/,
    morning: /早上|上午/,
    lunch: /午餐|中午/,
    afternoon: /下午/,
    dinner: /晚餐|晚上/,
    evening: /傍晚|晚上/,
    night: /睡前|宵夜前/,
  };
  const re = map[item.period];
  return Boolean(re && re.test(msg) && messageMentionsPlanItem(msg, item));
}

function foodLabelMatchesItem(label: string, item: Go21CoachPlanItem): boolean {
  if (label.includes(item.name) || item.name.includes(label)) return true;
  if (/奶昔|蛋白飲|代餐/.test(item.name) && /奶昔|蛋白飲|代餐|奶昔杯/.test(label)) return true;
  return false;
}

export function parseGo21PlanDayRecord(raw: unknown): Go21PlanDayRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.logDate !== "string" || !Array.isArray(o.items)) return null;
  const items: Go21PlanDayItemState[] = [];
  for (const row of o.items) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.itemId !== "string") continue;
    const status = r.status;
    if (
      status !== "unknown" &&
      status !== "completed" &&
      status !== "skipped_intentional" &&
      status !== "missed" &&
      status !== "adjusted"
    ) {
      continue;
    }
    items.push({
      itemId: r.itemId,
      status,
      evidence: typeof r.evidence === "string" ? r.evidence : null,
      confidence: r.confidence === "high" || r.confidence === "medium" ? r.confidence : "low",
      note: typeof r.note === "string" ? r.note : null,
      updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
    });
  }
  return {
    version: 1,
    logDate: o.logDate,
    appliedItemIds: Array.isArray(o.appliedItemIds)
      ? o.appliedItemIds.filter((x): x is string => typeof x === "string")
      : [],
    items,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
  };
}

export async function loadGo21PlanDayRecord(input: {
  enrollmentId: string;
  logDate: string;
}): Promise<Go21PlanDayRecord | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("coaching_daily_logs")
    .select("go21_plan_day_json")
    .eq("enrollment_id", input.enrollmentId)
    .eq("log_date", input.logDate)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    if (/go21_plan_day_json|column/i.test(error.message)) return null;
    return null;
  }
  return parseGo21PlanDayRecord(data?.go21_plan_day_json ?? null);
}

export async function saveGo21PlanDayRecord(input: {
  enrollmentId: string;
  logDate: string;
  record: Go21PlanDayRecord;
}): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("coaching_daily_logs")
    .update({ go21_plan_day_json: input.record })
    .eq("enrollment_id", input.enrollmentId)
    .eq("log_date", input.logDate)
    .is("deleted_at", null);
  if (error && !/go21_plan_day_json|column/i.test(error.message)) {
    console.error(
      JSON.stringify({
        event: "go21_plan_day_save_failed",
        enrollmentId: input.enrollmentId,
        error: error.message,
      }),
    );
  }
}
