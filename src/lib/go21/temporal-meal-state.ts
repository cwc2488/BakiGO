import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import type { Go21ExtractedEvent } from "@/types/go21";

/**
 * Temporal utterance kinds for Go21 continuity.
 * Distinguishes already-eaten meals from future plans and other chat.
 */
export type Go21UtteranceKind = "eaten" | "planned" | "other";

export type Go21TemporalMealEntry = {
  logDate: string;
  mealSlot: string | null;
  label: string;
  kind: Go21UtteranceKind;
  relativeLabel: string | null;
  source: "today_meal" | "turn" | "vision" | "current";
  /** True when this entry is still an open plan for the generation day. */
  planStillOpen: boolean;
};

export type Go21TemporalTimeline = {
  generationLogDate: string;
  todayEaten: Go21TemporalMealEntry[];
  openPlansForToday: Go21TemporalMealEntry[];
  /** Historical eaten/plans that must not be treated as tonight/today. */
  historical: Go21TemporalMealEntry[];
  /** Compact prompt block — authoritative temporal grounding. */
  promptBlock: {
    generationLogDate: string;
    todayEaten: Array<{ slot: string | null; label: string }>;
    openPlansForToday: Array<{ slot: string | null; label: string }>;
    doNotTreatAsCurrent: Array<{ logDate: string; label: string; kind: string }>;
    guidance: string;
  };
};

const PLAN_RE =
  /等一下|待會|待会儿|等等|打算|準備吃|明天|後天|預計|想吃(?!了)|再吃|晚點吃|晚上想吃|等下吃/;
const EATEN_RE =
  /吃了|喝了|剛吃|剛剛吃|吃完|吃過|剛剛.{0,6}(?:早餐|午餐|晚餐|宵夜).{0,6}吃|早餐吃|午餐吃|晚餐吃|宵夜吃/;

/**
 * Classify whether the utterance reports food already consumed vs a future plan.
 * Ambiguous → other (do not invent certainty).
 */
export function classifyGo21UtteranceKind(text: string): Go21UtteranceKind {
  const msg = text.trim();
  if (!msg) return "other";
  const hasFoodCue =
    /吃|喝|早餐|午餐|晚餐|宵夜|點心|飯|麵|漢堡|炸|沙拉|便當|雞|肉|茶/.test(msg);
  if (!hasFoodCue) return "other";

  const isPlan = PLAN_RE.test(msg) && !/吃了|喝了|吃完|吃過/.test(msg);
  const isEaten = EATEN_RE.test(msg) || (/剛剛/.test(msg) && /(?:早餐|午餐|晚餐|宵夜|吃)/.test(msg));

  if (isPlan && !isEaten) return "planned";
  if (isEaten) return "eaten";
  // Bare "午餐炸雞" / "早餐燒餅" without 吃了 — treat as eaten report when slot + food present
  if (
    /(?:早餐|午餐|晚餐|宵夜|中午|早上)/.test(msg) &&
    /飯|麵|漢堡|炸|燒餅|油條|雞|肉|沙拉|便當|蛋|魚|排|水餃/.test(msg) &&
    !PLAN_RE.test(msg)
  ) {
    return "eaten";
  }
  return "other";
}

export function resolveGo21RelativeDayLabel(text: string): string | null {
  if (/前天/.test(text)) return "前天";
  if (/昨天|昨晚|昨夜|昨日/.test(text)) return "昨天";
  if (/明天|明早|明晚/.test(text)) return "明天";
  if (/後天/.test(text)) return "後天";
  if (/今天|今日/.test(text)) return "今天";
  if (/剛剛|剛才|刚/.test(text)) return "剛剛";
  if (/早上|上午/.test(text)) return "早上";
  if (/中午/.test(text)) return "中午";
  if (/下午/.test(text)) return "下午";
  if (/晚上|今晚/.test(text)) return "晚上";
  return null;
}

/** Extend event date resolution with tomorrow / day-after. */
export function resolveGo21EventDateWithFuture(
  text: string,
  messageLogDate: string,
): string {
  if (/後天/.test(text)) return addCalendarDays(messageLogDate, 2);
  if (/明天|明早|明晚|明日/.test(text)) return addCalendarDays(messageLogDate, 1);
  if (/前天/.test(text)) return addCalendarDays(messageLogDate, -2);
  if (/昨天|昨晚|昨夜|昨日/.test(text)) return addCalendarDays(messageLogDate, -1);
  if (/今天|剛才|剛剛|刚|今日/.test(text)) return messageLogDate;
  return messageLogDate;
}

