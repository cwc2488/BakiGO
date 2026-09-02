import type { ClassifiedFreeText, FreeTextClass } from "@/lib/coaching/semantics/types";

const QUESTION_RE = /[?？]|嗎[。.\s]*$|為什麼|怎麼辦|可不可以|能不能|請問|如何/;
const FEELING_RE =
  /很餓|還是會餓|容易餓|肚子餓|好餓|飢餓|不夠飽|很難忍|好累|很累|疲倦|沒精神|乏力|難過|心情不好|好開心|很開心|焦慮|壓力/;
const CONCERN_RE = /擔心|害怕|受不了|很難忍|好難|撐不住|不舒服|不對勁/;
const INTENT_RE = /打算|準備|待會|等一下|明天[要會]|計劃|計畫|想改/;
const PREFERENCE_RE = /喜歡|不喜歡|想吃|不想吃|比較愛|比較想/;
const WATER_AMOUNT_RE = /(\d{3,5})\s*(?:cc|ml|c\.c\.|毫升|的水)/i;
const FACT_RE =
  /喝了|吃了|吃的是|早餐|午餐|晚餐|水喝|目前水|再喝|睡了|運動|走了|跑了|排便/;

function confidenceFor(cls: FreeTextClass, strong: boolean): ClassifiedFreeText["confidence"] {
  if (cls === "AMBIGUOUS") return "low";
  return strong ? "high" : "medium";
}

function displayLabelFor(cls: FreeTextClass): string | null {
  switch (cls) {
    case "QUESTION":
      return "顧客提問";
    case "FEELING":
      return "可能的感受";
    case "CONCERN":
      return "可能的困擾";
    case "INTENT_OR_PLAN":
      return "意圖／計畫";
    case "PREFERENCE":
      return "偏好";
    case "OBSERVED_FACT":
      return "顧客提到的事實";
    default:
      return null;
  }
}

/**
 * Classify a customer free-text note. Never coerce facts into feelings.
 * Does not mutate structured water / meals.
 */
export function classifyCustomerFreeText(raw: string | null | undefined): ClassifiedFreeText | null {
  const text = raw?.trim() ?? "";
  if (!text) return null;

  const waterMatch = text.match(WATER_AMOUNT_RE);
  const mentionedWaterMl = waterMatch ? Number(waterMatch[1]) : null;

  let cls: FreeTextClass = "AMBIGUOUS";
  let strong = false;

  if (QUESTION_RE.test(text)) {
    cls = "QUESTION";
    strong = /[?？]|為什麼|怎麼辦/.test(text);
  } else if (FEELING_RE.test(text) && CONCERN_RE.test(text)) {
    cls = /很難忍|擔心|害怕|撐不住/.test(text) ? "CONCERN" : "FEELING";
    strong = true;
  } else if (FEELING_RE.test(text)) {
    cls = "FEELING";
    strong = /很餓|還是會餓|很難忍|好累/.test(text);
  } else if (CONCERN_RE.test(text)) {
    cls = "CONCERN";
    strong = true;
  } else if (INTENT_RE.test(text)) {
    cls = "INTENT_OR_PLAN";
    strong = true;
  } else if (PREFERENCE_RE.test(text)) {
    cls = "PREFERENCE";
    strong = true;
  } else if (mentionedWaterMl != null || FACT_RE.test(text)) {
    cls = "OBSERVED_FACT";
    strong = mentionedWaterMl != null || /喝了|吃了|目前水/.test(text);
  }

  return {
    text,
    class: cls,
    confidence: confidenceFor(cls, strong),
    displayLabel: cls === "FEELING" && confidenceFor(cls, strong) === "low" ? null : displayLabelFor(cls),
    mentionedWaterMl: Number.isFinite(mentionedWaterMl) ? mentionedWaterMl : null,
  };
}

export function isFeelingClass(cls: FreeTextClass | null | undefined): boolean {
  return cls === "FEELING" || cls === "CONCERN";
}
