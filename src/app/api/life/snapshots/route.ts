import { lifeErrorResponse, requireLifeOwner } from "@/lib/life/api";
import { createSnapshot, deleteSnapshot, listSnapshots } from "@/lib/life/life-service";
import { yuanToCents } from "@/lib/life/money";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const snapshots = await listSnapshots(ownerId);
    return NextResponse.json({ snapshots });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const body = await request.json();
    const balances = (body.balances as Array<{ accountId: string; balanceCents?: number; balanceYuan?: number | string }>).map(
      (b) => ({
        accountId: b.accountId,
        balanceCents:
          b.balanceCents != null ? Number(b.balanceCents) : yuanToCents(b.balanceYuan ?? 0),
      }),
    );
    const result = await createSnapshot(ownerId, {
      capturedAt: body.capturedAt,
      note: body.note ?? null,
      balances,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) throw new Error("Missing id");
    await deleteSnapshot(ownerId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}
