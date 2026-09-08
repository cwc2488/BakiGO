import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { createPrize } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ periodId: string }> },
) {
  try {
    await requireLose2kgAdmin(request);
    const { periodId } = await context.params;
    const body = (await request.json()) as { name?: string; winnerCount?: number };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "請填寫獎項名稱。" }, { status: 400 });
    }
    const prize = await createPrize({
      periodId,
      name: body.name,
      winnerCount: body.winnerCount,
    });
    return NextResponse.json({ ok: true, prize });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
