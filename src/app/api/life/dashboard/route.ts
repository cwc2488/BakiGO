import { lifeErrorResponse, requireLifeOwner } from "@/lib/life/api";
import { getDashboard } from "@/lib/life/life-service";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ownerId = await requireLifeOwner(request);
    const data = await getDashboard(ownerId);
    return NextResponse.json(data);
  } catch (error) {
    return lifeErrorResponse(error);
  }
}
