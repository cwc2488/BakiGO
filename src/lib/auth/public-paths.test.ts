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
    expect(isOpenPublicPath("/privacy/")).toBe(true);
  });

  it("does not redirect authenticated users away from open public paths", () => {
    expect(shouldRedirectAuthenticatedUser("/privacy")).toBe(false);
    expect(shouldRedirectAuthenticatedUser("/data-deletion")).toBe(false);
  });

  it("keeps login/register as auth public paths", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(shouldRedirectAuthenticatedUser("/login")).toBe(true);
    expect(isPublicPath("/daily-action")).toBe(false);
  });

  it("normalizes trailing slashes", () => {
    expect(normalizePathname("/privacy/")).toBe("/privacy");
  });
});
