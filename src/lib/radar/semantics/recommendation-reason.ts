import type { CandidateUnderstanding } from "./candidate-understanding";

const CATEGORY_ZH: Record<CandidateUnderstanding["need_category"], string> = {
  fat_loss: "減脂",
  muscle_gain: "增肌／體能",
  health: "健康",
  income: "收入",
  business: "事業",
  other: "改變",
  none: "需求",
};

const HAN = /[\u4E00-\u9FFF]/;

export function looksTraditionalChinese(text: string): boolean {
  const han = (text.match(/[\u4E00-\u9FFF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return han >= 8 && han > latin;
}

export function isGenericTopicReason(text: string): boolean {
  const lowered = text.toLowerCase();
  return (
    /mentions (fitness|health|nutrition|exercise|weight)/i.test(lowered) ||
    /candidate mentions/i.test(lowered) ||
    text.includes("提到健身與健康") ||
    text.includes("提到運動與營養")
  );
}

export function isThirdPartyReason(text: string): boolean {
  return (
    /學生|學員|客戶|客人|姐姐|妹妹|哥哥|弟弟|歌手|明星|網紅/.test(text) &&
    /(瘦了|減了|成功|達標)/.test(text) &&
    !/我自己|本人|我最近/.test(text)
  );
}

export function buildRecommendationReasonZh(understanding: CandidateUnderstanding): string {
  if (
    understanding.recommendation_reason_zh &&
    looksTraditionalChinese(understanding.recommendation_reason_zh) &&
    !isGenericTopicReason(understanding.recommendation_reason_zh) &&
    !isThirdPartyReason(understanding.recommendation_reason_zh)
  ) {
    return understanding.recommendation_reason_zh.trim();
  }

  const category = CATEGORY_ZH[understanding.need_category];
  const gap = understanding.unresolved_gap?.trim();
  const attempts = understanding.attempts.filter((item) => item.trim()).slice(0, 2);
  const pains = understanding.pain_points.filter((item) => item.trim()).slice(0, 2);

  if (understanding.need_state === "in_progress_with_gap") {
    const tried = attempts.length > 0 ? `已持續${attempts.join("、")}，` : "已開始行動，";
    const remain = gap || "結果仍停滯";
    return `近期本人持續${category}相關努力，${tried}但${remain}，顯示需求尚未解決，現在適合開始對話。`;
  }

  if (understanding.need_state === "unresolved") {
    const pain = pains.length > 0 ? pains.join("、") : `本人有明確的${category}困擾`;
    const remain = gap ? `，且${gap}` : "";
    return `近期多次表達${pain}${remain}，屬於本人尚未解決的需求，現在適合開始對話。`;
  }

  return "";
}

export function pickPartnerWhyLines(input: {
  recommendation_reason_zh?: string | null;
  advisory_reasons?: string[];
  fallback_reasons?: string[];
  need_owner?: CandidateUnderstanding["need_owner"];
}): string[] {
  if (input.need_owner === "third_party" || input.need_owner === "general") {
    return [];
  }

  const preferred = input.recommendation_reason_zh?.trim();
  if (preferred && looksTraditionalChinese(preferred) && !isGenericTopicReason(preferred)) {
    return [preferred];
  }

  const advisory = (input.advisory_reasons ?? []).filter(
    (line) => looksTraditionalChinese(line) && !isGenericTopicReason(line) && !isThirdPartyReason(line),
  );
  if (advisory.length > 0) return advisory.slice(0, 2);

  const fallback = (input.fallback_reasons ?? []).filter((line) => {
    if (!line.trim()) return false;
    if (isGenericTopicReason(line) || isThirdPartyReason(line)) return false;
    if (input.need_owner && input.need_owner !== "self" && !HAN.test(line)) return false;
    return looksTraditionalChinese(line);
  });
  return fallback.slice(0, 2);
}
