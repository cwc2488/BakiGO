import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service-client";
import { mapMemoRow } from "@/lib/memos/memo-mapper";
import { buildMemoWriteRow, memoUpsertSchema, normalizeMemoUpsert } from "@/lib/memos/memo-write";
import { computeNextReminderAt } from "@/lib/memos/reminder-schedule";
import type { MemoRow, MemoUpsertInput } from "@/lib/memos/types";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireService() {
  if (!isSupabaseServiceConfigured()) return null;
  return createSupabaseServiceClient();
}

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = memoUpsertSchema
  .partial()
  .extend({
    completed: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty" });

export async function PATCH(request: Request, context: RouteContext) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = requireService();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "無效的更新內容" }, { status: 400 });
  }

  const { data: existing, error: loadError } = await supabase
    .from("memos")
    .select("*")
    .eq("id", id)
    .eq("member_id", memberId)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "找不到備忘錄" }, { status: 404 });
  }

  const current = mapMemoRow(existing as MemoRow);
  const mergedInput: MemoUpsertInput = {
    title: parsed.data.title?.trim() || current.title,
    content:
      parsed.data.content !== undefined
        ? parsed.data.content?.trim()
          ? parsed.data.content.trim()
          : null
        : current.content,
    completed: parsed.data.completed ?? current.completed,
    reminderType: parsed.data.reminderType ?? current.reminderType,
    reminderTime:
      parsed.data.reminderTime !== undefined ? parsed.data.reminderTime : current.reminderTime,
    reminderWeekday:
      parsed.data.reminderWeekday !== undefined
        ? (parsed.data.reminderWeekday as MemoUpsertInput["reminderWeekday"])
        : current.reminderWeekday,
    reminderDate:
      parsed.data.reminderDate !== undefined ? parsed.data.reminderDate : current.reminderDate,
  };

  const normalized = normalizeMemoUpsert({
    title: mergedInput.title,
    content: mergedInput.content,
    completed: mergedInput.completed,
    reminderType: mergedInput.reminderType,
    reminderTime: mergedInput.reminderTime,
    reminderWeekday: mergedInput.reminderWeekday,
    reminderDate: mergedInput.reminderDate,
  });
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const now = new Date();
  const wasCompleted = current.completed;
  const willComplete = normalized.value.completed === true;

  let nextReminderAt = computeNextReminderAt(
    { ...normalized.value, completed: willComplete },
    now,
  );

  // Completing always clears future reminders.
  if (willComplete) {
    nextReminderAt = null;
  } else if (wasCompleted && !willComplete) {
    // Re-open incomplete → recompute next legal reminder.
    nextReminderAt = computeNextReminderAt(
      { ...normalized.value, completed: false },
      now,
    );
  }

  const write = buildMemoWriteRow(memberId, normalized.value, now);
  write.next_reminder_at = nextReminderAt;

  const { data, error } = await supabase
    .from("memos")
    .update(write)
    .eq("id", id)
    .eq("member_id", memberId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ memo: mapMemoRow(data as MemoRow) });
}

export async function DELETE(request: Request, context: RouteContext) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = requireService();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabase.from("memos").delete().eq("id", id).eq("member_id", memberId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
