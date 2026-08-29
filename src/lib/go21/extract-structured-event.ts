import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import type { Go21ExtractedEvent } from "@/types/go21";

const MEAL_PATTERNS: Array<{
  slot: Go21ExtractedEvent["mealSlot"];
  patterns: RegExp[];
}> = [
  { slot: "breakfast", patterns: [/早餐/, /早饭/, /早上吃/, /起床.*吃/] },
  { slot: "lunch", patterns: [/午餐/, /中餐/, /中午/, /午饭/] },
  { slot: "dinner", patterns: [/晚餐/, /晚饭/, /晚上吃/, /宵夜餐/] },
  { slot: "snacks", patterns: [/點心/, /零食/, /嘴饞/, /下午茶/, /加餐/] },
  { slot: "drinks", patterns: [/喝了/, /飲料/, /珍奶/, /手搖/] },
];

/**
 * Deterministic NL extraction for Baki Go 21 chat.
 * Distinguishes message timestamp from event date/time.
 * Does NOT invent meal_type from clock alone when only a photo is present.
 */
export function extractGo21StructuredEvent(input: {
  message: string | null | undefined;
  /** Asia/Taipei YYYY-MM-DD of message send. */
  messageLogDate: string;
  /** Optional HH:mm of message (Taipei). */
  messageTimeHm?: string | null;
  hasPhoto?: boolean;
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
    exerciseNote: null,
    hungerMentioned: /很餓|還是會餓|容易餓|好餓|飢餓|不夠飽/.test(text),
    confidence: "low",
    unresolvedQuestions: [],
  };

  if (!text && input.hasPhoto) {
    // Photo alone — preserve as evidence, do NOT invent dinner from nighttime.
    base.eventDate = input.messageLogDate;
    base.unresolvedQuestions.push("meal_slot_unknown");
    base.confidence = "low";
    return base;
  }

  if (!text) return base;

  // Event date relative to message date
  let eventDate = input.messageLogDate;
  if (/前天/.test(text)) {
    eventDate = addCalendarDays(input.messageLogDate, -2);
  } else if (/昨天|昨晚|昨夜/.test(text)) {
    eventDate = addCalendarDays(input.messageLogDate, -1);
  } else if (/今天|剛才|剛剛|刚/.test(text)) {
    eventDate = input.messageLogDate;
  }
  base.eventDate = eventDate;

  // Explicit time: 下午三點 / 15:00 / 3點 (Arabic or Chinese numerals)
  const clockMatch = text.match(/\b([01]?\d|2[0-3])[:：]([0-5]\d)\b/);
  const spokenMatch = text.match(
    /(上午|早上|中午|下午|晚上|凌晨)?\s*([一二兩三四五六七八九十\d]{1,3})\s*[點时時](?:\s*([一二三四五六七八九十半\d]{1,3})\s*分?)?/,
  );
  if (clockMatch) {
    const hour = Number(clockMatch[1]);
    const minute = Number(clockMatch[2]);
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      base.eventTimeApprox = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  } else if (spokenMatch) {
    const period = spokenMatch[1];
    let hour = parseChineseOrArabicHour(spokenMatch[2]);
    const minuteRaw = spokenMatch[3] ?? "0";
    const minute = minuteRaw === "半" ? 30 : parseChineseOrArabicHour(minuteRaw) || 0;
    if (period === "下午" && hour < 12) hour += 12;
    if (period === "晚上" && hour < 12 && hour > 0) hour += 12;
    if (period === "中午" && hour < 11) hour = 12;
    if (period === "凌晨" && hour === 12) hour = 0;
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      base.eventTimeApprox = `${String(hour).padStart(2, "0")}:${String(
        Number.isFinite(minute) ? minute : 0,
      ).padStart(2, "0")}`;
    }
  }

  for (const rule of MEAL_PATTERNS) {
    if (rule.patterns.some((p) => p.test(text))) {
      base.mealSlot = rule.slot;
      break;
    }
  }

  // Afternoon food mention without explicit meal keyword → treat as snack (not dinner).
  if (
    !base.mealSlot &&
    /下午/.test(text) &&
    /吃了|吃過|吃個|吃了一/.test(text)
  ) {
    base.mealSlot = "snacks";
  }

  // Weight: 76.2 / 體重76 / 今天76.2公斤
  const weightMatch = text.match(
    /(?:體重|体重|秤|量[到了]?)?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg|KG|公斤)?/,
  );
  const bodyFatMatch = text.match(/(?:體脂|体脂)\s*(\d{1,2}(?:\.\d{1,2})?)\s*%?/);
  const muscleMatch = text.match(/(?:肌肉|骨骼肌)\s*(\d{1,2}(?:\.\d{1,2})?)/);
  const visceralMatch = text.match(/(?:內臟脂肪|内脏脂肪)\s*(\d{1,2}(?:\.\d{1,2})?)/);
  const bmrMatch = text.match(/(?:BMR|基礎代謝|基础代谢)\s*(\d{3,4})/i);

  if (bodyFatMatch) {
    base.bodyFatPercent = Number(bodyFatMatch[1]);
  }
  if (muscleMatch) {
    base.skeletalMuscleKg = Number(muscleMatch[1]);
  }
  if (visceralMatch) {
    base.visceralFatLevel = Number(visceralMatch[1]);
  }
  if (bmrMatch) {
    base.basalMetabolicRate = Number(bmrMatch[1]);
  }
  if (weightMatch) {
    const w = Number(weightMatch[1]);
    const explicitWeight = /體重|体重|秤|量|kg|公斤/i.test(text);
    const looksLikeBodyFatContext = /體脂|体脂|%/.test(weightMatch[0]);
    if (!looksLikeBodyFatContext && Number.isFinite(w) && w >= 35 && w <= 200) {
      if (explicitWeight || /\d+\.\d+/.test(weightMatch[1]) || (/今天|早上|剛/.test(text) && w >= 40 && w <= 150)) {
        base.weightKg = w;
      }
    }
  }

  // Water
  const waterMatch = text.match(/(\d{3,4})\s*ml|喝了?\s*(\d)\s*[杯壺]|水\s*(喝很少|很少|超少|不夠)/i);
  if (waterMatch) {
    if (waterMatch[1]) base.waterMl = Number(waterMatch[1]);
    else if (waterMatch[2]) base.waterMl = Number(waterMatch[2]) * 250;
    else if (waterMatch[3]) base.waterMl = 500; // qualitative low — store soft signal via note
  }

  if (/健身|運動|重訓|跑步|走路|瑜珈|有氧/.test(text)) {
    base.exerciseNote = text.slice(0, 200);
  }

  if (base.mealSlot || base.weightKg != null || base.waterMl != null || base.exerciseNote) {
    base.mealNote = text.slice(0, 400);
    base.confidence =
      base.mealSlot || base.weightKg != null ? "high" : base.waterMl != null ? "medium" : "low";
  } else if (input.hasPhoto && base.mealSlot) {
    base.confidence = "high";
  } else if (input.hasPhoto) {
    base.unresolvedQuestions.push("meal_slot_unknown");
    base.confidence = "low";
  }

  return base;
}

export function go21MessageLogDateNow(): string {
  return coachingTodayLogDate();
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

/** Parse hour/minute tokens like "3", "15", "三", "十二". */
function parseChineseOrArabicHour(raw: string | undefined): number {
  if (!raw) return Number.NaN;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === "十") return 10;
  if (raw.startsWith("十")) {
    const ones = CN_NUM[raw.slice(1)] ?? 0;
    return 10 + ones;
  }
  if (raw.endsWith("十") && raw.length === 2) {
    return (CN_NUM[raw[0]!] ?? 0) * 10;
  }
  if (raw.length === 2 && raw[1] === "十") {
    return (CN_NUM[raw[0]!] ?? 0) * 10;
  }
  // 十二
  if (raw.length === 2 && raw[0] === "十") {
    return 10 + (CN_NUM[raw[1]!] ?? 0);
  }
  if (raw in CN_NUM) return CN_NUM[raw]!;
  return Number.NaN;
}
