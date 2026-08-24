import type { InsightTurn } from "@/lib/analysis/interview/insight/insight-contract";

const MEDICAL_COACHING_RE =
  /改善血糖|控制血糖|血糖.{0,16}(飲食|運動|改善|控制)|怎麼控制血糖|如何改善血糖|治療.{0,10}(血糖|紅字)|給你.{0,8}(藥|處方)|你有糖尿病|確診你|這代表你生病/;

export function isStackedInterrogation(text: string): boolean {
  const marks = (text.match(/[？?]/g) || []).length;
  if (marks >= 3) return true;
  if (marks >= 2 && !/還是|或者/.test(text)) return true;
  return /為什麼.{0,24}[？?].{0,8}(以前|試過|現在).{0,24}[？?]/.test(text);
}

export type InsightViolation = "unsafe_medical" | "stacked_interrogation";

export function validateInsightTurn(turn: InsightTurn): {
  ok: boolean;
  violations: InsightViolation[];
} {
  const visible = turn.assistant_response || "";
  const violations: InsightViolation[] = [];
  if (MEDICAL_COACHING_RE.test(visible)) violations.push("unsafe_medical");
  if (isStackedInterrogation(visible)) violations.push("stacked_interrogation");
  return { ok: violations.length === 0, violations: [...new Set(violations)] };
}

export function stripUnsafeMedicalCopy(text: string): string {
  return text
    .replace(/你有糖尿病[^。！]*[。！]?/g, "")
    .replace(/確診你[^。！]*[。！]?/g, "")
    .replace(/給你.{0,8}(藥|處方)[^。！]*[。！]?/g, "")
    .trim();
}

/** Observation only. Never used to rewrite or fail a turn. */
export function looksLikeParaphraseOnly(userText: string, assistantText: string): boolean {
  const user = compactChars(userText);
  const visible = compactChars(assistantText);
  if (user.length < 2 || visible.length < 8) return false;
  if (visible.includes(user) && visible.length < user.length + 18) return true;
  const overlap = jaccard(user, visible);
  return overlap >= 0.72 && !/所以|真正|但我不|矛盾|假設|懷疑|不是X|不是.*而是/.test(assistantText);
}

function compactChars(text: string): string {
  return text.replace(/[\s，。、．.！!？?「」『』]/g, "");
}

function jaccard(a: string, b: string): number {
  const sa = new Set([...a]);
  const sb = new Set([...b]);
  let inter = 0;
  for (const ch of sa) if (sb.has(ch)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}
