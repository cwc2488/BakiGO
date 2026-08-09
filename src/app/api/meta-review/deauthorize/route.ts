import { NextResponse } from "next/server";
import { isMetaReviewConfigured } from "@/lib/meta-review/config";
import { readSignedRequestFromBody } from "@/lib/meta-review/read-signed-request";
import {
  extractMetaUserId,
  parseMetaSignedRequestFromConfig,
} from "@/lib/meta-review/signed-request";

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "meta-review-deauthorize-callback",
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

  // Meta Review demo stores Threads OAuth tokens only in the browser httpOnly cookie.
  // Deauthorize callbacks cannot revoke a specific browser cookie server-side, so we
  // acknowledge the event for Meta App Settings validation.
  console.info("[meta-review] deauthorize callback received", { userId });

  return new NextResponse("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
