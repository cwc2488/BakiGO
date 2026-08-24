import type { InterviewAiTurn } from "@/lib/analysis/interview/interview-contract";
import type { UnderstandingState } from "@/lib/analysis/interview/understanding-state";
import {
  isClinicianDirectedWeightLoss,
  isInterviewChallenge,
  isOthersMarrying,
  isSelfWeddingIntent,
} from "@/lib/analysis/interview/interview-reasoner";
import {
  hasReversalOrUndoShape,
  questionUsesNewInformation,
} from "@/lib/analysis/interview/interview-human-model";
import { detectUserQuestionType } from "@/lib/analysis/interview/interview-fixture";

export const CONVERSATION_VIOLATION_KINDS = [
  "multi_question",
  "medical_boundary_violation",
  "unsafe",
  "user_question_not_answered",
  "challenge_not_handled",
  "unsupported_claim",
  "severe_stale_topic",
] as const;
export type ConversationViolationKind = (typeof CONVERSATION_VIOLATION_KINDS)[number];

export type ConversationValidation = {
  ok: boolean;
  violations: ConversationViolationKind[];
  interrogativeActs: number;
  medicalViolation: boolean;
};

const MEDICAL_COACHING_RE =
  /改善血糖|控制血糖|血糖.{0,16}(飲食|運動|改善|控制)|飲食或運動.{0,16}(血糖|紅字)|怎麼控制血糖|如何改善血糖|治療.{0,10}(血糖|紅字)|檢驗.{0,10}(改善|控制)|給你.{0,8}(藥|處方)|診斷你/;

const DURATION_PROMISE_RE =
  /保證|一定[0-9一二三四五六七八九十]+(週|天|個月)|[0-9]+週一定|幾週一定/;

const DIAGNOSIS_RE = /你有糖尿病|確診|我判斷你|這代表你生病/;

export function followUpText(ai: Pick<InterviewAiTurn, "follow_up_question">): string {
  return (ai.follow_up_question ?? "").trim();
}

export function visibleAssistantTurn(response: string, followUp: string | null | undefined): string {
  return [response.trim(), (followUp ?? "").trim()].filter(Boolean).join("\n");
}

