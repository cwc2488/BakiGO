import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import type { Go21CorrectionOp, Go21ExtractedEvent } from "@/types/go21";

const MEAL_PATTERNS: Array<{
  slot: Go21ExtractedEvent["mealSlot"];
  patterns: RegExp[];
}> = [
  { slot: "breakfast", patterns: [/早餐/, /早饭/, /早上吃/, /起床.*吃/] },
  { slot: "lunch", patterns: [/午餐/, /中餐/, /中午/, /午饭/] },
  { slot: "dinner", patterns: [/晚餐/, /晚饭/, /晚上吃/, /宵夜餐/] },
  { slot: "snacks", patterns: [/點心/, /零食/, /嘴饞/, /下午茶/, /加餐/] },
  { slot: "drinks", patterns: [/珍奶/, /手搖/, /飲料/] },
];

/**
 * Deterministic NL extraction for Baki Go 21 chat.
 * Precision over recall for numeric body fields — never fabricate measurements.
 */
export function extractGo21StructuredEvent(input: {
  message: string | null | undefined;
  /** Asia/Taipei YYYY-MM-DD of message send. */
  messageLogDate: string;
  /** Optional HH:mm of message (Taipei). */
  messageTimeHm?: string | null;
  hasPhoto?: boolean;
  /** Prior extraction for correction turns (same conversation). */
  previous?: Partial<Go21ExtractedEvent> | null;
}): Go21ExtractedEvent {
  const text = (input.message ?? "").trim();
  const base: Go21ExtractedEvent = {
    eventDate: null,
    eventTimeApprox: null,
    mealSlot: null,
    mealNote: null,
    weightKg: null,
    bodyFatPercent: null,
    skeletalMuscleKg: null,
    visceralFatLevel: null,
    basalMetabolicRate: null,
    waterMl: null,
    hydrationQuality: null,
    hydrationNote: null,
    exerciseNote: null,
    hungerMentioned: /很餓|還是會餓|容易餓|好餓|飢餓|不夠飽/.test(text),
    confidence: "low",
    unresolvedQuestions: [],
    corrections: [],
  };

  if (!text && input.hasPhoto) {
    base.eventDate = input.messageLogDate;
    base.unresolvedQuestions.push("meal_slot_unknown");
    base.confidence = "low";
    return base;
  }

  if (!text) return base;

  // --- Corrections first (may rewrite previous event) ---
  const corrections = detectCorrections(text, input.messageLogDate, input.previous ?? null);
  if (corrections.ops.length > 0) {
    base.corrections = corrections.ops;
    base.eventDate = corrections.eventDate;
    base.mealSlot = corrections.mealSlot;
    base.weightKg = corrections.weightKg;
    base.confidence = "high";
    base.mealNote = text.slice(0, 400);
    // Still allow other fields from the same message below when present.
  }

  // Event date relative to message date / explicit calendar date
  if (!base.eventDate) {
    base.eventDate = resolveEventDate(text, input.messageLogDate);
  } else if (!corrections.ops.some((op) => op.kind === "event_date")) {
    // Non-correction messages may still refine date
    const resolved = resolveEventDate(text, input.messageLogDate);
    if (resolved !== input.messageLogDate || /今天|昨天|前天|\d{1,2}\/\d{1,2}/.test(text)) {
      base.eventDate = resolved;
    }
  }

  base.eventTimeApprox = resolveEventTime(text);

  if (!base.mealSlot) {
    for (const rule of MEAL_PATTERNS) {
      if (rule.patterns.some((p) => p.test(text))) {
        base.mealSlot = rule.slot;
        break;
      }
    }
  }

  // Afternoon food mention without explicit meal keyword → snack (not dinner-from-clock).
  if (
    !base.mealSlot &&
    /下午/.test(text) &&
    /吃了|吃過|吃個|吃了一/.test(text) &&
    !/晚餐|午餐|早餐/.test(text)
  ) {
    base.mealSlot = "snacks";
  }

  // Body metrics — precision over recall
  if (base.weightKg == null) {
    base.weightKg = extractWeightKg(text);
  }
  base.bodyFatPercent = extractBodyFatPercent(text);
  base.skeletalMuscleKg = extractMuscleKg(text);
  base.visceralFatLevel = extractVisceral(text);
  base.basalMetabolicRate = extractBmr(text);

  // Water: numeric only when quantity given; qualitative never invents ml
  const water = extractHydration(text);
  base.waterMl = water.waterMl;
  base.hydrationQuality = water.hydrationQuality;
  base.hydrationNote = water.hydrationNote;

  if (/健身|運動|重訓|跑步|走路|瑜珈|有氧|走了?\s*\d+\s*步/.test(text)) {
    base.exerciseNote = text.slice(0, 200);
  }

  if (
    base.mealSlot ||
    base.weightKg != null ||
    base.waterMl != null ||
    base.hydrationQuality ||
    base.exerciseNote ||
    base.corrections.length > 0
  ) {
    base.mealNote = base.mealNote ?? text.slice(0, 400);
    base.confidence =
      base.mealSlot || base.weightKg != null || base.corrections.length > 0
        ? "high"
        : base.waterMl != null
          ? "medium"
          : "low";
  } else if (input.hasPhoto) {
    base.unresolvedQuestions.push("meal_slot_unknown");
    base.confidence = "low";
  }

  return base;
}

