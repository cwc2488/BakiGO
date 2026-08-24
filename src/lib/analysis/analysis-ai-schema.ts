import { z } from "zod";

/** P2.1 insight-density prompt. QUIZ-AI-25 adds narrative authority from explicit corrections. */
export const ANALYSIS_AI_PROMPT_VERSION = "analysis_report_v5" as const;
export const ANALYSIS_AI_MODEL_ID = "gpt-4.1-mini" as const;
export const ANALYSIS_AI_TIMEOUT_MS = 25_000 as const;
export const ANALYSIS_AI_MAX_ATTEMPTS = 3 as const;
export const ANALYSIS_AI_STALE_MINUTES = 3 as const;

/** Length budget: ~1.5–2.5 min mobile read; insight density > word count. */
export const ANALYSIS_AI_SECTION_MIN_CHARS = 40;
export const ANALYSIS_AI_SECTION_MAX_CHARS = 280;

export const ANALYSIS_AI_SECTION_TITLES = [
  "你現在真正卡住的模式",
  "為什麼你以前容易失敗",
  "最值得先處理的根本原因",
  "你的生活型態關鍵",
  "最值得先改的一件事",
  "適合你的下一步",
] as const;

export const analysisAiReportSchema = z.object({
  section1_personality: z
    .string()
    .min(ANALYSIS_AI_SECTION_MIN_CHARS)
    .max(ANALYSIS_AI_SECTION_MAX_CHARS),
  section2_why_change: z
    .string()
    .min(ANALYSIS_AI_SECTION_MIN_CHARS)
    .max(ANALYSIS_AI_SECTION_MAX_CHARS),
  section3_why_failed: z
    .string()
    .min(ANALYSIS_AI_SECTION_MIN_CHARS)
    .max(ANALYSIS_AI_SECTION_MAX_CHARS),
  section4_lifestyle: z
    .string()
    .min(ANALYSIS_AI_SECTION_MIN_CHARS)
    .max(ANALYSIS_AI_SECTION_MAX_CHARS),
  section5_one_change: z
    .string()
    .min(ANALYSIS_AI_SECTION_MIN_CHARS)
    .max(ANALYSIS_AI_SECTION_MAX_CHARS),
  section6_next_step: z
    .string()
    .min(ANALYSIS_AI_SECTION_MIN_CHARS)
    .max(ANALYSIS_AI_SECTION_MAX_CHARS),
});

export type AnalysisAiReport = z.infer<typeof analysisAiReportSchema>;

export const ANALYSIS_AI_REPORT_JSON_SCHEMA = {
  name: "analysis_personalized_report",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "section1_personality",
      "section2_why_change",
      "section3_why_failed",
      "section4_lifestyle",
      "section5_one_change",
      "section6_next_step",
    ],
    properties: {
      section1_personality: { type: "string" },
      section2_why_change: { type: "string" },
      section3_why_failed: { type: "string" },
      section4_lifestyle: { type: "string" },
      section5_one_change: { type: "string" },
      section6_next_step: { type: "string" },
    },
  },
} as const;

export type AnalysisAiInputSnapshot = {
  version: typeof ANALYSIS_AI_PROMPT_VERSION;
  quiz: {
    primaryType: string;
    animalName: string;
    tagline: string;
    coreInsight: string;
    primaryGoal: string | null;
    readiness: string | null;
    actionHistoryLabels: string[];
  };
  answers: Record<string, unknown>;
  layer1: Record<string, unknown>;
  safetyFlagged: boolean;
  dynamicContext?: {
    primaryBranch: string | null;
    completedSlots: string[];
    activeBranches: string[];
    reflections: Array<{ text: string; evidence: string[] }>;
    derivedFacts: Array<{ fact: string; inference: true; evidence: string[] }>;
    understanding?: Record<string, { value: string; kind: string }>;
    conversationStage?: string;
    quizPrior?: {
      unverified: true;
      prior: unknown;
      history: Array<{ question: string; selected: string[] }>;
    };
    interviewTranscript?: Array<{ role: string; text: string }>;
    evidenceAuthority?: {
      confirmed: Array<{ source: string; text: string; field?: string }>;
      unresolved: string[];
      rejectedOrSuperseded: Array<{ claim: string; kind: string; status: string; formerRole?: string }>;
      quizOnlyPrior: Array<{ claim: string; kind: string; status: string }>;
    };
    narrativeAuthority?: {
      active: {
        claim: string;
        user_text: string;
        authority: "explicit_user_correction";
        supersedes_claim_ids: string[];
      } | null;
      superseded: Array<{ claim: string; user_text: string }>;
    };
    /** Preview insight consumer only. Production Layer2 ignores this. */
    reportKind?: "insight_compressed";
    insightReasoning?: unknown;
  };
};

