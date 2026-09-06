import { lifeErrorResponse, requireLifeOwner } from "@/lib/life/api";
import { createAccount, listAccounts, updateAccount } from "@/lib/life/life-service";
import { yuanToCents } from "@/lib/life/money";
import type { LifeAccountType } from "@/types/life";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const url = new URL(request.url);
    const includeArchived = url.searchParams.get("includeArchived") === "1";
    const accounts = await listAccounts(ownerId, { includeArchived });
    return NextResponse.json({ accounts });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const body = await request.json();
    const account = await createAccount(ownerId, {
      name: String(body.name ?? ""),
      accountType: body.accountType as LifeAccountType,
      balanceCents:
        body.balanceCents != null
          ? Number(body.balanceCents)
          : body.balanceYuan != null
            ? yuanToCents(body.balanceYuan)
            : 0,
      parentAccountId: body.parentAccountId ?? null,
      linkedGoalId: body.linkedGoalId ?? null,
      defaultPaymentAccountId: body.defaultPaymentAccountId ?? null,
      icon: body.icon ?? null,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const body = await request.json();
    if (!body.id) throw new Error("Missing id");
    const account = await updateAccount(ownerId, String(body.id), {
      name: body.name,
      status: body.status,
      parentAccountId: body.parentAccountId,
      linkedGoalId: body.linkedGoalId,
      defaultPaymentAccountId: body.defaultPaymentAccountId,
      icon: body.icon,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      notes: body.notes,
      balanceCents:
        body.balanceCents != null
          ? Number(body.balanceCents)
          : body.balanceYuan != null
            ? yuanToCents(body.balanceYuan)
            : undefined,
    });
    return NextResponse.json({ account });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}
