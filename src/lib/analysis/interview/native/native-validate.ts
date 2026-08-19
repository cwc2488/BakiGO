import type { NativeInterviewTurn } from "@/lib/analysis/interview/native/native-contract";

export type NativeViolation =
  | "malformed"
  | "unsafe_medical"
  | "medical_coaching_question"
  | "duration_promise"
  | "multi_question"
  | "user_question_not_answered"
  | "challenge_not_handled"
  | "fake_depth"
  | "canned_filler"
  | "topic_drift";

export type NativeValidation = {
  ok: boolean;
  violations: NativeViolation[];
  interrogativeActs: number;
};

/** Program-owned conversational hard constraints only. */
export const NATIVE_HARD_REGEN_VIOLATIONS: NativeViolation[] = [
  "multi_question",
  "user_question_not_answered",
  "unsafe_medical",
  "medical_coaching_question",
  "topic_drift",
];

const MEDICAL_COACHING_RE =
  /改善血糖|控制血糖|血糖.{0,16}(飲食|運動|改善|控制)|飲食或運動.{0,16}(血糖|紅字)|怎麼控制血糖|如何改善血糖|治療.{0,10}(血糖|紅字)|給你.{0,8}(藥|處方)|診斷你|你有糖尿病/;

const DURATION_PROMISE_RE =
  /保證|一定[0-9一二三四五六七八九十]+(週|天|個月)|[0-9]+週一定|通常.{0,12}(一|[0-9])個?月|[0-9]到[0-9]個?月|三到六個月/;

const DIAGNOSIS_RE = /你有糖尿病|確診你|我判斷你|這代表你生病/;

const FAKE_DEPTH_RE =
  /有什麼.{0,10}(特殊|特別)?意義|有什麼.{0,10}(具體)?影響|可以多說一點|可以再多說|還有其他原因嗎|最希望我先聽懂/;

const CANNED_FILLER_RE = /很好的動機|謝謝分享|這很重要|我了解你|我理解你/;

const DURATION_ANSWER_RE = /沒有固定|因人而異|取決於|不承諾週期|沒辦法保證.*週期/;
const DURATION_BOUNCE_RE = /你希望多久|想在幾週|你希望在多長|多長時間內達到|想要多久|怎樣的節奏|什麼節奏|以怎樣的節奏/;

const COST_ANSWER_RE =
  /不收費|不是在談費用|不是在報價|沒有要向你收費|沒有提供收費|沒有金額|還不是談價錢|這一階段.*(不.*收費|分析|不是報價)/;
const COST_BOUNCE_RE =
  /你是指.{0,12}(費用|錢)|你問的是.{0,12}(費用|錢)|你希望了解這方面|哪一類的費用|哪種費用|想知道的是哪/;
const COST_PRICE_LIST_RE = /幾千|上萬|每月.{0,8}元|健身房會員|方案價格/;

const RETURN_CONTROL_RE =
  /繼續了解|先用目前|先整理|先看目前|你可以決定|要我繼續|還是先|由你決定|決定權在你|你來決定|要不要繼續/;

const ROLE_DRIFT_RE = /賓客印象|婚禮籌備|辦婚禮|婚宴場地|交友軟體|怎麼追|復合技巧|分手談判/;
const BODY_ANCHOR_RE = /瘦|胖|體|吃|穿|身形|身材|體重|減脂|飲食|運動|衣服|體態|卡/;

export function detectDirectUserQuestion(
  text: string,
): "duration" | "cost" | "how" | "support" | "difficulty" | "challenge" | null {
  const t = text.trim();
  if (/一直問這些幹嘛|問這些到底要幹嘛|你問太多了/.test(t)) return "challenge";
  if (/需要多久|要多久|幾週|多久才|要幾天/.test(t)) return "duration";
  if (/多少錢|貴不貴|費用|價格/.test(t)) return "cost";
  if (/要怎麼做|怎麼開始|那要怎麼|怎麼進行|怎麼運作/.test(t)) return "how";
  if (/[?？]|嗎/.test(t) && /有人.*幫|陪我|教練/.test(t)) return "support";
  if (/會不會很(辛苦|難)|難不難|很嚴格嗎/.test(t)) return "difficulty";
  return null;
}