export function buildAnalysisAiSystemPrompt(): string {
  return [
    "你是 Baki GO 的減脂卡關分析助手。任務：寫出「少整理、多洞察」的六段個人分析。",
    "",
    "核心寫作原則：",
    "- 不要複述使用者剛回答的內容（例如「你說你睡不好」「你提到晚上會吃」）。",
    "- 要往下一層：這幾件事放在一起代表什麼？建立因果與模式解釋。",
    "- LESS summary / MORE interpretation / MORE causal connection / MORE useful insight。",
    "- 整份手機閱讀約 1.5–2.5 分鐘。每段：一個主要 insight + 必要時 1–2 句支持。不要長篇 essay。",
    "- 至少建立 2 個跨答案連結（例如 why_now×why_stuck、sleep×trigger、work×meals、past×commitment、goal×motivation）。",
    "- 像在「看整個人」，不要逐題各寫一段。",
    "",
    "反模板／反重複：",
    "- 不要每段用相同開頭（避免連續「從你的回答來看…」）。",
    "- 不要反覆貼 personality label / 動物名。",
    "- 六段責任必須不同：section 2–5 不得只是 section 1 換句話說。",
    "- 每個 insight 只講一件事。",
    "",
    "六段責任（JSON 欄位名保留，但內容責任如下）：",
    "1 section1_personality = 你現在真正卡住的模式（quiz+answers 的核心 pattern，不是 label 說明）。",
    "2 section2_why_change = 為什麼你以前容易失敗（2–3 個答案之間的因果，不是列歷史）。",
    "3 section3_why_failed = 最值得先處理的根本原因（只抓 1 個 highest-leverage bottleneck）。",
    "4 section4_lifestyle = 生活型態關鍵（sleep/work/meals/activity/trigger 的 interaction，不是 checklist）。",
    "5 section5_one_change = 最值得先改的一件事（具體、低摩擦、符合他的生活、不要求完美）。",
    "6 section6_next_step = 適合你的下一步：可輕微建立「有人陪著依真實生活微調會更容易」的感覺；不要 CTA、價格、產品、21天方案硬銷、強迫聯絡。",
    "",
    "允許（soft next-step priming）：",
    "「比起再找更嚴格的方法，更適合先用短時間把失守情境實際記下來，有人依真實生活微調。」",
    "「你需要的可能不是更多知識，而是先做得到、再依反應調整的過程。」",
    "",
    "禁止：購買、立即加入、21 天方案、Herbalife、產品推薦、收入／事業、誇大減重承諾、醫療診斷／處方式醫囑。",
    "必須 grounded：只能用提供的 facts；不得編造沒回答過的細節。dynamicContext.derivedFacts 若存在，是 inference，不得當成使用者親口說過的新事實。",
    "證據可信度與敘事主角不同。evidenceAuthority 回答「哪些資料可信」；narrativeAuthority 回答「使用者自己說這整件事真正是關於什麼」。",
    "NARRATIVE AUTHORITY 順序：ACTIVE EXPLICIT USER CORRECTION > DIRECT INTERVIEW FACT > CONFIRMED INTERVIEW SYNTHESIS > QUIZ ANSWER > QUIZ HYPOTHESIS > GENERIC PRIOR。",
    "若 narrativeAuthority.active 存在：它就是整份報告的 primary story。section1 必須以它當主角，不得改寫成另一個比較像減重模板的故事。其他 CONFIRMED 事實可以當 supporting barrier / pattern，但不能取代它當主敘事。",
    "已被 superseded 的訂正與 REJECTED / SUPERSEDED 假設禁止重新當 primary narrative，也不得換句話偷偷回來。",
    "沒有 active correction 時，才用 DIRECT INTERVIEW FACT 建立主敘事。",
    "QUIZ-ONLY PRIOR 一律 UNVERIFIED，禁止寫成「測驗顯示你就是」。",
    "dynamicContext.understanding 若存在：kind=fact 才是對方親口說過；kind=inference 是訪談解釋。禁止在報告中寫出 conversion / sales 分類名稱。",
    "若 safetyFlagged=true：不得醫療治療／診斷／處方式運動醫囑；只給一般、安全的生活型態方向；第 6 段保持審慎。",
    "使用繁體中文。每段字數約 40–280 字。",
  ].join("\n");
}

