import { DYNAMIC_QUIZ_BOUNDS } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";

export function buildDynamicQuizSystemPrompt(): string {
  return [
    "你在為體態／減脂情境設計下一題選擇題。這不是固定問卷，也不是開放訪談。",
    "使用者只會看到題目和選項。decision、information_gain、why_next_question、reasoning_tag、hypothesis_targets、understanding、quiz_prior 都是內部的，不要寫進題目或選項。",
    "每次先做 COUNTERFACTUAL INFORMATION GAIN，再決定 continue 或 complete。",
    "問自己：如果這題的幾個合理答案不同，會不會實質改變對這個人的理解，或顧問下一步該做的事？",
    "information_gain 必填：target（這題要解消什麼不確定）、plausible_answers（2–3 個實質不同的可能答案）、material_change（true/false）、change_dimensions、short_rationale（一句，不是完整推理鏈）。",
    "material_change=true 僅當不同答案會改變至少一項：primary motivation、why now / urgency、primary barrier、causal mechanism、meaningful tradeoff、readiness、competing hypothesis、顧問下一步。",
    "若答案不同但最後理解與下一步基本一樣：material_change=false，decision=complete。不要因為「可以解釋為什麼這題有關」就繼續問。",
    "第 1–5 題：正常探索。第 6–7 題可以 complete。第 8 題是產品硬上限：答完就結束，不要產生第 9 題。6–8 題完成都合法。這個測驗只要產出有用的個人化假設，不必完整理解這個人。不要為了湊題數、填空欄位、或多知道一點細節而繼續。",
    "hypothesis id 由程式重寫；你可填 placeholder。每個 hypothesis 必須有 status: active | confirmed | weakened | rejected | superseded，並附 evidence。後來的答案可以 weaken / supersede 稍早假設。",
    "action=ask 時 decision=continue。action=complete 時 decision=complete，question 可空，information_gain.material_change=false。",
    "選項必須像真人會選的口語，繁體中文。禁止心理學／臨床標籤。選項 3–6 個。題目一句話問完。",
    "下一題必須能因上一題答案而明顯不同。不要按固定維度輪詢。",
    "醫療／醫生／檢驗只能當情境。不要診斷、開藥、解讀檢驗、建議治療。",
    "對話主題是體態／身體改變。結婚、伴侶、工作、衣服、朋友可以解釋「為什麼在意」，不能把測驗變成婚禮或感情問卷。",
    "unverified 永遠 true。quiz_prior 是精簡假設，不是最終心理分析。",
  ].join("\n");
}

export function buildDynamicQuizUserPrompt(input: {
  icebreaker: {
    animalName: string;
    tagline: string;
    coreInsight: string;
    source?: "personality_quiz" | "native_opener";
  };
  asked: Array<{ question: string; selected: string[] }>;
  askedIntents?: Array<{ question: string; target: string; hypothesis_targets: string[] }>;
  latestSelected: string[];
  understanding: unknown;
  answeredCount: number;
  min: number;
  hardMax: number;
  preferCompleteFrom: number;
  repair?: { violations: string[]; note: string };
}): string {
  const nativeOpener = input.icebreaker.source === "native_opener" || !input.icebreaker.animalName;
  const payload: Record<string, unknown> = {
    objective:
      "了解這個人為什麼想改變體態、真正卡住什麼、願意做哪種改變。產出 UNVERIFIED 假設。先做 counterfactual information gain，再決定 continue 或 complete。",
    unverified_icebreaker: nativeOpener
      ? {
          label: "UNVERIFIED conversation seed from one opening answer — not a personality type or diagnosis",
          opening_answer: input.latestSelected[0] ?? input.icebreaker.coreInsight ?? "",
        }
      : {
          label: "UNVERIFIED PRIOR from a previous personality quiz — not confirmed fact",
          animal: input.icebreaker.animalName,
          tagline: input.icebreaker.tagline,
          coreInsight: input.icebreaker.coreInsight,
        },
    previous: input.asked,
    already_covered_intents: {
      note: "These information targets / question cores were already asked. Do not ask a semantic paraphrase of the same target. Ask something that would change understanding, or complete.",
      questions: input.asked.map((row) => row.question),
      targets: input.askedIntents ?? [],
    },
    latest_selected: input.latestSelected,
    current_understanding: input.understanding,
    answered_count: input.answeredCount,
    bounds: {
      min: input.min,
      preferCompleteFrom: input.preferCompleteFrom,
      hardMax: input.hardMax,
      may_complete: input.answeredCount >= input.min,
      prefer_complete: input.answeredCount >= 7,
      hard_product_cap: 8,
      never_generate_q9: true,
      exploration_only: input.answeredCount < 5,
    },
    counterfactual: {
      rule: "If plausible different answers would NOT materially change understanding or the next useful action, complete.",
      information_gain_required: true,
    },
  };
  if (input.repair) payload.contract_repair = input.repair;
  return JSON.stringify(payload);
}

export function buildQuizPriorSystemPrompt(): string {
  return [
    "根據選擇題紀錄，整理一份 UNVERIFIED Quiz Prior。這不是最終分析，也不是已證實事實。",
    "有矛盾就寫進 contradictions，並降低相關 confidence。最新答案優先。稍早假設可 weakened / superseded / rejected。",
    "不要診斷疾病。不要把測驗人格動物寫成事實。使用繁體中文短句。",
    `硬上限 ${DYNAMIC_QUIZ_BOUNDS.hardMax} 題。`,
  ].join("\n");
}
