import { NextResponse } from "next/server";
import { isMetaReviewConfigured } from "@/lib/meta-review/config";
import { readSignedRequestFromBody } from "@/lib/meta-review/read-signed-request";
import {
  createDeletionConfirmationCode,
  extractMetaUserId,
  parseMetaSignedRequestFromConfig,
} from "@/lib/meta-review/signed-request";

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "meta-review-data-deletion-callback",
    method: "POST",
    expects: "signed_request",
  });
}

export async function POST(request: Request) {
  if (!isMetaReviewConfigured()) {
    return NextResponse.json({ error: "Meta Review demo is not configured." }, { status: 503 });
  }

  const signedRequest = await readSignedRequestFromBody(request);
  if (!signedRequest) {
    return NextResponse.json({ error: "Missing signed_request." }, { status: 400 });
  }

  const payload = parseMetaSignedRequestFromConfig(signedRequest);
  const userId = extractMetaUserId(payload);
  if (!userId) {
    return NextResponse.json({ error: "Invalid signed_request." }, { status: 400 });
  }

  const confirmationCode = createDeletionConfirmationCode();
  const origin = new URL(request.url).origin;
  const statusUrl = `${origin}/meta-review/data-deletion-status?code=${encodeURIComponent(confirmationCode)}`;

  console.info("[meta-review] data deletion callback received", {
    userId,
    confirmationCode,
  });

  return NextResponse.json({
    url: statusUrl,
    confirmation_code: confirmationCode,
  });
}