export function buildAnalysisAiUserPrompt(snapshot: AnalysisAiInputSnapshot): string {
  return JSON.stringify(
    {
      task: "Write six insight-dense analysis sections (interpretation > paraphrase).",
      writingGoal: "cross-answer causal insight; anti-repetition; length budget",
      safetyFlagged: snapshot.safetyFlagged,
      evidenceAuthority: snapshot.dynamicContext?.evidenceAuthority ?? {
        confirmed: [],
        unresolved: [],
        rejectedOrSuperseded: [],
        quizOnlyPrior: [],
      },
      narrativeAuthority: snapshot.dynamicContext?.narrativeAuthority ?? { active: null, superseded: [] },
      authorityRule:
        "Do not infer authority from chronology. Evidence credibility and narrative protagonist are different. If narrativeAuthority.active exists, it is the primary story of the whole report. Supporting barriers may come from other CONFIRMED facts. Superseded narratives must not become the protagonist again.",
      quiz: snapshot.quiz,
      answers: snapshot.answers,
      layer1Facts: snapshot.layer1,
      dynamicContext: snapshot.dynamicContext ?? null,
      evidencePriority: [
        "ACTIVE EXPLICIT USER CORRECTION (narrative authority)",
        "DIRECT INTERVIEW FACT",
        "CONFIRMED INTERVIEW SYNTHESIS",
        "QUIZ ANSWER",
        "QUIZ HYPOTHESIS (UNVERIFIED)",
        "GENERIC PRIOR",
      ],
      sectionResponsibilities: [
        {
          field: "section1_personality",
          title: ANALYSIS_AI_SECTION_TITLES[0],
          job: "core stuck pattern from quiz + deep answers",
        },
        {
          field: "section2_why_change",
          title: ANALYSIS_AI_SECTION_TITLES[1],
          job: "causal links across 2–3 answers explaining past failure",
        },
        {
          field: "section3_why_failed",
          title: ANALYSIS_AI_SECTION_TITLES[2],
          job: "single highest-leverage root bottleneck",
        },
        {
          field: "section4_lifestyle",
          title: ANALYSIS_AI_SECTION_TITLES[3],
          job: "lifestyle interactions (not checklist dump)",
        },
        {
          field: "section5_one_change",
          title: ANALYSIS_AI_SECTION_TITLES[4],
          job: "one concrete low-friction first action",
        },
        {
          field: "section6_next_step",
          title: ANALYSIS_AI_SECTION_TITLES[5],
          job: "soft next-step priming only; no hard sell",
        },
      ],
      forbidden: [
        "Herbalife",
        "產品銷售",
        "事業機會",
        "21天方案",
        "購買",
        "立即加入",
        "醫療診斷",
      ],
    },
    null,
    2,
  );
}
