import { describe, expect, it } from "vitest";
import {
  GO21_CHAT_FOLLOW_RETRY_MS,
  computeScrollTopForLatest,
  isThreadFullyShowingLatest,
  programmaticScrollLockMs,
  resolveChatScrollStickState,
  resolveGo21ShellViewportHeightPx,
  shouldFollowOnAssistantArrival,
  shouldForceFollowOnSend,
} from "@/lib/go21/chat-scroll";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Go21 chat scroll follow", () => {
  it("computes bottom pin for tall threads", () => {
    expect(computeScrollTopForLatest({ scrollHeight: 2000, clientHeight: 640 })).toBe(1360);
    expect(computeScrollTopForLatest({ scrollHeight: 400, clientHeight: 640 })).toBe(0);
  });

  it("detects when latest is fully in view", () => {
    expect(
      isThreadFullyShowingLatest({
        scrollTop: 1360,
        scrollHeight: 2000,
        clientHeight: 640,
      }),
    ).toBe(true);
    expect(
      isThreadFullyShowingLatest({
        scrollTop: 900,
        scrollHeight: 2000,
        clientHeight: 640,
      }),
    ).toBe(false);
  });

  it("ignores programmatic scroll events so stick is not unlocked", () => {
    expect(
      resolveChatScrollStickState({
        programmatic: true,
        scrollTop: 0,
        scrollHeight: 2000,
        clientHeight: 640,
      }),
    ).toBeNull();
  });

  it("unlocks stick when user scrolls up intentionally", () => {
    expect(
      resolveChatScrollStickState({
        programmatic: false,
        scrollTop: 200,
        scrollHeight: 2000,
        clientHeight: 640,
        thresholdPx: 120,
      }),
    ).toEqual({ stick: false, showJump: true });
  });

  it("keeps stick near bottom", () => {
    expect(
      resolveChatScrollStickState({
        programmatic: false,
        scrollTop: 1300,
        scrollHeight: 2000,
        clientHeight: 640,
        thresholdPx: 120,
      }),
    ).toEqual({ stick: true, showJump: false });
  });

  it("send forces follow; assistant arrival respects stick", () => {
    expect(shouldForceFollowOnSend()).toBe(true);
    expect(shouldFollowOnAssistantArrival(true)).toBe(true);
    expect(shouldFollowOnAssistantArrival(false)).toBe(false);
  });

  it("retries after layout/image decode windows and prefers auto lock", () => {
    expect(GO21_CHAT_FOLLOW_RETRY_MS.length).toBeGreaterThanOrEqual(5);
    expect(GO21_CHAT_FOLLOW_RETRY_MS.some((ms) => ms >= 1000)).toBe(true);
    expect(programmaticScrollLockMs("auto")).toBeGreaterThanOrEqual(100);
  });

  it("uses visualViewport height for iPhone keyboard chrome", () => {
    expect(
      resolveGo21ShellViewportHeightPx({
        visualViewportHeight: 520.4,
        windowInnerHeight: 844,
      }),
    ).toBe(520);
    expect(
      resolveGo21ShellViewportHeightPx({
        visualViewportHeight: null,
        windowInnerHeight: 844,
      }),
    ).toBe(844);
  });

  it("chat UI uses fixed shell + chat panel; no scrollIntoView; observes composer", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/go21/Go21App.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/components/go21/go21.css"), "utf8");
    expect(css).toContain("go21-chat-panel");
    expect(css).toMatch(/--go21-vvh/);
    expect(css).toMatch(/min-height:\s*0/);
    expect(css).toMatch(/\.go21-composer[\s\S]*flex-shrink:\s*0/);
    expect(src).toContain("threadContentRef");
    expect(src).toContain("composerRef");
    expect(src).toContain("schedulePinToLatest");
    expect(src).toContain("resolveGo21ShellViewportHeightPx");
    expect(src).toContain('addEventListener("load"');
    expect(src).not.toMatch(/\.scrollIntoView\s*\(/);
    expect(src).toContain("Never use scrollIntoView");
    expect(src).toContain("shouldFollowOnAssistantArrival");
    expect(src).toMatch(/setPendingUser[\s\S]{0,240}followLatestConversation/);
  });
});
