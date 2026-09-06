import { lifeErrorResponse, requireLifeOwner } from "@/lib/life/api";
import { getAnalytics, type LifePeriodKey } from "@/lib/life/life-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const url = new URL(request.url);
    const period = (url.searchParams.get("period") as LifePeriodKey) || "this_month";
    const data = await getAnalytics(ownerId, {
      period,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    return NextResponse.json(data);
  } catch (error) {
    return lifeErrorResponse(error);
  }
}
