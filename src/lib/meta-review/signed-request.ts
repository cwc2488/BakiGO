import { createHmac, timingSafeEqual } from "crypto";
import { requireMetaReviewConfig } from "./config";

export type MetaSignedRequestPayload = {
  algorithm?: string;
  expires?: number;
  issued_at?: number;
  user_id?: string;
  profile_id?: string;
};

function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, "base64");
}

export function parseMetaSignedRequest(
  signedRequest: string,
  appSecret: string,
): MetaSignedRequestPayload | null {
  const [encodedSignature, payload] = signedRequest.split(".", 2);
  if (!encodedSignature || !payload) {
    return null;
  }

  let signature: Buffer;
  try {
    signature = decodeBase64Url(encodedSignature);
  } catch {
    return null;
  }

  const expectedSignature = createHmac("sha256", appSecret).update(payload).digest();
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(signature, expectedSignature)
  ) {
    return null;
  }

  let data: MetaSignedRequestPayload;
  try {
    data = JSON.parse(decodeBase64Url(payload).toString("utf8")) as MetaSignedRequestPayload;
  } catch {
    return null;
  }

  if (data.algorithm?.toUpperCase() !== "HMAC-SHA256") {
    return null;
  }

  return data;
}

export function parseMetaSignedRequestFromConfig(signedRequest: string) {
  const { appSecret } = requireMetaReviewConfig();
  return parseMetaSignedRequest(signedRequest, appSecret);
}

export function extractMetaUserId(payload: MetaSignedRequestPayload | null): string | null {
  if (!payload) {
    return null;
  }
  if (typeof payload.user_id === "string" && payload.user_id.length > 0) {
    return payload.user_id;
  }
  if (typeof payload.profile_id === "string" && payload.profile_id.length > 0) {
    return payload.profile_id;
  }
  return null;
}

export function createDeletionConfirmationCode(): string {
  return `BG${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
