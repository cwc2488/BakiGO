/** Client-only UX copy. Does not claim diagnosis or expose AI Core terms. */

export const QUIZ_INTERPRET_LINES = [
  "正在理解你的選擇",
  "正在和前面的答案一起比對",
  "正在決定下一題是否還值得問",
  "正在形成你的個人輪廓",
] as const;

export const QUIZ_GENERATE_LINES = [
  "正在決定下一題是否還值得問",
  "正在形成你的個人輪廓",
] as const;

export const REVEAL_SECTION_TITLES = [
  "AI 最先注意到的你",
  "你真正想改變的原因",
  "真正讓你卡住的地方",
  "你最容易失敗的時刻",
  "適合你的改變方式",
  "現在最值得做的一件事",
] as const;

export const CORRECTION_HINT_RE = /其實不是|真正是|我比較在意/;

export function quizExploreKicker(step: number): string {
  if (step >= 6) return "差不多抓到你的模式了";
  return "正在慢慢看懂你";
}

export function quizThinkCopy(elapsedMs: number, _salt = 0): string {
  if (elapsedMs < 800) return "";
  if (elapsedMs < 2200) return QUIZ_INTERPRET_LINES[0]!;
  if (elapsedMs < 3600) return QUIZ_INTERPRET_LINES[1]!;
  if (elapsedMs < 5200) return QUIZ_INTERPRET_LINES[2]!;
  return QUIZ_INTERPRET_LINES[3]!;
}

export function looksLikeUserCorrection(text: string): boolean {
  return CORRECTION_HINT_RE.test(text.trim());
}
