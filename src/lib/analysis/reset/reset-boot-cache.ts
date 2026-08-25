import type { ResetPublicView } from "@/lib/analysis/reset/reset-contract";

const BOOT_PREFIX = "baki:reset-boot:";

function bootKey(token: string) {
  return `${BOOT_PREFIX}${token}`;
}

/** Stash first-question experience from session create so /analysis can paint Q1 without a second round trip. */
export function stashResetBootExperience(token: string, experience: ResetPublicView): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(bootKey(token), JSON.stringify(experience));
  } catch {
    /* private mode / quota — navigation still works via GET reload */
  }
}

export function takeResetBootExperience(token: string): ResetPublicView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(bootKey(token));
    if (!raw) return null;
    sessionStorage.removeItem(bootKey(token));
    const parsed = JSON.parse(raw) as ResetPublicView;
    if (
      parsed?.kind === "reset" &&
      parsed.act === "quiz" &&
      parsed.quiz?.question?.id &&
      Array.isArray(parsed.quiz.question.options)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
