import { NextResponse } from "next/server";
import { isMetaReviewConfigured } from "@/lib/meta-review/config";
import { sanitizeThreadsApiError } from "@/lib/meta-review/sanitize-error";
import { getMetaReviewSession } from "@/lib/meta-review/session";

export async function requireMetaReviewSession() {
  if (!isMetaReviewConfigured()) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error: "Meta Review demo is not configured on this deployment.",
        },
        { status: 503 },
      ),
    };
  }

  const session = await getMetaReviewSession();
  if (!session) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error: "Connect a Threads account before running this demo action.",
        },
        { status: 401 },
      ),
    };
  }

  return { session };
}

export function jsonSuccess<T extends Record<string, unknown>>(payload: T) {
  return NextResponse.json({
    ok: true,
    status: "API Request Successful",
    ...payload,
  });
}

export function jsonFailure(error: unknown, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      status: "API Request Failed",
      error: sanitizeThreadsApiError(error),
    },
    { status },
  );
}
