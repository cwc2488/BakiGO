import { describe, expect, it } from "vitest";
import { sanitizeErrorMessage, parseThreadsGraphError } from "./sanitize-error";

describe("sanitize-error", () => {
  it("redacts access tokens from error messages", () => {
    const message = "Invalid OAuth access token - Cannot parse access token access_token=EAABxx123";
    expect(sanitizeErrorMessage(message)).not.toContain("EAABxx123");
  });

  it("extracts graph api error messages", () => {
    const message = parseThreadsGraphError({
      error: {
        message: "Unsupported get request.",
        type: "GraphMethodException",
      },
    });
    expect(message).toBe("Unsupported get request.");
  });
});
