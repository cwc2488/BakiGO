export const INTERVIEW_WAIT_COPY_EARLY = "我在整理你剛剛說的…";
export const INTERVIEW_WAIT_COPY_LATE = "這句很重要，我再抓一下真正卡住你的地方。";

export type InterviewWaitPhase = "ack" | "early" | "late";

export function interviewWaitCopy(elapsedMs: number): { phase: InterviewWaitPhase; text: string | null } {
  if (elapsedMs < 1000) return { phase: "ack", text: null };
  if (elapsedMs < 4000) return { phase: "early", text: INTERVIEW_WAIT_COPY_EARLY };
  return { phase: "late", text: INTERVIEW_WAIT_COPY_LATE };
}
