import { NextResponse } from "next/server";
import { isMetaReviewConfigured } from "@/lib/meta-review/config";
import { getMetaReviewSession, toPublicSessionView } from "@/lib/meta-review/session";

export async function GET() {
  if (!isMetaReviewConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
    });
  }

  const session = await getMetaReviewSession();
  if (!session) {
    return NextResponse.json({
      configured: true,
      connected: false,
    });
  }

  return NextResponse.json({
    configured: true,
    ...toPublicSessionView(session),
  });
}
