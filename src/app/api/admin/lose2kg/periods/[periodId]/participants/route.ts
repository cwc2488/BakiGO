import { lose2kgErrorResponse, requireLose2kgAdmin } from "@/lib/lose2kg/api";
import { createParticipant } from "@/lib/lose2kg/service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ periodId: string }> },
) {
  try {
    await requireLose2kgAdmin(request);
    const { periodId } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      publicDisplayName?: string;
      note?: string;
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "請填寫姓名。" }, { status: 400 });
    }
    const participant = await createParticipant({
      periodId,
      name: body.name,
      publicDisplayName: body.publicDisplayName,
      note: body.note,
    });
    return NextResponse.json({ ok: true, participant });
  } catch (error) {
    return lose2kgErrorResponse(error);
  }
}
