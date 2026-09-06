import { lifeErrorResponse, requireLifeOwner } from "@/lib/life/api";
import { ensureLifeSeeded, listAccounts, listCategories } from "@/lib/life/life-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    await ensureLifeSeeded(ownerId);
    const [accounts, categories] = await Promise.all([
      listAccounts(ownerId, { includeArchived: true }),
      listCategories(ownerId, { includeArchived: true }),
    ]);
    return NextResponse.json({ accounts, categories });
  } catch (error) {
    return lifeErrorResponse(error);
  }
}
