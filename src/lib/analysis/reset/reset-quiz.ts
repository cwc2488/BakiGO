import type { PersonalityType } from "@/lib/quiz/fat-loss/types";
import {
  RESET_ANIMAL_COPY,
  RESET_ANIMAL_MECHANISM,
  type ResetAnimalCopy,
} from "@/lib/analysis/reset/reset-animals";

export const RESET_QUIZ_VERSION = "reset_quiz_v2" as const;

export const RESET_QUIZ_TYPES: PersonalityType[] = ["A", "B", "C", "D", "E", "F"];

export type ResetQuizOption = {
  id: string;
  label: string;
  semanticType: PersonalityType;
  /** Alias of semanticType. Not a display position. */
  type: PersonalityType;
};

export type ResetQuizQuestion = {
  id: string;
  number: number;
  dimension: string;
  text: string;
  support?: string;
  displayOrder: PersonalityType[];
  options: ResetQuizOption[];
};

type ScorePair = { primary: PersonalityType; secondary: PersonalityType };

/** primary +2 / secondary +1. Keyed by question then selected semantic type. */
export const RESET_QUIZ_V2_MATRIX: Record<string, Record<PersonalityType, ScorePair>> = {
  Q1: {
    A: { primary: "A", secondary: "B" },
    B: { primary: "B", secondary: "C" },
    C: { primary: "C", secondary: "D" },
    D: { primary: "D", secondary: "E" },
    E: { primary: "E", secondary: "F" },
    F: { primary: "F", secondary: "A" },
  },
  Q2: {
    A: { primary: "A", secondary: "C" },
    B: { primary: "B", secondary: "D" },
    C: { primary: "C", secondary: "E" },
    D: { primary: "D", secondary: "F" },
    E: { primary: "E", secondary: "A" },
    F: { primary: "F", secondary: "B" },
  },
  Q3: {
    A: { primary: "A", secondary: "D" },
    B: { primary: "B", secondary: "E" },
    C: { primary: "C", secondary: "F" },
    D: { primary: "D", secondary: "A" },
    E: { primary: "E", secondary: "B" },
    F: { primary: "F", secondary: "C" },
  },
  Q4: {
    A: { primary: "A", secondary: "E" },
    B: { primary: "B", secondary: "F" },
    C: { primary: "C", secondary: "A" },
    D: { primary: "D", secondary: "B" },
    E: { primary: "E", secondary: "C" },
    F: { primary: "F", secondary: "D" },
  },
  Q5: {
    A: { primary: "A", secondary: "F" },
    B: { primary: "B", secondary: "A" },
    C: { primary: "C", secondary: "B" },
    D: { primary: "D", secondary: "C" },
    E: { primary: "E", secondary: "D" },
    F: { primary: "F", secondary: "E" },
  },
  Q6: {
    A: { primary: "A", secondary: "C" },
    B: { primary: "B", secondary: "D" },
    C: { primary: "C", secondary: "E" },
    D: { primary: "D", secondary: "F" },
    E: { primary: "E", secondary: "A" },
    F: { primary: "F", secondary: "B" },
  },
};

const DISPLAY_ORDER: Record<string, PersonalityType[]> = {
  Q1: ["E", "A", "D", "F", "B", "C"],
  Q2: ["D", "B", "F", "A", "C", "E"],
  Q3: ["D", "A", "F", "B", "E", "C"],
  Q4: ["C", "E", "A", "F", "D", "B"],
  Q5: ["F", "B", "D", "A", "E", "C"],
  Q6: ["E", "C", "B", "F", "A", "D"],
};

function option(
  questionId: string,
  semanticType: PersonalityType,
  label: string,
): ResetQuizOption {
  return {
    id: `${questionId}_${semanticType}`,
    label,
    semanticType,
    type: semanticType,
  };
}

function question(input: {
  id: string;
  number: number;
  dimension: string;
  text: string;
  support?: string;
  labels: Record<PersonalityType, string>;
}): ResetQuizQuestion {
  const displayOrder = DISPLAY_ORDER[input.id]!;
  return {
    id: input.id,
    number: input.number,
    dimension: input.dimension,
    text: input.text,
    support: input.support,
    displayOrder,
    options: displayOrder.map((semanticType) => option(input.id, semanticType, input.labels[semanticType])),
  };
}

