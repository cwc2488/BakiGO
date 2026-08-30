/**
 * Conservative meal nutrition band estimates for Go21.
 * Prefer miss / wide bands over fake precision. Photos are low confidence.
 */

export type Go21MealEstimateBand = {
  caloriesLow: number;
  caloriesHigh: number;
  proteinLow: number;
  proteinHigh: number;
  confidence: "low" | "medium" | "high";
  source: "label" | "explicit" | "heuristic" | "vision";
  label: string;
};

export type Go21DayNutritionEstimate = {
  caloriesLow: number | null;
  caloriesHigh: number | null;
  caloriesMid: number | null;
  proteinLow: number | null;
  proteinHigh: number | null;
  proteinMid: number | null;
  confidence: "none" | "low" | "medium" | "high";
  mealCount: number;
  incomplete: boolean;
  notes: string[];
};

const HEAVY_RE = /炸|漢堡|薯條|披薩|炸雞|鹹酥雞|雞排|奶茶|珍珍|珍奶|泡麵|蛋糕|甜甜圈|可樂|油條|燒餅/;
const PROTEIN_CLEAR_RE = /雞胸|雞腿|魚|鮭|蝦|蛋|豆腐|豆干|牛肉|豬肉|里肌|雞絲|肉絲|優格|乳清|蛋白/;
const LIGHT_RE = /沙拉|燙青菜|清湯|水煮|蒸|烤魚|雞胸沙拉|蔬菜/;
const SHAKE_RE = /奶昔|代餐|shake|蛋白飲|營養奶/i;
const STARCH_RE = /飯|麵|麵包|義大利麵|義麵|水餃|鍋貼|壽司|粽/;

