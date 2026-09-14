import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import { mapMemoRow } from "@/lib/memos/memo-mapper";
import { buildMemoWriteRow, memoUpsertSchema, normalizeMemoUpsert } from "@/lib/memos/memo-write";
import type { MemoRow } from "@/lib/memos/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireService() {
  if (!isSupabaseServiceConfigured()) return null;
  return createSupabaseServiceClient();
}

/** GET /api/memos?incompleteOnly=1&limit=3 */
export async function GET(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = requireService();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const url = new URL(request.url);
  const incompleteOnly = url.searchParams.get("incompleteOnly") === "1";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));

  let query = supabase
    .from("memos")
    .select("*")
    .eq("member_id", memberId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (incompleteOnly) {
    query = query.eq("completed", false);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const memos = ((data ?? []) as MemoRow[]).map(mapMemoRow);
  return NextResponse.json({ memos });
}

export async function POST(request: Request) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = requireService();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = memoUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "請填寫標題" }, { status: 400 });
  }

  const normalized = normalizeMemoUpsert(parsed.data);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const now = new Date();
  const row = {
    ...buildMemoWriteRow(memberId, normalized.value, now),
    created_at: now.toISOString(),
  };

  const { data, error } = await supabase.from("memos").insert(row).select("*").single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ memo: mapMemoRow(data as MemoRow) }, { status: 201 });
}
