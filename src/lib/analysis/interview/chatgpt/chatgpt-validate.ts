import type { NativeInterviewTurn } from "@/lib/analysis/interview/native/native-contract";
import {
  detectDirectUserQuestion,
  stripUnsafeMedicalCopy,
  visibleNativeText,
  type NativeValidation,
  type NativeViolation,
} from "@/lib/analysis/interview/native/native-validate";

export { detectDirectUserQuestion, stripUnsafeMedicalCopy, visibleNativeText };

const MEDICAL_COACHING_RE =
  /改善血糖|控制血糖|血糖.{0,16}(飲食|運動|改善|控制)|飲食或運動.{0,16}(血糖|紅字)|怎麼控制血糖|如何改善血糖|治療.{0,10}(血糖|紅字)|給你.{0,8}(藥|處方)|診斷你|你有糖尿病/;
const DIAGNOSIS_RE = /你有糖尿病|確診你|我判斷你|這代表你生病/;
const DURATION_ANSWER_RE = /沒有固定|因人而異|取決於|不承諾週期|沒辦法保證.*週期/;
const COST_ANSWER_RE =
  /不收費|不是在談費用|不是在報價|沒有要向你收費|沒有提供收費|沒有金額|還不是談價錢|還不是報價|不是報價階段|現在.*(理解|了解).*(狀況|階段)|這一階段.*(不.*收費|分析|不是報價|理解)/;
const HOW_ANSWER_RE = /不會先丟|現在還在了解|先了解|不是先給|這一階段|先弄清楚/;

/** One conceptual A-or-B question is allowed. Stacked grilling is not. */
export function isObviousInterrogation(text: string): boolean {
  const marks = (text.match(/[？?]/g) || []).length;
  if (marks >= 3) return true;
  if (marks >= 2 && !/還是|或者/.test(text)) return true;
  return /為什麼.{0,24}[？?].{0,8}(以前|試過|現在).{0,24}[？?]/.test(text);
}

const CHATGPT_HARD: NativeViolation[] = [
  "unsafe_medical",
  "medical_coaching_question",
  "user_question_not_answered",
  "multi_question",
];

export function validateChatgptTurn(input: {
  answer: string;
  turn: NativeInterviewTurn;
}): NativeValidation {
  const violations: NativeViolation[] = [];
  const visible = visibleNativeText(input.turn);
  if (DIAGNOSIS_RE.test(visible)) violations.push("unsafe_medical");
  if (MEDICAL_COACHING_RE.test(visible)) violations.push("medical_coaching_question");
  if (isObviousInterrogation(visible)) violations.push("multi_question");

  const kind = detectDirectUserQuestion(input.answer);
  if (kind === "duration" && !DURATION_ANSWER_RE.test(visible)) {
    violations.push("user_question_not_answered");
  }
  if (kind === "cost" && !COST_ANSWER_RE.test(visible)) {
    violations.push("user_question_not_answered");
  }
  if (kind === "how" && !HOW_ANSWER_RE.test(visible)) {
    violations.push("user_question_not_answered");
  }
  if (kind === "challenge") {
    const stillInterviewing = /(動力|困難|原因)是什麼[？?]|那你覺得.{0,12}[？?]/;
    if (stillInterviewing.test(visible) || !visible.trim()) {
      violations.push("user_question_not_answered");
    }
  }

  const unique = [...new Set(violations)];
  return {
    ok: unique.length === 0,
    violations: unique,
    interrogativeActs: (visible.match(/[？?]/g) || []).length,
  };
}

export function shouldRegenerateChatgptTurn(violations: NativeViolation[]): boolean {
  return violations.some((v) => CHATGPT_HARD.includes(v));
}