/** Explicit kcal / protein from labels or customer-stated numbers. */
export function extractExplicitNutritionFromText(text: string): Partial<Go21MealEstimateBand> | null {
  const kcal = text.match(/(\d{2,4})\s*(?:kcal|大卡|卡)/i);
  const protein = text.match(/(?:蛋白質|蛋白)\s*(\d{1,3}(?:\.\d)?)\s*g/i) ||
    text.match(/(\d{1,3}(?:\.\d)?)\s*g\s*(?:蛋白質|蛋白)/i);
  if (!kcal && !protein) return null;
  const out: Partial<Go21MealEstimateBand> = {
    confidence: "high",
    source: "label",
    label: text.slice(0, 40),
  };
  if (kcal) {
    const n = Number(kcal[1]);
    if (Number.isFinite(n) && n >= 40 && n <= 2000) {
      out.caloriesLow = Math.round(n * 0.95);
      out.caloriesHigh = Math.round(n * 1.05);
    }
  }
  if (protein) {
    const n = Number(protein[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 120) {
      out.proteinLow = Math.round(n * 0.9);
      out.proteinHigh = Math.round(n * 1.1);
    }
  }
  return out.caloriesLow != null || out.proteinLow != null ? out : null;
}

/**
 * Heuristic band for one meal note / vision summary.
 * Wide ranges on purpose — never return a single "exact" number.
 */
export function estimateMealNutritionBand(input: {
  note: string | null | undefined;
  visionSummary?: string | null;
  signals?: string[];
  hasPhoto?: boolean;
}): Go21MealEstimateBand | null {
  const text = [input.note, input.visionSummary].filter(Boolean).join(" ").trim();
  if (!text && !input.hasPhoto) return null;

  const explicit = text ? extractExplicitNutritionFromText(text) : null;
  if (explicit?.caloriesLow != null && explicit.proteinLow != null) {
    return {
      caloriesLow: explicit.caloriesLow,
      caloriesHigh: explicit.caloriesHigh ?? explicit.caloriesLow,
      proteinLow: explicit.proteinLow,
      proteinHigh: explicit.proteinHigh ?? explicit.proteinLow,
      confidence: "high",
      source: "label",
      label: text.slice(0, 40) || "標示",
    };
  }

  const signals = input.signals ?? [];
  const heavy =
    HEAVY_RE.test(text) ||
    signals.some((s) => ["fried_food", "sugary_drink", "late_night"].includes(s));
  const light = LIGHT_RE.test(text) && !heavy;
  const proteinClear =
    PROTEIN_CLEAR_RE.test(text) ||
    signals.includes("visible_protein") ||
    /有看到蛋白質/.test(text);
  const lowProtein =
    signals.includes("low_protein") ||
    (/水果|沙拉|青菜/.test(text) && !proteinClear);
  const shake = SHAKE_RE.test(text);
  const starch = STARCH_RE.test(text);

  let caloriesLow = 250;
  let caloriesHigh = 550;
  let proteinLow = 8;
  let proteinHigh = 22;
  let confidence: "low" | "medium" | "high" = input.hasPhoto || /影像/.test(text) ? "low" : "medium";
  let source: Go21MealEstimateBand["source"] = input.hasPhoto ? "vision" : "heuristic";

  if (shake) {
    caloriesLow = 150;
    caloriesHigh = 280;
    proteinLow = 15;
    proteinHigh = 30;
    confidence = "medium";
  } else if (heavy) {
    caloriesLow = 550;
    caloriesHigh = 950;
    proteinLow = proteinClear ? 20 : 12;
    proteinHigh = proteinClear ? 40 : 28;
    confidence = "low";
  } else if (light) {
    caloriesLow = 180;
    caloriesHigh = 380;
    proteinLow = proteinClear ? 18 : 6;
    proteinHigh = proteinClear ? 35 : 16;
  } else if (starch && proteinClear) {
    caloriesLow = 400;
    caloriesHigh = 700;
    proteinLow = 22;
    proteinHigh = 40;
  } else if (starch) {
    caloriesLow = 350;
    caloriesHigh = 650;
    proteinLow = 8;
    proteinHigh = 20;
  } else if (proteinClear) {
    caloriesLow = 300;
    caloriesHigh = 550;
    proteinLow = 25;
    proteinHigh = 45;
  }

  if (lowProtein) {
    proteinLow = Math.min(proteinLow, 8);
    proteinHigh = Math.min(proteinHigh, 18);
  }

  if (explicit?.caloriesLow != null) {
    caloriesLow = explicit.caloriesLow;
    caloriesHigh = explicit.caloriesHigh ?? explicit.caloriesLow;
    confidence = "high";
    source = "explicit";
  }
  if (explicit?.proteinLow != null) {
    proteinLow = explicit.proteinLow;
    proteinHigh = explicit.proteinHigh ?? explicit.proteinLow;
    confidence = confidence === "high" ? "high" : "medium";
    source = source === "explicit" ? "explicit" : source;
  }

  // Photo-only with almost no text → very wide, low confidence
  if (!text.trim() && input.hasPhoto) {
    return {
      caloriesLow: 300,
      caloriesHigh: 800,
      proteinLow: 10,
      proteinHigh: 35,
      confidence: "low",
      source: "vision",
      label: "照片餐",
    };
  }

  return {
    caloriesLow,
    caloriesHigh,
    proteinLow,
    proteinHigh,
    confidence,
    source,
    label: text.slice(0, 40) || "這一餐",
  };
}

export function aggregateDayNutritionEstimates(
  meals: Go21MealEstimateBand[],
): Go21DayNutritionEstimate {
  if (meals.length === 0) {
    return {
      caloriesLow: null,
      caloriesHigh: null,
      caloriesMid: null,
      proteinLow: null,
      proteinHigh: null,
      proteinMid: null,
      confidence: "none",
      mealCount: 0,
      incomplete: true,
      notes: ["尚無足夠餐次可估計"],
    };
  }

  const calLow = meals.reduce((s, m) => s + m.caloriesLow, 0);
  const calHigh = meals.reduce((s, m) => s + m.caloriesHigh, 0);
  const proLow = meals.reduce((s, m) => s + m.proteinLow, 0);
  const proHigh = meals.reduce((s, m) => s + m.proteinHigh, 0);

  const confidences = meals.map((m) => m.confidence);
  let confidence: Go21DayNutritionEstimate["confidence"] = "low";
  if (confidences.every((c) => c === "high")) confidence = "high";
  else if (confidences.some((c) => c === "medium" || c === "high") && !confidences.every((c) => c === "low")) {
    confidence = "medium";
  }

  const incomplete = meals.length < 2;
  const notes: string[] = [];
  if (incomplete) notes.push("餐次還不完整，估計僅供參考");
  if (meals.some((m) => m.source === "vision" || m.confidence === "low")) {
    notes.push("含影像估計，不應當成精確數字");
  }

  return {
    caloriesLow: calLow,
    caloriesHigh: calHigh,
    caloriesMid: Math.round((calLow + calHigh) / 2),
    proteinLow: proLow,
    proteinHigh: proHigh,
    proteinMid: Math.round((proLow + proHigh) / 2),
    confidence: incomplete ? "low" : confidence,
    mealCount: meals.length,
    incomplete,
    notes,
  };
}