export function buildTemporalMetadataFromExtract(input: {
  extracted: Go21ExtractedEvent;
  displayContent: string;
  messageLogDate: string;
}): Record<string, unknown> {
  const kind =
    input.extracted.utteranceKind ??
    classifyGo21UtteranceKind(input.displayContent);
  const relative = resolveGo21RelativeDayLabel(input.displayContent);
  return {
    temporal: {
      utteranceKind: kind,
      eventDate: input.extracted.eventDate ?? input.messageLogDate,
      eventTimeApprox: input.extracted.eventTimeApprox,
      mealSlot: input.extracted.mealSlot,
      relativeLabel: relative,
      messageLogDate: input.messageLogDate,
    },
  };
}

type TimelineTurnInput = {
  role: string;
  content: string;
  logDate: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Authoritative temporal view for generation — filters stale plans and
 * separates today-eaten from historical mentions.
 */
export function buildGo21TemporalTimeline(input: {
  generationLogDate?: string | null;
  todayMealNotes?: Array<{ slot: string; note: string | null | undefined }>;
  recentTurns?: TimelineTurnInput[];
  visionSummaries?: Array<{ summary: string; correction: string | null }>;
  currentMessage?: string | null;
}): Go21TemporalTimeline {
  const generationLogDate = input.generationLogDate?.trim() || coachingTodayLogDate();
  const todayEaten: Go21TemporalMealEntry[] = [];
  const openPlansForToday: Go21TemporalMealEntry[] = [];
  const historical: Go21TemporalMealEntry[] = [];
  const seen = new Set<string>();

  const push = (entry: Go21TemporalMealEntry) => {
    const key = `${entry.logDate}|${entry.kind}|${entry.mealSlot ?? ""}|${entry.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (entry.logDate === generationLogDate && entry.kind === "eaten") {
      todayEaten.push(entry);
      return;
    }
    if (entry.planStillOpen) {
      openPlansForToday.push(entry);
      return;
    }
    historical.push(entry);
  };

  for (const meal of input.todayMealNotes ?? []) {
    const note = meal.note?.trim();
    if (!note) continue;
    const labels = extractFoodLabels(note);
    for (const label of labels) {
      push({
        logDate: generationLogDate,
        mealSlot: meal.slot,
        label,
        kind: "eaten",
        relativeLabel: null,
        source: "today_meal",
        planStillOpen: false,
      });
    }
  }

  // Slots already filled today supersede open plans for that slot
  const eatenSlotsToday = new Set(
    todayEaten.map((e) => e.mealSlot).filter((s): s is string => Boolean(s)),
  );

  for (const turn of input.recentTurns ?? []) {
    if (turn.role !== "customer") continue;
    const temporal = readTemporalFromMetadata(turn.metadata);
    const content = turn.content ?? "";
    const kind =
      temporal?.utteranceKind ??
      classifyGo21UtteranceKind(content);
    if (kind === "other" && !temporal?.mealSlot) continue;

    const logDate =
      temporal?.eventDate ||
      turn.logDate ||
      generationLogDate;
    const labels = extractFoodLabels(content);
    if (labels.length === 0) continue;

    for (const label of labels) {
      const slot = temporal?.mealSlot ?? inferSlotFromText(content);
      const isToday = logDate === generationLogDate;
      const planStillOpen =
        kind === "planned" &&
        isToday &&
        !(slot && eatenSlotsToday.has(slot)) &&
        // If any eaten meal exists after a vague plan on same day, keep plan only if not clearly superseded by later reports
        true;

      // Past-day plans are never "tonight"
      const open = planStillOpen && isToday;

      push({
        logDate,
        mealSlot: slot,
        label,
        kind: kind === "other" ? "eaten" : kind,
        relativeLabel: temporal?.relativeLabel ?? resolveGo21RelativeDayLabel(content),
        source: "turn",
        planStillOpen: open,
      });
    }
  }

  for (const vision of input.visionSummaries ?? []) {
    const raw = vision.correction?.trim() || vision.summary?.trim();
    if (!raw) continue;
    // Non-food / non-meal vision must never become todayEaten
    if (/非餐點|不是餐點|可見：貓|可見：狗|可見：寵物/.test(raw)) continue;
    // Historical label prefix from generation pipeline — treat as history only
    if (/^\[歷史影像/.test(raw)) {
      // Do not promote labelled historical vision into todayEaten
      continue;
    }
    // Corrupted legacy rows often store meal notes without Vision structure
    if (!/可見：|信心：|餐別未確認|^(早餐|午餐|晚餐)/.test(raw) && /會議|吃飯|考慮/.test(raw)) {
      continue;
    }
    const label =
      extractFoodLabels(raw)[0] ??
      raw.replace(/看起來像|像是|像|為|是/g, "").trim().slice(0, 16);
    if (!label) continue;
    if (/貓|狗|寵物|風景|自拍/.test(label) && !extractFoodLabels(label).length) continue;
    push({
      logDate: generationLogDate,
      mealSlot: null,
      label,
      kind: "eaten",
      relativeLabel: null,
      source: "vision",
      planStillOpen: false,
    });
  }

  if (input.currentMessage?.trim()) {
    const msg = input.currentMessage.trim();
    const kind = classifyGo21UtteranceKind(msg);
    const labels = extractFoodLabels(msg);
    const slot = inferSlotFromText(msg);
    const eventDate = resolveGo21EventDateWithFuture(msg, generationLogDate);
    for (const label of labels) {
      push({
        logDate: eventDate,
        mealSlot: slot,
        label,
        kind,
        relativeLabel: resolveGo21RelativeDayLabel(msg),
        source: "current",
        planStillOpen: kind === "planned" && eventDate === generationLogDate,
      });
    }
  }

  // Drop open plans whose food/slot was already eaten today (supersession)
  const eatenLabels = new Set(todayEaten.map((e) => e.label));
  const openFiltered = openPlansForToday.filter((p) => {
    if (p.mealSlot && eatenSlotsToday.has(p.mealSlot)) return false;
    // If plan was 漢堡 and we never ate it, keep; if same label eaten, drop
    if (eatenLabels.has(p.label)) return false;
    return true;
  });

  // Historical should not include today's eaten/open
  const historicalFiltered = historical.filter(
    (h) =>
      !(h.logDate === generationLogDate && h.kind === "eaten") &&
      !openFiltered.some((o) => o.label === h.label && o.logDate === h.logDate),
  );

  return {
    generationLogDate,
    todayEaten,
    openPlansForToday: openFiltered,
    historical: historicalFiltered.slice(0, 12),
    promptBlock: {
      generationLogDate,
      todayEaten: todayEaten.map((e) => ({ slot: e.mealSlot, label: e.label })),
      openPlansForToday: openFiltered.map((e) => ({
        slot: e.mealSlot,
        label: e.label,
      })),
      doNotTreatAsCurrent: historicalFiltered.slice(0, 8).map((h) => ({
        logDate: h.logDate,
        label: h.label,
        kind: h.kind,
      })),
      guidance:
        "Use todayEaten as what the customer already ate today. openPlansForToday are still-open future plans for today only. doNotTreatAsCurrent are older or superseded mentions — never call them tonight/today unless they appear in todayEaten or openPlansForToday. Do not invent temporal certainty when ambiguous.",
    },
  };
}

function readTemporalFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): {
  utteranceKind?: Go21UtteranceKind;
  eventDate?: string;
  mealSlot?: string | null;
  relativeLabel?: string | null;
} | null {
  if (!metadata || typeof metadata !== "object") return null;
  const temporal = metadata.temporal;
  if (!temporal || typeof temporal !== "object") return null;
  const t = temporal as Record<string, unknown>;
  const kind = t.utteranceKind;
  return {
    utteranceKind:
      kind === "eaten" || kind === "planned" || kind === "other" ? kind : undefined,
    eventDate: typeof t.eventDate === "string" ? t.eventDate : undefined,
    mealSlot: typeof t.mealSlot === "string" ? t.mealSlot : t.mealSlot === null ? null : undefined,
    relativeLabel: typeof t.relativeLabel === "string" ? t.relativeLabel : null,
  };
}

function inferSlotFromText(text: string): string | null {
  if (/早餐|早饭|早上吃/.test(text)) return "breakfast";
  if (/午餐|中餐|中午|午饭/.test(text)) return "lunch";
  if (/晚餐|晚饭|晚上吃|宵夜/.test(text)) return "dinner";
  if (/點心|零食|下午茶/.test(text)) return "snacks";
  return null;
}

function extractFoodLabels(text: string): string[] {
  const cleaned = text
    .replace(/\[(?:影像觀察|顧客更正|近期影像觀察)[^\]]*\]/g, "")
    .replace(/📷\s*照片/g, "")
    .trim();
  if (!cleaned || cleaned === "（訊息）") return [];
  const out: string[] = [];
  const patterns = [
    /(?:晚餐|午餐|早餐|宵夜|剛剛)?(?:吃了|吃|喝了|喝|想吃)?\s*([^\n。！？?]{1,20}(?:燒餅油條|燒餅|油條|飯|麵|漢堡|奶茶|紅茶|咖啡|雞胸|泡麵|蛋糕|滷肉|沙拉|便當|壽司|炸雞|炸麵|雞排|披薩|薯條|蛋|魚|肉|湯|水餃|鍋貼))/u,
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (m?.[1]) out.push(m[1].trim());
  }
  if (out.length === 0) {
    const bare = cleaned
      .replace(/^(?:晚餐|午餐|早餐|宵夜|剛剛)(?:吃了|吃)?/, "")
      .replace(/^(?:等一下|待會|打算|想)吃/, "")
      .trim();
    if (
      bare.length >= 2 &&
      bare.length <= 16 &&
      /飯|麵|漢堡|茶|雞|肉|沙拉|便當|壽司|炸|蛋|魚|排|燒餅|油條/.test(bare) &&
      !/[？?]/.test(bare)
    ) {
      out.push(bare);
    }
  }
  return out;
}