export function go21MessageLogDateNow(): string {
  return coachingTodayLogDate();
}

export function resolveEventDate(text: string, messageLogDate: string): string {
  // Explicit M/D or M月D日 relative to message year (Taiwan)
  const slash = text.match(/(?<!\d)(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = Number(messageLogDate.slice(0, 4));
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  if (/前天/.test(text)) return addCalendarDays(messageLogDate, -2);
  if (/昨天|昨晚|昨夜/.test(text)) return addCalendarDays(messageLogDate, -1);
  if (/今天|剛才|剛剛|刚/.test(text)) return messageLogDate;
  return messageLogDate;
}

function resolveEventTime(text: string): string | null {
  const clockMatch = text.match(/\b([01]?\d|2[0-3])[:：]([0-5]\d)\b/);
  if (clockMatch) {
    const hour = Number(clockMatch[1]);
    const minute = Number(clockMatch[2]);
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }
  const spokenMatch = text.match(
    /(上午|早上|中午|下午|晚上|凌晨)?\s*([一二兩三四五六七八九十\d]{1,3})\s*[點时時](?:\s*([一二三四五六七八九十半\d]{1,3})\s*分?)?/,
  );
  if (spokenMatch) {
    const period = spokenMatch[1];
    let hour = parseChineseOrArabicHour(spokenMatch[2]);
    const minuteRaw = spokenMatch[3] ?? "0";
    const minute = minuteRaw === "半" ? 30 : parseChineseOrArabicHour(minuteRaw) || 0;
    if (period === "下午" && hour < 12) hour += 12;
    if (period === "晚上" && hour < 12 && hour > 0) hour += 12;
    if (period === "中午" && hour < 11) hour = 12;
    if (period === "凌晨" && hour === 12) hour = 0;
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:${String(Number.isFinite(minute) ? minute : 0).padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * Weight only with semantic evidence. Rejects minutes, ml, steps, dates, body-fat, BMR.
 */
export function extractWeightKg(text: string): number | null {
  // Strip known non-weight numeric contexts before matching
  const scrubbed = text
    .replace(/\d+\s*(?:分鐘|分鍾|min)/gi, " ")
    .replace(/\d+\s*(?:ml|ML|毫升)/g, " ")
    .replace(/\d+\s*步/g, " ")
    .replace(/(?:體脂|体脂)\s*\d{1,2}(?:\.\d{1,2})?\s*%?/g, " ")
    .replace(/(?:BMR|基礎代謝|基础代谢)\s*\d{3,4}/gi, " ")
    .replace(/(?:內臟脂肪|内脏脂肪)\s*\d{1,2}(?:\.\d{1,2})?/g, " ")
    .replace(/(?:肌肉|骨骼肌)\s*\d{1,2}(?:\.\d{1,2})?/g, " ")
    .replace(/\d{1,2}\s*[\/月]\s*\d{1,2}\s*日?/g, " ")
    .replace(/\b([01]?\d|2[0-3])[:：]([0-5]\d)\b/g, " ")
    .replace(/下午\s*[一二兩三四五六七八九十\d]{1,3}\s*點/g, " ");

  const patterns: RegExp[] = [
    /體重\s*(\d{2,3}(?:\.\d{1,2})?)/,
    /体重\s*(\d{2,3}(?:\.\d{1,2})?)/,
    /(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg|KG|公斤)/,
    /(?:量[到了]?|秤[到了]?)\s*(\d{2,3}(?:\.\d{1,2})?)/,
    // "今天76.2" / "今天 76.2" — require decimal to avoid "今天60分鐘" collisions after scrub
    /今天\s*(\d{2,3}\.\d{1,2})(?!\s*(?:分鐘|ml|步|點))/,
  ];

  for (const pattern of patterns) {
    const match = scrubbed.match(pattern);
    if (!match) continue;
    const w = Number(match[1]);
    if (!Number.isFinite(w) || w < 35 || w > 200) continue;
    return w;
  }
  return null;
}

function extractBodyFatPercent(text: string): number | null {
  const match = text.match(/(?:體脂|体脂)\s*(\d{1,2}(?:\.\d{1,2})?)\s*%?/);
  if (!match) return null;
  const v = Number(match[1]);
  return Number.isFinite(v) && v >= 5 && v <= 60 ? v : null;
}

function extractMuscleKg(text: string): number | null {
  const match = text.match(/(?:骨骼肌|肌肉量?)\s*(\d{1,2}(?:\.\d{1,2})?)/);
  if (!match) return null;
  const v = Number(match[1]);
  return Number.isFinite(v) && v >= 10 && v <= 80 ? v : null;
}

function extractVisceral(text: string): number | null {
  const match = text.match(/(?:內臟脂肪|内脏脂肪)\s*(\d{1,2}(?:\.\d{1,2})?)/);
  if (!match) return null;
  const v = Number(match[1]);
  return Number.isFinite(v) && v >= 1 && v <= 30 ? v : null;
}

function extractBmr(text: string): number | null {
  const match = text.match(/(?:BMR|基礎代謝|基础代谢)\s*(\d{3,4})/i);
  if (!match) return null;
  const v = Number(match[1]);
  return Number.isFinite(v) && v >= 800 && v <= 3500 ? v : null;
}

function extractHydration(text: string): {
  waterMl: number | null;
  hydrationQuality: Go21ExtractedEvent["hydrationQuality"];
  hydrationNote: string | null;
} {
  const mlMatch = text.match(/(\d{3,4})\s*(?:ml|ML|毫升)/);
  if (mlMatch) {
    const ml = Number(mlMatch[1]);
    if (Number.isFinite(ml) && ml >= 50 && ml <= 8000) {
      return { waterMl: ml, hydrationQuality: null, hydrationNote: null };
    }
  }
  const cups = text.match(/喝了?\s*(\d{1,2})\s*[杯壺]/);
  if (cups) {
    const n = Number(cups[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 20) {
      return { waterMl: n * 250, hydrationQuality: null, hydrationNote: `${n}杯` };
    }
  }
  if (/水\s*(喝很少|很少|超少|不夠|没怎么喝|沒怎麼喝)/.test(text) || /今天水喝超少/.test(text)) {
    return {
      waterMl: null,
      hydrationQuality: "low",
      hydrationNote: "水喝很少（質性描述，未估 ml）",
    };
  }
  if (/水\s*(喝很多|超多|夠多)/.test(text)) {
    return {
      waterMl: null,
      hydrationQuality: "high",
      hydrationNote: "水喝很多（質性描述，未估 ml）",
    };
  }
  return { waterMl: null, hydrationQuality: null, hydrationNote: null };
}

function detectCorrections(
  text: string,
  messageLogDate: string,
  previous: Partial<Go21ExtractedEvent> | null,
): {
  ops: Go21CorrectionOp[];
  eventDate: string | null;
  mealSlot: Go21ExtractedEvent["mealSlot"];
  weightKg: number | null;
} {
  const ops: Go21CorrectionOp[] = [];
  let eventDate: string | null = null;
  let mealSlot: Go21ExtractedEvent["mealSlot"] = null;
  let weightKg: number | null = null;

  const isCorrection = /不是|搞錯|更正|說錯|打錯|其實是|應該是/.test(text);
  if (!isCorrection) {
    return { ops, eventDate, mealSlot, weightKg };
  }

  // Date correction: 不是今天，是昨天
  if (/不是\s*今天|不是今天/.test(text) && /昨天/.test(text)) {
    const to = addCalendarDays(messageLogDate, -1);
    ops.push({
      kind: "event_date",
      from: previous?.eventDate ?? messageLogDate,
      to,
    });
    eventDate = to;
  } else if (/不是\s*昨天|不是昨天/.test(text) && /今天/.test(text)) {
    ops.push({
      kind: "event_date",
      from: previous?.eventDate ?? addCalendarDays(messageLogDate, -1),
      to: messageLogDate,
    });
    eventDate = messageLogDate;
  } else if (/是昨天/.test(text) && /不是/.test(text)) {
    const to = addCalendarDays(messageLogDate, -1);
    ops.push({ kind: "event_date", from: previous?.eventDate ?? messageLogDate, to });
    eventDate = to;
  }

  // Meal slot correction
  const slotPairs: Array<[RegExp, Go21ExtractedEvent["mealSlot"]]> = [
    [/晚餐/, "dinner"],
    [/午餐|中餐/, "lunch"],
    [/早餐/, "breakfast"],
    [/點心|零食/, "snacks"],
  ];
  if (/不是\s*(午餐|中餐|早餐|晚餐|點心)/.test(text) || /(?<!不)是\s*(午餐|中餐|早餐|晚餐|點心)/.test(text)) {
    const deny = text.match(/不是\s*(午餐|中餐|早餐|晚餐|點心)/);
    const affirm = text.match(/(?<!不)是\s*(午餐|中餐|早餐|晚餐|點心)/) || text.match(/改成\s*(午餐|中餐|早餐|晚餐|點心)/);
    let toSlot: Go21ExtractedEvent["mealSlot"] = null;
    if (affirm) {
      for (const [re, slot] of slotPairs) {
        if (re.test(affirm[1]!)) {
          toSlot = slot;
          break;
        }
      }
    }
    // Prefer last affirmed meal after a correcting 是
    const afterParts = text.split(/(?<!不)是/);
    if (afterParts.length > 1) {
      const after = afterParts[afterParts.length - 1] ?? "";
      for (const [re, slot] of slotPairs) {
        if (re.test(after) && (!deny || !re.test(deny[1]!))) {
          toSlot = slot;
        }
      }
    }
    if (toSlot) {
      ops.push({
        kind: "meal_slot",
        from: previous?.mealSlot ?? (deny ? deny[1] : null),
        to: toSlot,
      });
      mealSlot = toSlot;
    }
  }

  // Weight correction: 不是76是75.5 / 體重打錯成…改 75
  const weightCorr = text.match(
    /(?:不是|打錯|更正).*?(\d{2,3}(?:\.\d{1,2})?).*?(?:是|改|成)\s*(\d{2,3}(?:\.\d{1,2})?)/,
  );
  if (weightCorr) {
    const to = Number(weightCorr[2]);
    if (Number.isFinite(to) && to >= 35 && to <= 200) {
      ops.push({ kind: "weight_kg", from: previous?.weightKg ?? Number(weightCorr[1]), to });
      weightKg = to;
    }
  }

  return { ops, eventDate, mealSlot, weightKg };
}

const CN_NUM: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function parseChineseOrArabicHour(raw: string | undefined): number {
  if (!raw) return Number.NaN;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === "十") return 10;
  if (raw.startsWith("十")) return 10 + (CN_NUM[raw.slice(1)] ?? 0);
  if (raw.endsWith("十") && raw.length === 2) return (CN_NUM[raw[0]!] ?? 0) * 10;
  if (raw in CN_NUM) return CN_NUM[raw]!;
  return Number.NaN;
}
