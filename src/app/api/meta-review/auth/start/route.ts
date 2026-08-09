import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { isMetaReviewConfigured } from "@/lib/meta-review/config";
import { buildThreadsAuthorizeUrl } from "@/lib/meta-review/threads-client";
import { setOAuthState } from "@/lib/meta-review/session";

export async function GET(request: Request) {
  if (!isMetaReviewConfigured()) {
    return NextResponse.redirect(new URL("/meta-review?error=not_configured", request.url));
  }

  const state = randomBytes(16).toString("hex");
  await setOAuthState(state);

  const origin = new URL(request.url).origin;
  const authorizeUrl = buildThreadsAuthorizeUrl(origin, state);
  return NextResponse.redirect(authorizeUrl);
}
