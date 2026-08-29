import { isChatNearBottom } from "@/lib/go21/coach-context";

/** Delays (ms) to re-pin after layout / image decode on mobile. */
export const GO21_CHAT_FOLLOW_RETRY_MS = [0, 50, 120, 280, 600, 1100] as const;

/** Keep ignore-window long enough for smooth scroll + Safari rubber-band events. */
export function programmaticScrollLockMs(behavior: ScrollBehavior): number {
  return behavior === "smooth" ? 900 : 220;
}

/**
 * After a user scroll event: update stick/jump, or ignore if we caused the scroll.
 * Returns null when the event should be ignored.
 */
export function resolveChatScrollStickState(input: {
  programmatic: boolean;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  thresholdPx?: number;
}): { stick: boolean; showJump: boolean } | null {
  if (input.programmatic) return null;
  const near = isChatNearBottom({
    scrollTop: input.scrollTop,
    scrollHeight: input.scrollHeight,
    clientHeight: input.clientHeight,
    thresholdPx: input.thresholdPx ?? 120,
  });
  return { stick: near, showJump: !near };
}

/** Customer send always re-engages follow; AI arrival only follows if still sticking. */
export function shouldForceFollowOnSend(): boolean {
  return true;
}

export function shouldFollowOnAssistantArrival(stickToBottom: boolean): boolean {
  return stickToBottom;
}

/**
 * Target scrollTop so the newest content sits at the bottom of the viewport.
 * Clamped for short threads.
 */
export function computeScrollTopForLatest(input: {
  scrollHeight: number;
  clientHeight: number;
}): number {
  return Math.max(0, input.scrollHeight - input.clientHeight);
}

export function isThreadFullyShowingLatest(input: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  slackPx?: number;
}): boolean {
  const slack = input.slackPx ?? 8;
  const target = computeScrollTopForLatest(input);
  return input.scrollTop >= target - slack;
}
