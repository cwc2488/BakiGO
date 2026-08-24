import type { QuizTurnOutput } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";

export type QuizViolation =
  | "too_few_options"
  | "too_many_options"
  | "jargon_options"
  | "exposed_model"
  | "medical_overreach"
  | "repeated_meaning"
  | "empty_question"
  | "missing_prior"
  | "low_information"
  | "decision_mismatch"
  | "no_information_gain";

const JARGON_RE =
  /外在動機|內在動機|執行障礙|環境因素|自我效能|認知行為|心理防衛|依附風格|酬賞迴路|行為改變階段/;
const MODEL_LEAK_RE = /hypothesis|barrier_type|motivation_type|scoring|schema|UNVERIFIED|reasoning_tag/;
const MEDICAL_RE = /診斷你|你有糖尿病|改善血糖|控制血糖|給你.{0,8}(藥|處方)|治療.{0,8}(血糖|紅字)|解讀.{0,6}(檢驗|紅字)/;

const TRIVIA_RE =
  /哪種材質|什麼材質|衣服款式|避開哪些款式|避開哪些材質|喜歡的款式|巧克力還是|蛋糕還是|哪種零食|薯片還是|哪家餐廳|外送平台|重訓還是有氧|瑜伽還是|喜歡什麼類型的運動/;

export function lacksMaterialInformationGain(output: QuizTurnOutput, answeredCount: number): boolean {
  if (output.decision === "complete" || output.action === "complete") return false;
  if (answeredCount < 6) return false;
  const ig = output.information_gain;
  if (!ig) return true;
  if (ig.material_change !== true) return true;
  if ((ig.plausible_answers ?? []).length < 2) return true;
  if ((ig.change_dimensions ?? []).length === 0) return true;
  return false;
}

export function isLowInformationQuestion(output: QuizTurnOutput, answeredCount = 5): boolean {
  if (output.decision === "complete" || output.action === "complete") return false;
  const blob = `${output.question} ${output.options.map((o) => o.label).join(" ")}`;
  if (TRIVIA_RE.test(blob)) return true;
  if (lacksMaterialInformationGain(output, answeredCount)) return true;
  return false;
}

/** Generic question-template stripping. Not topic-specific. */
export function quizQuestionCore(question: string): string {
  return question
    .replace(/[？?！!，,。.\s]/g, "")
    .replace(
      /當你|當您|如果你|如果|遇到|面對|碰到|的時候|時候|時你|時會|怎麼辦|如何應對|如何|會怎麼|怎樣|什麼|哪些|哪種|你會|你是|你覺得|通常|一般|比較會|那你|的話/g,
      "",
    );
}

export function intentsAreSemanticDuplicates(
  a: { question: string; target?: string | null; hypothesisTargets?: string[] | null },
  b: { question: string; target?: string | null; hypothesisTargets?: string[] | null },
): boolean {
  const qa = quizQuestionCore(a.question);
  const qb = quizQuestionCore(b.question);
  const shorter = qa.length <= qb.length ? qa : qb;
  const longer = qa.length > qb.length ? qa : qb;
  if (qa && qb && qa === qb && qa.length >= 3) return true;
  // Shorter core ≥4 so a contained stem still counts as the same ask intent.
  if (shorter.length >= 4 && longer.includes(shorter)) return true;
  if (qa.length >= 6 && qb.length >= 6 && charJaccard(qa, qb) >= 0.72) return true;
  const ta = (a.target || "").replace(/\s+/g, "");
  const tb = (b.target || "").replace(/\s+/g, "");
  if (isSpecificInformationTarget(ta) && isSpecificInformationTarget(tb) && (ta === tb || ta.includes(tb) || tb.includes(ta))) {
    return true;
  }
  return false;
}

function isSpecificInformationTarget(target: string): boolean {
  if (target.length < 6) return false;
  if (target === "分辨動機或卡點" || target === "準備度" || target === "分辨準備度") return false;
  return true;
}

function charJaccard(a: string, b: string): number {
  const sa = new Set([...a]);
  const sb = new Set([...b]);
  let inter = 0;
  for (const ch of sa) if (sb.has(ch)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function validateQuizTurn(input: {
  output: QuizTurnOutput;
  previousQuestions: string[];
  previousAsked?: Array<{
    question: string;
    informationGain?: { target?: string } | null;
    hypothesis_targets?: string[];
  }>;
  answeredCount: number;
  min: number;
}): { ok: boolean; violations: QuizViolation[] } {
  const violations: QuizViolation[] = [];
  const q = input.output.question.trim();
  const options = input.output.options ?? [];
  const labels = options.map((o) => o.label).join(" ");
  const blob = `${q} ${labels}`;
  const asking = input.output.action === "ask" || input.output.decision === "continue";

  if (input.output.action === "ask" && input.output.decision === "complete") {
    violations.push("decision_mismatch");
  }
  if (input.output.action === "complete" && input.output.decision === "continue") {
    violations.push("decision_mismatch");
  }

  if (asking && input.output.action === "ask") {
    if (!q) violations.push("empty_question");
    if (options.length < 3) violations.push("too_few_options");
    if (options.length > 6) violations.push("too_many_options");
    if (JARGON_RE.test(blob)) violations.push("jargon_options");
    if (MODEL_LEAK_RE.test(blob)) violations.push("exposed_model");
    if (MEDICAL_RE.test(blob)) violations.push("medical_overreach");
    const normalized = q.replace(/\s+/g, "");
    if (input.previousQuestions.some((prev) => prev.replace(/\s+/g, "") === normalized)) {
      violations.push("repeated_meaning");
    }
    const currentIntent = {
      question: q,
      target: input.output.information_gain?.target ?? "",
      hypothesisTargets: input.output.hypothesis_targets ?? [],
    };
    const previous = (input.previousAsked ?? []).map((row) => ({
      question: row.question,
      target: row.informationGain?.target ?? "",
      hypothesisTargets: row.hypothesis_targets ?? [],
    }));
    if (previous.some((prev) => intentsAreSemanticDuplicates(currentIntent, prev))) {
      violations.push("repeated_meaning");
    }
    if (TRIVIA_RE.test(blob)) violations.push("low_information");
    if (lacksMaterialInformationGain(input.output, input.answeredCount)) {
      violations.push("no_information_gain");
    }
  }
  if (input.output.action === "complete") {
    if (!input.output.quiz_prior?.unverified) violations.push("missing_prior");
    if (input.answeredCount < input.min) violations.push("empty_question");
  }
  if (MEDICAL_RE.test(JSON.stringify(input.output.quiz_prior ?? {}))) {
    violations.push("medical_overreach");
  }
  return { ok: violations.length === 0, violations: [...new Set(violations)] };
}

export function publicOptionsOnly(options: Array<{ id: string; label: string }>) {
  return options.map((o, i) => ({
    id: o.id.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24) || `opt_${i + 1}`,
    label: o.label.trim(),
  }));
}
