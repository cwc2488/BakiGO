import { describe, expect, it } from "vitest";
import {
  isOpenPublicPath,
  isPublicPath,
  normalizePathname,
  shouldRedirectAuthenticatedUser,
} from "./public-paths";

describe("public-paths", () => {
  it("treats privacy and data-deletion as open public paths", () => {
    expect(isOpenPublicPath("/privacy")).toBe(true);
    expect(isOpenPublicPath("/data-deletion")).toBe(true);
    expect(isOpenPublicPath("/meta-review")).toBe(true);
    expect(isOpenPublicPath("/privacy/")).toBe(true);
  });

  it("does not redirect authenticated users away from open public paths", () => {
    expect(shouldRedirectAuthenticatedUser("/privacy")).toBe(false);
    expect(shouldRedirectAuthenticatedUser("/data-deletion")).toBe(false);
    expect(shouldRedirectAuthenticatedUser("/meta-review")).toBe(false);
  });

  it("keeps login/register as auth public paths", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(shouldRedirectAuthenticatedUser("/login")).toBe(true);
    expect(isPublicPath("/daily-action")).toBe(false);
  });

  it("treats meta-review subpaths as open public paths", () => {
    expect(isOpenPublicPath("/meta-review/data-deletion-status")).toBe(true);
  });

  it("treats quiz icebreaker routes as open public paths", () => {
    expect(isOpenPublicPath("/quiz")).toBe(true);
    expect(isOpenPublicPath("/quiz/fat-loss")).toBe(true);
    expect(isOpenPublicPath("/quiz/fat-loss/start")).toBe(true);
    expect(isOpenPublicPath("/quiz/fat-loss/question/1")).toBe(true);
    expect(isOpenPublicPath("/quiz/fat-loss/result/abc-123")).toBe(true);
    expect(isOpenPublicPath("/quiz/fat-loss/next-step/abc-123")).toBe(true);
    expect(isOpenPublicPath("/q/ABC123")).toBe(true);
    expect(isOpenPublicPath("/q/fat-loss")).toBe(true);
    expect(isOpenPublicPath("/r/abcdefghijklmnopqrstuvwxyz0123456789ABC")).toBe(true);
    expect(isOpenPublicPath("/recognition/p/token-abc")).toBe(true);
    expect(isPublicPath("/quiz/manage")).toBe(false);
    expect(isPublicPath("/quiz/leads")).toBe(false);
    expect(isPublicPath("/quiz/hub")).toBe(false);
    expect(isPublicPath("/recognition")).toBe(false);
    expect(isPublicPath("/recognition/events/evt-1")).toBe(false);
    expect(isPublicPath("/recognition/events/evt-1/review")).toBe(false);
    expect(isPublicPath("/recognition/events/evt-1/photos")).toBe(false);
  });
});