/** Fixed 6-question V2 mechanism quiz. Deterministic. No GPT. */
export const RESET_QUIZ_QUESTIONS: ResetQuizQuestion[] = [
  question({
    id: "Q1",
    number: 1,
    dimension: "stress_regulation",
    text: "你原本打算今天好好顧一下自己的體態，但忙了一整天，終於有自己的時間。這時候，你通常會怎麼做？",
    labels: {
      A: "今天夠辛苦了，先做點讓自己開心的事吧。",
      B: "今天就算了，明天狀態好一點再開始。",
      C: "不行，今天已經亂掉了，明天一定要全部拉回來。",
      D: "我會開始想，到底怎麼安排才是最有效的方法？",
      E: "老實說，我現在連想都不太想想，只想休息。",
      F: "基本上還是會照原本節奏，只是會把今天做不到的部分調整掉。",
    },
  }),
  question({
    id: "Q2",
    number: 2,
    dimension: "intention_to_action",
    text: "某天你突然很想把體態顧好，接下來你最可能怎麼做？",
    labels: {
      A: "先想辦法找一種「不用犧牲太多生活樂趣」的方法。",
      B: "會想很多，但通常還要等一個比較適合開始的時間。",
      C: "馬上訂一個很完整的計畫，飲食、運動一次全部來。",
      D: "先大量查資料、比較方法，確定哪一套比較適合自己。",
      E: "第一個想到的是：「我現在的生活到底哪有時間做這些？」",
      F: "先看自己目前已經做到哪裡，再找最值得調整的一兩件事。",
    },
  }),
  question({
    id: "Q3",
    number: 3,
    dimension: "failure_recovery",
    text: "你已經認真控制一週，結果今晚真的吃爆了。隔天早上，你腦中最容易出現哪一句？",
    labels: {
      A: "最近真的太累了，昨天至少讓自己舒服了一下。",
      B: "算了，下週一再重新開始好了。",
      C: "都破功了，乾脆這幾天吃完，再重新認真一次。",
      D: "我想先搞清楚昨天到底是哪個環節出了問題。",
      E: "我現在連生活都快顧不好了，真的沒力氣再管這些。",
      F: "一餐而已，今天照原本節奏繼續。",
    },
  }),
  question({
    id: "Q4",
    number: 4,
    dimension: "plateau_response",
    text: "你努力了一陣子，但成果突然停住了。你的第一反應比較像？",
    labels: {
      A: "都努力這麼久了，偶爾享受一下也沒關係吧。",
      B: "可能最近不是好時機，等狀態好一點再說。",
      C: "看來做得還不夠，我要再更嚴格一點。",
      D: "一定是哪裡有問題，我會開始查資料、比較方法。",
      E: "我已經很累了，看到沒成果更不想動。",
      F: "先找出現在真正限制成果的那一個環節。",
    },
  }),
  question({
    id: "Q5",
    number: 5,
    dimension: "real_life_conflict",
    text: "假設你已經決定這個月要認真改變，但突然進入非常忙的兩週，你最可能？",
    labels: {
      A: "保留一些讓自己舒服的東西，不然真的撐不下去。",
      B: "覺得既然現在做不好，不如忙完再正式開始。",
      C: "前面還是硬撐原計畫，一旦撐不住就很容易整個掉下來。",
      D: "重新研究有沒有更適合忙碌生活的方法。",
      E: "很多事情不是不想做，而是真的已經沒有時間和精神。",
      F: "主動把計畫縮小，但留下最重要的最低標準。",
    },
  }),
  question({
    id: "Q6",
    number: 6,
    dimension: "self_recognition",
    text: "如果有人看完你過去幾次想改變體態的過程，你最怕他對你說哪一句？",
    support: "選最讓你有「被說中了」感覺的那一句。",
    labels: {
      A: "你其實每次難受的時候，都需要靠一些東西讓自己好過一點。",
      B: "你一直在等那個真正準備好的自己出現。",
      C: "你每次都太用力，所以才一次又一次撐不久。",
      D: "你花了很多力氣找答案，但可能一直沒有真正開始做最重要的事。",
      E: "不是你不想改，是你的生活早就把你的能量用光了。",
      F: "你其實已經做對很多事，只是一直沒有找到真正限制你的那個點。",
    },
  }),
];

export type ResetQuizScores = Record<PersonalityType, number>;

export type ResetQuizEvidence = {
  question: string;
  primary: PersonalityType;
  secondary: PersonalityType;
};

