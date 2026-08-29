/**
 * Go21 conversation helpers: disengagement, display content,
 * Brain V3 prompt signals, chat near-bottom detection re-exports.
 */

export type Go21DisengagementAssessment = {
  detected: boolean;
  wantsToStop: boolean;
  lowConfidence: boolean;
  /** Brief natural reply — never a motivational essay. */
  briefReply: string | null;
};

const STOP_PATTERNS =
  /想結束|結束這個陪跑|不想繼續|退出陪跑|不要陪跑了|停止陪跑|結束陪跑|我要退出/u;

const LOW_CONFIDENCE_PATTERNS =
  /很沒信心|沒信心|撐不住|想放棄|好挫折|做不到|太難了|灰心/u;

/**
 * Detect disengagement / stop intent for a brief human coaching reply.
 * Safety/medical language is handled elsewhere and takes precedence.
 */
export function assessGo21Disengagement(message: string): Go21DisengagementAssessment {
  const text = message.trim();
  if (!text) {
    return { detected: false, wantsToStop: false, lowConfidence: false, briefReply: null };
  }

  const wantsToStop = STOP_PATTERNS.test(text);
  const lowConfidence = LOW_CONFIDENCE_PATTERNS.test(text);
  if (!wantsToStop && !lowConfidence) {
    return { detected: false, wantsToStop: false, lowConfidence: false, briefReply: null };
  }

  if (wantsToStop && lowConfidence) {
    return {
      detected: true,
      wantsToStop: true,
      lowConfidence: true,
      briefReply:
        "聽起來你今天真的有點撐不住了。是這個陪跑方式不適合你，還是最近整體壓力比較大？",
    };
  }
  if (wantsToStop) {
    return {
      detected: true,
      wantsToStop: true,
      lowConfidence: false,
      briefReply:
        "好，我聽到了。你是想先暫停這幾天，還是確定要結束這次 21 天陪跑？跟我說一聲就好，我不會硬留你。",
    };
  }
  return {
    detected: true,
    wantsToStop: false,
    lowConfidence: true,
    briefReply: "聽起來今天信心有點低。是哪個地方最讓你卡住？",
  };
}

/** Customer-facing turn text — never include vision system blobs. */
export function buildGo21CustomerDisplayContent(input: {
  message: string;
  hasPhoto: boolean;
}): string {
  const text = input.message.trim();
  if (text) return text.slice(0, 2000);
  if (input.hasPhoto) return "📷 照片";
  return "（訊息）";
}

/** Enrich turn content for AI memory only (UI still uses display content). */
export function enrichTurnContentForAi(input: {
  displayContent: string;
  visionEvidenceSummary?: string | null;
  customerCorrection?: string | null;
}): string {
  const parts = [input.displayContent.trim()];
  if (input.customerCorrection?.trim()) {
    parts.push(`[顧客更正] ${input.customerCorrection.trim()}`);
  }
  if (input.visionEvidenceSummary?.trim()) {
    parts.push(`[近期影像觀察｜非已確認事實] ${input.visionEvidenceSummary.trim()}`);
  }
  return parts.join("\n").slice(0, 4000);
}

export function extractVisionFoodsHint(evidenceSummary: string | null | undefined): string | null {
  if (!evidenceSummary?.trim()) return null;
  const m = evidenceSummary.match(
    /(?:像|為|是)?\s*([\u4e00-\u9fffA-Za-z0-9]{1,12}(?:茶|飯|麵|湯|蛋|肉|菜|果|奶|水|咖啡)?)/,
  );
  return m?.[1]?.trim() ?? evidenceSummary.trim().slice(0, 40);
}

/** Detect photo/food correction phrases for conversational priority. */
export function detectPhotoFoodCorrection(message: string): string | null {
  const text = message.trim();
  const patterns = [
    /那不是(.{1,20})[，,]?\s*是(.{1,30})/,
    /不是(.{1,20})[，,]?\s*(?:是|其實是)(.{1,30})/,
    /其實是(.{1,30})/,
    /那是(.{1,30})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const corrected = (m[2] ?? m[1] ?? "").replace(/[。！？\s]+$/u, "").trim();
    if (corrected.length >= 2 && corrected.length <= 40) return corrected;
  }
  return null;
}

/** Brain V3 principles — economy without a hard character quota. */
export const GO21_BRAIN_V3_PRINCIPLES = [
  "先理解",
  "記得，但別背誦",
  "自然回應",
  "有用才介入",
] as const;

export function go21SystemPromptIncludesShortPolicy(systemPrompt: string): boolean {
  // V3: conversational economy via principles — not a 30–80 character script.
  return (
    /有用才介入|自然回應/.test(systemPrompt) &&
    !/30–80/.test(systemPrompt) &&
    !/肯定\s*→\s*分析\s*→\s*建議/.test(systemPrompt)
  );
}

export function go21SystemPromptAllowsNoQuestion(systemPrompt: string): boolean {
  return /沒有固定順序|不必立刻|沒有.*必問|幾乎什麼都不說/.test(systemPrompt);
}

export function go21SystemPromptHandlesDisengagement(systemPrompt: string): boolean {
  return /停跑|沒信心|不要硬留|不要激勵長文/.test(systemPrompt);
}

export function go21SystemPromptAllowsFoodLogRestraint(systemPrompt: string): boolean {
  return /報一餐|有用才介入|每餐碎念/.test(systemPrompt);
}

export function go21SystemPromptAllowsOffTopicHuman(systemPrompt: string): boolean {
  return /離題人情|當人聊/.test(systemPrompt);
}

export function go21SystemPromptAllowsMetaFeedback(systemPrompt: string): boolean {
  return /像機器人/.test(systemPrompt) && /不要辯護/.test(systemPrompt);
}

export type Go21SendStatus =
  | "idle"
  | "sending"
  | "customer_sent"
  | "failed"
  | "coach_failed";

export function nextClientRequestId(existing?: string | null): string {
  if (existing?.trim()) return existing.trim();
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `go21-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Client helper: interpret chat API durability fields. */
export function interpretGo21ChatSendResult(payload: {
  ok?: boolean;
  customerAccepted?: boolean;
  assistantStatus?: string | null;
  coachMessage?: string | null;
}): {
  customerSent: boolean;
  coachOk: boolean;
  coachFailed: boolean;
  messageRetry: boolean;
} {
  const assistantStatus = payload.assistantStatus ?? null;
  const customerSent =
    payload.customerAccepted === true ||
    (payload.ok === true && assistantStatus === "ok") ||
    (payload.ok === true && assistantStatus === "failed");
  const coachOk = payload.ok === true && assistantStatus === "ok";
  const coachFailed = customerSent && assistantStatus === "failed";
  // Legacy responses without assistantStatus but with coachMessage
  const legacyOk =
    payload.ok === true && assistantStatus == null && Boolean(payload.coachMessage);
  return {
    customerSent: customerSent || legacyOk,
    coachOk: coachOk || legacyOk,
    coachFailed,
    messageRetry: !(customerSent || legacyOk),
  };
}
