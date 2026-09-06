import {
  LIFE_ACCEPTANCE_BEARER,
  runLifeProductionAcceptance,
} from "@/lib/life/prod-acceptance";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
/** Fluid/Pro allows up to 300s; suite touches many ledger writes. */
export const maxDuration = 300;

/**
 * One-time Production acceptance runner (service-role).
 * Auth: Authorization: Bearer <LIFE_ACCEPTANCE_BEARER>
 * Remove this route after PASS.
 */
export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token !== LIFE_ACCEPTANCE_BEARER) {
    return NextResponse.json({ error: "Unauthorized.", code: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLifeProductionAcceptance();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: message, code: "acceptance_failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST with Bearer token.", code: "method_not_allowed" },
    { status: 405 },
  );
}
