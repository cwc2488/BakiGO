import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  createDeletionConfirmationCode,
  parseMetaSignedRequest,
} from "./signed-request";

const APP_SECRET = "test-app-secret";

function buildSignedRequest(payload: Record<string, unknown>, secret = APP_SECRET): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

describe("signed-request", () => {
  it("parses a valid signed_request", () => {
    const signedRequest = buildSignedRequest({
      algorithm: "HMAC-SHA256",
      issued_at: 1_291_836_800,
      user_id: "1234567",
    });

    const parsed = parseMetaSignedRequest(signedRequest, APP_SECRET);
    expect(parsed?.user_id).toBe("1234567");
  });

  it("rejects invalid signatures", () => {
    const signedRequest = buildSignedRequest({ algorithm: "HMAC-SHA256", user_id: "1" }, "wrong");
    expect(parseMetaSignedRequest(signedRequest, APP_SECRET)).toBeNull();
  });

  it("creates alphanumeric confirmation codes", () => {
    const code = createDeletionConfirmationCode();
    expect(code).toMatch(/^BG[A-Z0-9]+$/);
  });
});
