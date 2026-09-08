import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { executePublicTempDraw, getPublicTempDrawPage } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const data = await getPublicTempDrawPage(token);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const result = await executePublicTempDraw(token);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
