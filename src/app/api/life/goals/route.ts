import { lifeErrorResponse, requireLifeOwner } from "@/lib/life/api";
import { createGoal, listGoals, updateGoal } from "@/lib/life/life-service";
import { yuanToCents } from "@/lib/life/money";
import type { LifeGoalStatus } from "@/types/life";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const url = new URL(request.url);
    const goals = await listGoals(ownerId, {
      includeArchived: url.searchParams.get("includeArchived") === "1",
    });
    return NextResponse.json({ goals });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const body = await request.json();
    const goal = await createGoal(ownerId, {
      title: String(body.title ?? ""),
      description: body.description ?? null,
      icon: body.icon ?? null,
      targetAmountCents:
        body.targetAmountCents != null
          ? Number(body.targetAmountCents)
          : body.targetAmountYuan != null
            ? yuanToCents(body.targetAmountYuan)
            : null,
      preparedAmountCents:
        body.preparedAmountCents != null
          ? Number(body.preparedAmountCents)
          : body.preparedAmountYuan != null
            ? yuanToCents(body.preparedAmountYuan)
            : 0,
      targetDate: body.targetDate ?? null,
      status: (body.status as LifeGoalStatus) ?? "planning",
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
    });
    return NextResponse.json({ goal }, { status: 201 });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const body = await request.json();
    if (!body.id) throw new Error("Missing id");
    const goal = await updateGoal(ownerId, String(body.id), {
      title: body.title,
      description: body.description,
      icon: body.icon,
      targetAmountCents:
        body.targetAmountCents !== undefined
          ? body.targetAmountCents == null
            ? null
            : Number(body.targetAmountCents)
          : body.targetAmountYuan !== undefined
            ? body.targetAmountYuan == null
              ? null
              : yuanToCents(body.targetAmountYuan)
            : undefined,
      preparedAmountCents:
        body.preparedAmountCents != null
          ? Number(body.preparedAmountCents)
          : body.preparedAmountYuan != null
            ? yuanToCents(body.preparedAmountYuan)
            : undefined,
      targetDate: body.targetDate,
      status: body.status,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
    });
    return NextResponse.json({ goal });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}
