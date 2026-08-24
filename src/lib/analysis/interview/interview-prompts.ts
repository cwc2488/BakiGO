import type { InterviewSessionState } from "@/lib/analysis/interview/interview-contract";
import {
  compactActiveHypotheses,
  compactConfirmedFacts,
  compactEvidence,
  compactQuizForPrompt,
} from "@/lib/analysis/interview/interview-quality";
import { compactHumanModelForPrompt, buildCurrentHumanModel } from "@/lib/analysis/interview/interview-human-model";
import { buildConversationalMemory } from "@/lib/analysis/interview/interview-reasoner";

export function buildInterviewSystemPrompt(): string {
  return [
    "你是減脂諮詢的 Conversation Reasoner。你擁有可見對話。Program 只做 grounding、safety、completion、硬不變量。你不要填問卷欄位，不要為了空欄位發問。",
    "每一輪依序想（不要把思考過程寫給使用者）：使用者剛新增或更正了什麼？這如何改變我對這個人的理解？跟前面哪句連得起來？有沒有因果、張力、矛盾、代價？這一輪問一句是否真的有用？有用才問唯一一題；沒用就只回應、follow_up_question=null。",
    "高資訊量的新陳述壓過舊訪談議程。pivot、更正、復胖擔心、第三方人生階段，都必須先處理，不得繼續上一題。",
    "move 只能是：acknowledge_and_ask / reflect_and_verify / test_hypothesis / distinguish_two_explanations / follow_new_information / deepen_when_useful / challenge_gently / answer_then_ask / explain_and_return_control / summarize_and_verify / complete。",
    "主語很重要。「我想結婚」「女朋友叫我減肥」「朋友都結婚了」「醫生叫我減肥」不是同一件事。朋友結婚≠使用者要結婚或辦婚宴。醫生／紅字／血糖可作 trigger 與 safety context，不可變成「如何改善血糖／飲食運動治療檢驗」的教練題。不診斷、不解讀檢驗、不給藥、不開處方。",
    "禁止預設訪談腔：「有什麼具體影響／特殊意義」「可以多分享一些嗎」「有哪些因素」「你最希望我先聽懂哪一部分」、反覆「我這樣理解有接近嗎」、沒有證據的萬能二選一、把已經說過的話再問一次。禁止「很好的動機／很棒／謝謝分享」填料。",
    "assistant_response 0–3 短句，必須增加理解。不要把問句寫進 assistant_response。整個可見回合最多一個疑問行為：要嘛 follow_up_question 有一題，要嘛為 null。",
    "follow_up_question 可以是 null，即使還沒 complete。整理理解、回答使用者問題、高資訊量陳述已被接住時，都可以不問。不要為了 schema 硬想一題。next_action=ask 且 follow_up_question=null 表示這一輪只回應。",
    "使用者問多久／多少錢／怎麼做：先回答，再決定要不要追問；沒必要就 null。使用者說「你一直問這些幹嘛」：move=explain_and_return_control，解釋目的、把決定權交回，不要立刻繼續盤問。",
    "understanding_patch 最多 6 筆。FACT=親口說過。禁止無證據推論。測驗人格只是先前脈絡，禁止寫進 patch。",
    "完成條件：已有足夠 grounded 理解，能做出非空泛分析。缺選填欄位不是繼續問的理由。",
    "reasoning_summary 給程式看。禁止問卷、保證時程、銷售。",
  ].join("\n");
}

export function buildInterviewUserPrompt(input: {
  quiz: {
    animalName: string;
    tagline: string;
    headline: string;
    coreInsight: string;
    primaryGoal: string | null;
    readiness: string | null;
  };
  state: InterviewSessionState;
  previousQuestion: string;
  currentAnswer: string;
  userTurnId: string;
  userTurnCount: number;
  contractRepair?: { violations: string[]; note: string };
}): string {
  const memory = buildConversationalMemory({
    state: input.state,
    previousQuestion: input.previousQuestion,
    currentAnswer: input.currentAnswer,
    userTurnId: input.userTurnId,
  });
  const human = compactHumanModelForPrompt(
    buildCurrentHumanModel({
      answer: input.currentAnswer,
      before: input.state.understanding,
      after: input.state.understanding,
    }),
  );
  const confirmed = compactConfirmedFacts(input.state.understanding);
  const hypotheses = compactActiveHypotheses(input.state.understanding);
  const evidence = compactEvidence(input.state.understanding);
  const payload: Record<string, unknown> = {
    quiz_prior: compactQuizForPrompt(input.quiz),
    memory: {
      recent: memory.recent,
      previous_intent: memory.previous_intent,
      note: "previous_intent is context only; it has no authority over the next move",
    },
    answer: input.currentAnswer,
    turn: input.userTurnId,
    n: input.userTurnCount,
    human,
    contract: {
      follow_up_question_may_be_null: true,
      max_interrogative_acts: 1,
      medical_coaching_questions_forbidden: true,
    },
  };
  if (Object.keys(confirmed).length > 0) (payload.memory as Record<string, unknown>).facts = confirmed;
  if (hypotheses.length > 0) (payload.memory as Record<string, unknown>).hypotheses = hypotheses;
  if (memory.contradictions.length > 0) {
    (payload.memory as Record<string, unknown>).contradictions = memory.contradictions;
  }
  if (evidence.length > 0) payload.evidence = evidence;
  if (input.state.safety.flagged) payload.safety = true;
  if (input.contractRepair) payload.contract_repair = input.contractRepair;
  return JSON.stringify(payload);
}
