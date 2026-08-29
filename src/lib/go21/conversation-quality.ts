/**
 * Go21 conversation-quality helpers: disengagement, display content,
 * idempotency metadata, and short-coach policy signals for prompts/tests.
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
  // Prefer short food phrases from evidence summaries like "看起來像紅茶"
  const m = evidenceSummary.match(/(?:像|為|是)?\s*([\u4e00-\u9fffA-Za-z0-9]{1,12}(?:茶|飯|麵|湯|蛋|肉|菜|果|奶|水|咖啡)?)/);
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

/** Policy flags used in prompts and tests — not hard truncation. */
export const GO21_SHORT_RESPONSE_POLICY = {
  defaultCharHint: "30–80 個繁體中文字為常見長度；必要時可更短或稍長。",
  principles: [
    "SHORT FIRST：每一次只做當下最有價值的一件事。",
    "預設 1–3 短句；有時一句就夠。",
    "不要每則都「肯定→科普→建議→總結→追問」。",
    "不要為了顯得專業而解釋營養科學，除非此刻真正有用。",
    "問題不是每則必備：只有答案會改變下一步教練決策時才問。",
    "禁止每則結尾塞「你覺得怎麼樣／隨時跟我分享」等套話。",
    "安全與明確停跑意圖優先於簡短。",
  ],
} as const;

export function go21SystemPromptIncludesShortPolicy(systemPrompt: string): boolean {
  return (
    /SHORT FIRST|短句|不要每則都/.test(systemPrompt) &&
    /問題不是每則必備|不要.*追問/.test(systemPrompt)
  );
}

export function go21SystemPromptAllowsNoQuestion(systemPrompt: string): boolean {
  return /問題不是每則必備|可以沒有問題|不必.*問句/.test(systemPrompt);
}

export function go21SystemPromptHandlesDisengagement(systemPrompt: string): boolean {
  return /沒信心|想結束|不要激勵長文|不要挽留/.test(systemPrompt);
}