export function countInterrogativeActs(response: string, followUp: string | null | undefined): number {
  const follow = (followUp ?? "").trim();
  const reflection = response.trim();
  const parts = `${reflection}\n${follow}`
    .split(/\n+|(?<=[？?])|(?<=[嗎呢]\s*[。．.]?)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const marked = parts.filter((part) => /[？?]/.test(part) || /[嗎呢]\s*$/.test(part.replace(/[。．.\s]+$/, "")));
  const marks = (visibleAssistantTurn(reflection, follow).match(/[？?]/g) || []).length;
  if (follow && /[？?]/.test(reflection)) return Math.max(2, marks);
  if (/[？?].+[？?]/.test(follow)) return Math.max(2, marks);
  if (/[？?].+[？?]/.test(reflection) && !follow) return Math.max(2, marks);
  return Math.max(marked.length > 1 ? marked.filter((p) => /[？?]/.test(p)).length : marks, marks);
}

export function hasMedicalCoachingQuestion(visible: string): boolean {
  return MEDICAL_COACHING_RE.test(visible);
}

export function validateConversationTurn(input: {
  answer: string;
  ai: InterviewAiTurn;
  understanding: UnderstandingState;
  previousQuestion?: string;
}): ConversationValidation {
  const violations: ConversationViolationKind[] = [];
  const response = input.ai.assistant_response ?? "";
  const follow = followUpText(input.ai);
  const visible = visibleAssistantTurn(response, follow);
  const interrogativeActs = countInterrogativeActs(response, follow);

  if (interrogativeActs > 1) violations.push("multi_question");
  if (hasMedicalCoachingQuestion(visible)) violations.push("medical_boundary_violation");
  if (DURATION_PROMISE_RE.test(visible) || DIAGNOSIS_RE.test(visible)) violations.push("unsafe");

  if (isInterviewChallenge(input.answer)) {
    const handled =
      input.ai.move === "explain_and_return_control" ||
      /弄清楚|整理|目前知道|不想只看到/.test(response);
    if (!handled) violations.push("challenge_not_handled");
  }

  const userQ = detectUserQuestionType(input.answer);
  if (userQ && userQ !== "user_question") {
    const answered = response.trim().length >= 8 && !/我了解|謝謝分享/.test(response);
    if (!answered) violations.push("user_question_not_answered");
  }

  if (isOthersMarrying(input.answer) && /辦婚宴|你想結婚|身材跟.{0,8}想結婚|你的婚宴/.test(visible)) {
    violations.push("severe_stale_topic");
  }
  if (
    hasReversalOrUndoShape(input.answer) &&
    follow &&
    !questionUsesNewInformation(input.answer, visible) &&
    /交女朋友|認識女生|想結婚/.test(follow)
  ) {
    violations.push("severe_stale_topic");
  }
  if (isSelfWeddingIntent(input.answer) && isOthersMarrying(visible)) {
    violations.push("unsupported_claim");
  }
  if (isClinicianDirectedWeightLoss(input.answer) && /診斷|給藥|處方/.test(visible)) {
    violations.push("unsafe");
  }

  const unique = [...new Set(violations)];
  return {
    ok: unique.length === 0,
    violations: unique,
    interrogativeActs,
    medicalViolation: unique.includes("medical_boundary_violation"),
  };
}

export function stripInterrogatives(text: string): string {
  return text
    .split(/\n+|(?<=[。！])/)
    .map((s) => s.trim())
    .filter((part) => part && !/[？?]/.test(part))
    .join("");
}

export function applyProgramHardStop(
  answer: string,
  ai: InterviewAiTurn,
  validation: ConversationValidation,
): { ai: InterviewAiTurn; owner: "PROGRAM_HARD_STOP" } {
  let next = { ...ai };
  const visible = visibleAssistantTurn(next.assistant_response, followUpText(next));
  if (validation.violations.includes("multi_question")) {
    next = {
      ...next,
      assistant_response: stripInterrogatives(next.assistant_response) || stripInterrogatives(visible),
      follow_up_question: null,
    };
  }
  if (validation.violations.includes("medical_boundary_violation")) {
    next = {
      ...next,
      assistant_response: stripInterrogatives(next.assistant_response.replace(MEDICAL_COACHING_RE, "")).trim()
        || "健檢的結果讓這件事比較急，但我不會解讀檢驗或給治療建議。",
      follow_up_question: null,
    };
  }
  if (validation.violations.includes("unsafe")) {
    next = {
      ...next,
      assistant_response: stripInterrogatives(next.assistant_response),
      follow_up_question: null,
    };
  }
  if (validation.violations.includes("challenge_not_handled") && isInterviewChallenge(answer)) {
    next = {
      ...next,
      move: "explain_and_return_control",
      user_question_detected: true,
      next_action: "answer_then_ask",
      assistant_response:
        "因為我不想只看到「想減肥」就直接給你一套方法，我想先弄清楚你真正想改的是什麼、以前又卡在哪裡，這樣最後給你的分析才不會很空泛。不過不用每題都回答得很深——如果你覺得差不多了，我也可以直接用目前知道的幫你整理。",
      follow_up_question: "你要我繼續了解，還是先用目前知道的幫你整理？",
    };
  }
  if (validation.violations.includes("user_question_not_answered")) {
    const kind = detectUserQuestionType(answer);
    if (kind === "duration_question") {
      next = {
        ...next,
        user_question_detected: true,
        next_action: "answer_then_ask",
        assistant_response:
          "這沒有固定週期。需要多久，取決於你想改到什麼程度、以及你實際做得到的改變是什麼。",
        follow_up_question: null,
      };
    } else if (kind === "cost_question") {
      next = {
        ...next,
        user_question_detected: true,
        assistant_response: "這一階段不是在談費用或方案，我現在也沒有要向你收費。",
        follow_up_question: null,
      };
    } else if (kind === "how_it_works") {
      next = {
        ...next,
        user_question_detected: true,
        assistant_response: "我現在還在了解你卡住的方式，不會先丟一套計畫。",
        follow_up_question: null,
      };
    }
  }
  if (validation.violations.includes("severe_stale_topic")) {
    next = {
      ...next,
      follow_up_question: null,
      assistant_response: stripInterrogatives(next.assistant_response) || next.assistant_response,
    };
  }
  return { ai: next, owner: "PROGRAM_HARD_STOP" };
}
