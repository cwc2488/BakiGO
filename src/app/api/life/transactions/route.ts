import { lifeErrorResponse, requireLifeOwner } from "@/lib/life/api";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from "@/lib/life/life-service";
import { yuanToCents } from "@/lib/life/money";
import type { LifeTransactionKind } from "@/types/life";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function parseAmountCents(body: Record<string, unknown>): number {
  if (body.amountCents != null) return Number(body.amountCents);
  if (body.amountYuan != null) return yuanToCents(body.amountYuan as string | number);
  throw new Error("缺少金額");
}

export async function GET(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const url = new URL(request.url);
    const txs = await listTransactions(ownerId, {
      kind: (url.searchParams.get("kind") as LifeTransactionKind | null) ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      limit: url.searchParams.get("limit")
        ? Number(url.searchParams.get("limit"))
        : 100,
    });
    return NextResponse.json({ transactions: txs });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const body = await request.json();
    const tx = await createTransaction(ownerId, {
      kind: body.kind as LifeTransactionKind,
      amountCents: parseAmountCents(body),
      occurredAt: body.occurredAt,
      categoryId: body.categoryId ?? null,
      accountId: String(body.accountId),
      counterpartyAccountId: body.counterpartyAccountId ?? null,
      note: body.note ?? null,
    });
    return NextResponse.json({ transaction: tx }, { status: 201 });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const body = await request.json();
    if (!body.id) throw new Error("Missing id");
    const tx = await updateTransaction(ownerId, String(body.id), {
      amountCents: body.amountCents != null || body.amountYuan != null ? parseAmountCents(body) : undefined,
      occurredAt: body.occurredAt,
      categoryId: body.categoryId,
      accountId: body.accountId,
      counterpartyAccountId: body.counterpartyAccountId,
      note: body.note,
    });
    return NextResponse.json({ transaction: tx });
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
    await deleteTransaction(ownerId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}
