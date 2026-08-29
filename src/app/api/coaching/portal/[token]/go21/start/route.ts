import { NextResponse } from "next/server";
import { isSupabaseServiceConfigured, createSupabaseServiceClient } from "@/lib/supabase/service-client";
import { toCoachingApiErrorMessage } from "@/lib/coaching/coaching-api-error";
import { CoachingServiceError, resolveActiveCoachingPortal } from "@/lib/coaching/coaching-service";
import { markGo21Started, loadGo21PortalBundle } from "@/lib/go21/go21-portal";
import { getSharedInMemoryV2Store } from "@/lib/coaching/ai/v2/memory-store";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";

export const runtime = "nodejs";

const WELCOME_MESSAGE = `歡迎開始你的 21 天 AI 飲食陪跑 👋

接下來你不用填一堆複雜的紀錄。

吃飯的時候可以直接拍照傳給我，也可以跟我說「午餐」、「剛剛有點嘴饞」、「今天水喝很少」。

我會幫你整理紀錄，也會慢慢了解你的生活和飲食模式。

這 21 天，我們一起找出真正適合你長期維持的方法。`;

/** Idempotent customer start + seed welcome turn. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const portal = await resolveActiveCoachingPortal(token);
    const result = await markGo21Started(portal.enrollmentId);

    if (!result.already) {
      // Seed welcome as coach turn (DB + in-memory)
      const store = getSharedInMemoryV2Store();
      await store.ensureActiveCycle({
        enrollmentId: portal.enrollmentId,
        customerId: portal.customerId,
        ownerMemberId: portal.ownerMemberId,
        enrollmentStartedAt: coachingTodayLogDate(),
      });
      await store.appendTurn({
        enrollmentId: portal.enrollmentId,
        customerId: portal.customerId,
        ownerMemberId: portal.ownerMemberId,
        logDate: coachingTodayLogDate(),
        role: "coach",
        channel: "system",
        content: WELCOME_MESSAGE,
        intention: "encourage",
        metadata: { kind: "go21_welcome" },
      });

      try {
        const supabase = createSupabaseServiceClient();
        await supabase.from("coaching_ai_turns").insert({
          enrollment_id: portal.enrollmentId,
          customer_id: portal.customerId,
          owner_member_id: portal.ownerMemberId,
          log_date: coachingTodayLogDate(),
          role: "coach",
          channel: "system",
          content: WELCOME_MESSAGE,
          intention: "encourage",
          metadata: { kind: "go21_welcome" },
        });
      } catch {
        // migration may be pending
      }
    }

    const bundle = await loadGo21PortalBundle(token);
    return NextResponse.json({
      ok: true,
      already: result.already,
      startedAt: result.startedAt,
      welcomeMessage: WELCOME_MESSAGE,
      dayNumber: bundle.dayNumber,
    });
  } catch (error) {
    const message = toCoachingApiErrorMessage(error, "無法開始 21 天陪跑");
    const status = error instanceof CoachingServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
