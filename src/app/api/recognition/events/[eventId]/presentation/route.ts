import { NextResponse } from "next/server";
import { getMemberIdFromRequest } from "@/lib/supabase/member-auth";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  assertRecognitionAdmin,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import {
  generateRecognitionPresentationPptx,
  getRecognitionPresentationSummary,
} from "@/lib/recognition/recognition-presentation-service";
import { isRecognitionUrlPatternError } from "@/lib/recognition/recognition-photo-url";
import { recognitionPresentationAsciiFallbackFilename } from "@/lib/recognition/recognition-presentation-filename";

export const runtime = "nodejs";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function contentDisposition(filename: string): string {
  const ascii = recognitionPresentationAsciiFallbackFilename(filename);
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const { eventId } = await context.params;
    const summary = await getRecognitionPresentationSummary(eventId);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load presentation summary.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({
      error: isRecognitionUrlPatternError(error) ? "缺少有效照片" : message,
    }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const memberId = await getMemberIdFromRequest(request);
  if (!memberId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  try {
    await assertRecognitionAdmin(memberId);
    const { eventId } = await context.params;
    const result = await generateRecognitionPresentationPptx({
      eventId,
      generatedByMemberId: memberId,
    });
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": PPTX_MIME,
        "Content-Disposition": contentDisposition(result.filename),
        "Cache-Control": "private, no-store",
        "X-Recognition-Slide-Count": String(result.slideCount),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate presentation.";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({
      error: isRecognitionUrlPatternError(error) ? "缺少有效照片" : message,
    }, { status });
  }
}
