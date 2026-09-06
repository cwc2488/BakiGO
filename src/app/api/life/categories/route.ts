import { lifeErrorResponse, requireLifeOwner } from "@/lib/life/api";
import { createCategory, listCategories, updateCategory } from "@/lib/life/life-service";
import type { LifeCategoryKind } from "@/types/life";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") as LifeCategoryKind | null;
    const includeArchived = url.searchParams.get("includeArchived") === "1";
    const categories = await listCategories(ownerId, {
      kind: kind ?? undefined,
      includeArchived,
    });
    return NextResponse.json({ categories });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const body = await request.json();
    const category = await createCategory(ownerId, {
      kind: body.kind as LifeCategoryKind,
      name: String(body.name ?? ""),
      icon: body.icon ?? null,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const body = await request.json();
    if (!body.id) throw new Error("Missing id");
    const category = await updateCategory(ownerId, String(body.id), {
      name: body.name,
      icon: body.icon,
      status: body.status,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
    });
    return NextResponse.json({ category });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}