export type ResetQuizAnswerRecord = {
  questionId: string;
  selectedOptionId: string;
  semanticType: PersonalityType;
  primaryType: PersonalityType;
  secondaryType: PersonalityType;
};

export type ResetQuizTiePath = "score" | "primaryHits" | "q6" | "recent_primary" | "recent_secondary";

export type ResetQuizV2Result = {
  scores: ResetQuizScores;
  primaryHits: ResetQuizScores;
  primaryType: PersonalityType;
  secondaryType: PersonalityType;
  winner: PersonalityType;
  evidence: ResetQuizEvidence[];
  answers: ResetQuizAnswerRecord[];
  tieBreak: { primaryPath: ResetQuizTiePath; secondaryPath: ResetQuizTiePath };
};

export function emptyResetScores(): ResetQuizScores {
  return { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
}

export type ResetQuizAnswerInput = {
  questionId: string;
  optionId?: string;
  selectedOptionId?: string;
};

function selectedId(answer: ResetQuizAnswerInput): string | undefined {
  return answer.selectedOptionId ?? answer.optionId;
}

export function resolveResetQuizAnswer(answer: ResetQuizAnswerInput): ResetQuizAnswerRecord | null {
  const question = RESET_QUIZ_QUESTIONS.find((q) => q.id === answer.questionId);
  const id = selectedId(answer);
  const optionRow = question?.options.find((o) => o.id === id);
  if (!question || !optionRow) return null;
  const pair = RESET_QUIZ_V2_MATRIX[question.id]![optionRow.semanticType];
  return {
    questionId: question.id,
    selectedOptionId: optionRow.id,
    semanticType: optionRow.semanticType,
    primaryType: pair.primary,
    secondaryType: pair.secondary,
  };
}

export function pickResetQuizType(
  scores: ResetQuizScores,
  primaryHits: ResetQuizScores,
  evidence: ResetQuizEvidence[],
  exclude?: PersonalityType,
): { type: PersonalityType; path: ResetQuizTiePath } {
  const pool = RESET_QUIZ_TYPES.filter((type) => type !== exclude);
  const maxScore = Math.max(...pool.map((type) => scores[type]));
  let tied = pool.filter((type) => scores[type] === maxScore);
  if (tied.length === 1) return { type: tied[0]!, path: "score" };

  const maxHits = Math.max(...tied.map((type) => primaryHits[type]));
  tied = tied.filter((type) => primaryHits[type] === maxHits);
  if (tied.length === 1) return { type: tied[0]!, path: "primaryHits" };

  const q6 = evidence.find((row) => row.question === "Q6");
  if (q6 && tied.includes(q6.primary)) return { type: q6.primary, path: "q6" };

  for (const questionId of ["Q5", "Q4", "Q3", "Q2", "Q1"] as const) {
    const row = evidence.find((item) => item.question === questionId);
    if (row && tied.includes(row.primary)) return { type: row.primary, path: "recent_primary" };
  }

  for (const questionId of ["Q6", "Q5", "Q4", "Q3", "Q2", "Q1"] as const) {
    const row = evidence.find((item) => item.question === questionId);
    if (row && tied.includes(row.secondary)) return { type: row.secondary, path: "recent_secondary" };
  }

  throw new Error("reset_quiz_v2_tie_unresolved");
}

export function scoreResetQuiz(answers: ResetQuizAnswerInput[]): ResetQuizV2Result {
  const scores = emptyResetScores();
  const primaryHits = emptyResetScores();
  const resolved: ResetQuizAnswerRecord[] = [];
  const evidence: ResetQuizEvidence[] = [];

  for (const answer of answers) {
    const row = resolveResetQuizAnswer(answer);
    if (!row) continue;
    scores[row.primaryType] += 2;
    scores[row.secondaryType] += 1;
    primaryHits[row.primaryType] += 1;
    resolved.push(row);
    evidence.push({
      question: row.questionId,
      primary: row.primaryType,
      secondary: row.secondaryType,
    });
  }

  const primaryPick = pickResetQuizType(scores, primaryHits, evidence);
  const secondaryPick = pickResetQuizType(scores, primaryHits, evidence, primaryPick.type);

  return {
    scores,
    primaryHits,
    primaryType: primaryPick.type,
    secondaryType: secondaryPick.type,
    winner: primaryPick.type,
    evidence,
    answers: resolved,
    tieBreak: { primaryPath: primaryPick.path, secondaryPath: secondaryPick.path },
  };
}

export type ResetQuizHandoff = {
  source: "reset_quiz_v2";
  authority: "unverified_hypothesis";
  primary: { code: PersonalityType; mechanism: string; score: number };
  secondary: { code: PersonalityType; mechanism: string; score: number };
  evidence: ResetQuizEvidence[];
};

export function buildResetQuizHandoff(result: ResetQuizV2Result): ResetQuizHandoff {
  return {
    source: RESET_QUIZ_VERSION,
    authority: "unverified_hypothesis",
    primary: {
      code: result.primaryType,
      mechanism: RESET_ANIMAL_MECHANISM[result.primaryType],
      score: result.scores[result.primaryType],
    },
    secondary: {
      code: result.secondaryType,
      mechanism: RESET_ANIMAL_MECHANISM[result.secondaryType],
      score: result.scores[result.secondaryType],
    },
    evidence: result.evidence,
  };
}

export function compactQuizBackground(result: ResetQuizV2Result | ResetAnimalCopy): string {
  if ("primaryType" in result && "scores" in result) {
    return [
      "UNVERIFIED HYPOTHESIS ONLY. Spoken user evidence outranks this completely.",
      JSON.stringify(buildResetQuizHandoff(result)),
    ].join("\n");
  }
  return [
    "UNVERIFIED HYPOTHESIS ONLY. Spoken user evidence outranks this completely.",
    JSON.stringify({
      source: RESET_QUIZ_VERSION,
      authority: "unverified_hypothesis",
      primary: {
        code: result.type,
        mechanism: RESET_ANIMAL_MECHANISM[result.type],
      },
    }),
  ].join("\n");
}

export function animalCopyFor(type: PersonalityType): ResetAnimalCopy {
  return RESET_ANIMAL_COPY[type];
}

export type ResetQuizV2Distribution = {
  total: number;
  primaryCounts: ResetQuizScores;
  primaryPercent: Record<PersonalityType, number>;
  pairCounts: Record<string, number>;
  tieFrequency: number;
  tieBreakPaths: Record<ResetQuizTiePath, number>;
  q6TieUsage: number;
  maxShare: number;
  minShare: number;
  shareSpread: number;
};

export function enumerateResetQuizV2Distribution(): ResetQuizV2Distribution {
  const primaryCounts = emptyResetScores();
  const pairCounts: Record<string, number> = {};
  const tieBreakPaths: Record<ResetQuizTiePath, number> = {
    score: 0,
    primaryHits: 0,
    q6: 0,
    recent_primary: 0,
    recent_secondary: 0,
  };
  let tieFrequency = 0;
  let q6TieUsage = 0;
  const total = 6 ** 6;
  const semanticAt: PersonalityType[][] = RESET_QUIZ_QUESTIONS.map((question) =>
    question.options.map((row) => row.semanticType),
  );

  for (let n = 0; n < total; n++) {
    let x = n;
    const answers: ResetQuizAnswerInput[] = [];
    for (let q = 0; q < 6; q++) {
      const index = x % 6;
      x = Math.floor(x / 6);
      const question = RESET_QUIZ_QUESTIONS[q]!;
      const semanticType = semanticAt[q]![index]!;
      answers.push({ questionId: question.id, optionId: `${question.id}_${semanticType}` });
    }
    const scored = scoreResetQuiz(answers);
    primaryCounts[scored.primaryType] += 1;
    const pair = `${scored.primaryType}/${scored.secondaryType}`;
    pairCounts[pair] = (pairCounts[pair] ?? 0) + 1;
    tieBreakPaths[scored.tieBreak.primaryPath] += 1;
    if (scored.tieBreak.primaryPath !== "score") tieFrequency += 1;
    if (scored.tieBreak.primaryPath === "q6") q6TieUsage += 1;
  }

  const percents = Object.fromEntries(
    RESET_QUIZ_TYPES.map((type) => [type, (primaryCounts[type] / total) * 100]),
  ) as Record<PersonalityType, number>;
  const shares = RESET_QUIZ_TYPES.map((type) => percents[type]);
  const maxShare = Math.max(...shares);
  const minShare = Math.min(...shares);

  return {
    total,
    primaryCounts,
    primaryPercent: percents,
    pairCounts,
    tieFrequency,
    tieBreakPaths,
    q6TieUsage,
    maxShare,
    minShare,
    shareSpread: maxShare - minShare,
  };
}
