import type { NextRequest } from "next/server";

export const runtime = "nodejs";

async function forward(
  request: NextRequest,
  context: { params: Promise<{ enrollmentId: string }> },
  method: "GET" | "PATCH",
) {
  const { enrollmentId } = await context.params;
  const url = new URL(request.url);
  const target = `${url.origin}/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}/growth${
    method === "GET" ? url.search : ""
  }`;
  const init: RequestInit = {
    method,
    headers: request.headers,
  };
  if (method === "PATCH") {
    init.body = await request.text();
  }
  return fetch(target, init);
}

/** Legacy path — forwards to /growth (Phase 4e rename). */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  return forward(request, context, "GET");
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ enrollmentId: string }> },
) {
  return forward(request, context, "PATCH");
}