export function countInterrogativeActs(response: string): number {
  const marks = (response.match(/[？?]/g) || []).length;
  let acts = marks;
  // Hidden second intent without a second mark. A single 「是 A 還是 B？」 stays one act.
  if (marks <= 1) {
    if (/另外.{0,24}(嗎|呢|[？?])/.test(response)) acts += 1;
    if (/以及.{0,24}(嗎|呢|[？?])/.test(response)) acts += 1;
  }
  return acts;
}

export function visibleNativeText(turn: NativeInterviewTurn): string {
  return turn.assistant_response.trim();
}

export function shouldRegenerateNativeTurn(violations: NativeViolation[]): boolean {
  return violations.some((v) => NATIVE_HARD_REGEN_VIOLATIONS.includes(v));
}

export function validateNativeTurn(input: {
  answer: string;
  turn: NativeInterviewTurn;
}): NativeValidation {
  const violations: NativeViolation[] = [];
  const visible = visibleNativeText(input.turn);
  const interrogativeActs = countInterrogativeActs(visible);
  if (interrogativeActs > 1) violations.push("multi_question");
  if (MEDICAL_COACHING_RE.test(visible) || DIAGNOSIS_RE.test(visible)) {
    violations.push(DIAGNOSIS_RE.test(visible) ? "unsafe_medical" : "medical_coaching_question");
  }
  if (DURATION_PROMISE_RE.test(visible)) violations.push("duration_promise");
  if (FAKE_DEPTH_RE.test(visible)) violations.push("fake_depth");
  if (CANNED_FILLER_RE.test(visible)) violations.push("canned_filler");
  if (ROLE_DRIFT_RE.test(visible) && !BODY_ANCHOR_RE.test(visible)) violations.push("topic_drift");

  const kind = detectDirectUserQuestion(input.answer);
  if (kind === "challenge") {
    const explained =
      input.turn.conversation_action === "challenge" ||
      /問這些|了解你|弄清楚|不是填|為了更了解/.test(input.turn.assistant_response);
    const returnedControl = RETURN_CONTROL_RE.test(input.turn.assistant_response);
    const contentProbe = /(動力|困難)是什麼[？?]|有什麼.{0,10}(意義|影響)[？?]/;
    if (!explained || !returnedControl || contentProbe.test(visible)) {
      violations.push("challenge_not_handled");
      violations.push("user_question_not_answered");
    }
  } else if (kind === "duration") {
    if (!DURATION_ANSWER_RE.test(visible) || DURATION_BOUNCE_RE.test(visible)) {
      violations.push("user_question_not_answered");
    }
  } else if (kind === "cost") {
    if (!COST_ANSWER_RE.test(visible) || COST_BOUNCE_RE.test(visible) || COST_PRICE_LIST_RE.test(visible)) {
      violations.push("user_question_not_answered");
    }
  } else if (kind === "how") {
    const answered = /不會先丟|現在還在了解|先了解|不是先給|這一階段|先弄清楚/.test(visible);
    const onlyQuestion = /^[^。！!]*[？?]\s*$/.test(visible);
    if (!answered || onlyQuestion) {
      violations.push("user_question_not_answered");
    }
  }

  return {
    ok: violations.length === 0,
    violations: [...new Set(violations)],
    interrogativeActs,
  };
}

/** Safety only: drop medical-coaching / diagnosis sentences. Do not invent a replacement question. */
export function stripUnsafeMedicalCopy(text: string): string {
  return text
    .split(/(?<=[。！？?\n])/)
    .map((part) => part.trim())
    .filter((part) => part && !MEDICAL_COACHING_RE.test(part) && !DIAGNOSIS_RE.test(part))
    .join("");
}

export function logNativeContractFailure(event: {
  violations: NativeViolation[];
  answer: string;
  visible: string;
  original?: string;
  regeneratedText?: string;
  finalText?: string;
  reason?: string;
  regenerated?: boolean;
}): void {
  console.info(
    JSON.stringify({
      type: "analysis_native_interview_contract_failure",
      timestamp: new Date().toISOString(),
      violations: event.violations,
      regenerated: event.regenerated === true,
      reason: event.reason ?? event.violations.join(","),
      original: (event.original ?? event.visible).slice(0, 240),
      regeneratedResponse: event.regeneratedText?.slice(0, 240) ?? null,
      finalResponse: (event.finalText ?? event.visible).slice(0, 240),
      answerPreview: event.answer.slice(0, 80),
      visiblePreview: event.visible.slice(0, 160),
    }),
  );
}
