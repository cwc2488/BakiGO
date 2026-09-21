import { NextResponse } from "next/server";
import { assertSuperAdmin, SuperAdminAccessError } from "@/lib/auth/assert-super-admin";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  createTrainingItem,
  listLearningLinksForItems,
  listTrainingItems,
  TrainingServiceError,
} from "@/lib/training/training-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    await assertSuperAdmin(memberId);
    if (!isSupabaseServiceConfigured()) {
      return NextResponse.json({ error: "Training service unavailable." }, { status: 503 });
    }

    const items = await listTrainingItems({ includeInactive: true });
    const linksByItem = await listLearningLinksForItems(items.map((item) => item.id));
    return NextResponse.json({
      ok: true,
      items: items.map((item) => ({
        ...item,
        learningLinks: linksByItem.get(item.id) ?? [],
      })),
    });
  } catch (error) {
    if (error instanceof SuperAdminAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof TrainingServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list items." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const memberId = await getMemberIdFromRequest(request);
    if (!memberId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    await assertSuperAdmin(memberId);
    if (!isSupabaseServiceConfigured()) {
      return NextResponse.json({ error: "Training service unavailable." }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      itemKey?: unknown;
      name?: unknown;
      sortOrder?: unknown;
    };
    const itemKey = typeof body.itemKey === "string" ? body.itemKey : "";
    const name = typeof body.name === "string" ? body.name : "";
    const sortOrder =
      typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
        ? body.sortOrder
        : undefined;

    const item = await createTrainingItem({ itemKey, name, sortOrder });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (error instanceof SuperAdminAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof TrainingServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create item." },
      { status: 500 },
    );
  }
}
