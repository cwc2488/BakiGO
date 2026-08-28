import { NextResponse } from "next/server";
import {
  TransformationError,
  resolveActiveTransformationOwnerByCode,
} from "@/lib/transformation/transformation-service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_request: Request, context: Ctx) {
  try {
    const { code } = await context.params;
    const owner = await resolveActiveTransformationOwnerByCode(code);
    return NextResponse.json({
      ok: true,
      shareCode: owner.shareCode,
    });
  } catch (error) {
    if (error instanceof TransformationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve." },
      { status: 500 },
    );
  }
}
