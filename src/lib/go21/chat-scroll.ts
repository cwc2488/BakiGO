import { isChatNearBottom } from "@/lib/go21/coach-context";
import { shouldShowJumpToLatest } from "@/lib/go21/coach-intent";

/** Delays (ms) to re-pin after layout / image decode on mobile Safari. */
export const GO21_CHAT_FOLLOW_RETRY_MS = [0, 32, 80, 160, 320, 640, 1200, 2000] as const;

/** Prefer auto on iPhone — smooth often undershoots before layout settles. */
export function programmaticScrollLockMs(behavior: ScrollBehavior): number {
  return behavior === "smooth" ? 700 : 180;
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
  const stick = near;
  return {
    stick,
    showJump: shouldShowJumpToLatest({
      stickToBottom: stick,
      scrollTop: input.scrollTop,
      scrollHeight: input.scrollHeight,
      clientHeight: input.clientHeight,
      thresholdPx: input.thresholdPx ?? 120,
    }),
  };
}

/** Customer send always re-engages follow; AI arrival only follows if still sticking. */
export function shouldForceFollowOnSend(): boolean {
  return true;
}

export function shouldFollowOnAssistantArrival(stickToBottom: boolean): boolean {
  return stickToBottom;
}

/**
 * Target scrollTop so the newest content sits at the bottom of the thread viewport.
 * Thread must be the only scrollport (composer is a flex sibling, not an overlay).
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

/**
 * CSS pixel height for the Go21 shell from visualViewport when available.
 * Keeps the composer inside the visible iPhone viewport when the keyboard opens.
 */
export function resolveGo21ShellViewportHeightPx(input: {
  visualViewportHeight: number | null | undefined;
  windowInnerHeight: number;
}): number {
  const vv = input.visualViewportHeight;
  if (typeof vv === "number" && Number.isFinite(vv) && vv > 0) {
    return Math.round(vv);
  }
  return Math.round(input.windowInnerHeight);
}
