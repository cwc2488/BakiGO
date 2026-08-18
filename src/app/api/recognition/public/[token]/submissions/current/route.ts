import { NextResponse } from "next/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  getRecognitionPublicSubmissionByEditToken,
  RecognitionServiceError,
  resolveRecognitionPublicEventByToken,
} from "@/lib/recognition/recognition-service";
import { normalizeRecognitionSubmittedName } from "@/lib/recognition/recognition-domain";
import {
  applyRecognitionEntrySelfService,
  inspectRecognitionImageBuffer,
} from "@/lib/recognition/recognition-validation-service";
import { validateRecognitionPublicPhoto } from "@/lib/recognition/recognition-domain";
import { validateRecognitionImageSignature } from "@/lib/recognition/recognition-image-signature";
import { RECOGNITION_PHOTOS_BUCKET } from "@/lib/recognition/recognition-photo-url";
import type { RecognitionNormalizedCrop } from "@/types/recognition";

export const runtime = "nodejs";

function inferExtension(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "image/heif") return "heif";
  return "jpg";
}

async function requireOpenEvent(token: string) {
  const resolved = await resolveRecognitionPublicEventByToken(token);
  if (resolved.state !== "open" || !resolved.event) {
    const messageMap = {
      invalid: "連結無效或已失效。",
      not_started: "收件尚未開始。",
      closed: "收件已關閉。",
      expired: "收件已過期。",
      open: "ok",
    } as const;
    throw new RecognitionServiceError(messageMap[resolved.state], 403);
  }
  return resolved.event;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const event = await requireOpenEvent(token);
    const editToken = new URL(request.url).searchParams.get("editToken") ?? "";
    if (!editToken) {
      return NextResponse.json({ error: "缺少編輯憑證。" }, { status: 400 });
    }
    const found = await getRecognitionPublicSubmissionByEditToken({
      eventId: event.eventId,
      editToken,
    });
    if (!found) {
      return NextResponse.json({ error: "找不到這份投稿。" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      submissionId: found.submission.id,
      submitterName: found.submission.submitterName,
      entries: found.entries.map((entry) => ({
        entryId: entry.id,
        submittedName: entry.submittedName,
        eventAwardId: entry.eventAwardId,
        validationStatus: entry.validationStatus ?? null,
        hasPhoto: Boolean(entry.currentPhotoStoragePath || entry.originalPhotoStoragePath),
        confirmedCrop: entry.confirmedCrop ?? null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法載入投稿。";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }
  try {
    const { token } = await context.params;
    const event = await requireOpenEvent(token);
    const contentType = request.headers.get("content-type") ?? "";
    const supabase = createSupabaseServiceClient();

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const editToken = String(formData.get("editToken") ?? "");
      const entryId = String(formData.get("entryId") ?? "");
      const file = formData.get("photo");
      const found = await getRecognitionPublicSubmissionByEditToken({
        eventId: event.eventId,
        editToken,
      });
      if (!found) return NextResponse.json({ error: "找不到這份投稿。" }, { status: 404 });
      const entry = found.entries.find((item) => item.id === entryId);
      if (!entry) return NextResponse.json({ error: "找不到這筆表揚。" }, { status: 404 });
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "請重新上傳照片。" }, { status: 400 });
      }
      const photoError = validateRecognitionPublicPhoto({ mimeType: file.type, byteSize: file.size });
      if (photoError) return NextResponse.json({ error: photoError }, { status: 400 });
      const buffer = Buffer.from(await file.arrayBuffer());
      const signatureError = validateRecognitionImageSignature({
        declaredMimeType: file.type,
        buffer,
      });
      if (signatureError) return NextResponse.json({ error: signatureError }, { status: 400 });
      const inspect = await inspectRecognitionImageBuffer(buffer);
      const path = `recognition/${found.submission.id}/entries/${entry.id}/current.${inferExtension(file.type)}`;
      const { error: uploadError } = await supabase.storage
        .from(RECOGNITION_PHOTOS_BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: true });
      if (uploadError) return NextResponse.json({ error: "照片上傳失敗。" }, { status: 500 });

      const cropJson = String(formData.get("crop") ?? "");
      const crop = cropJson ? JSON.parse(cropJson) as RecognitionNormalizedCrop : null;
      const confirmedWarnings = String(formData.get("confirmedWarnings") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const applied = await applyRecognitionEntrySelfService({
        eventId: event.eventId,
        entryId: entry.id,
        imageInspect: inspect,
        crop,
        originalWidth: inspect.ok ? inspect.width : null,
        originalHeight: inspect.ok ? inspect.height : null,
        confirmedWarnings,
        currentPhoto: {
          storagePath: path,
          mimeType: file.type,
          sizeBytes: file.size,
        },
      });
      return NextResponse.json({ ok: true, status: applied.status, issues: applied.issues, pptReady: applied.pptReady });
    }

    const body = await request.json() as {
      editToken?: string;
      entryId?: string;
      submittedName?: string;
      eventAwardId?: string;
      crop?: RecognitionNormalizedCrop | null;
      originalWidth?: number | null;
      originalHeight?: number | null;
      confirmedWarnings?: string[];
    };
    const found = await getRecognitionPublicSubmissionByEditToken({
      eventId: event.eventId,
      editToken: body.editToken ?? "",
    });
    if (!found) return NextResponse.json({ error: "找不到這份投稿。" }, { status: 404 });
    const entry = found.entries.find((item) => item.id === body.entryId);
    if (!entry) return NextResponse.json({ error: "找不到這筆表揚。" }, { status: 404 });

    const patch: Record<string, unknown> = {};
    if (body.submittedName !== undefined) {
      patch.submitted_name = body.submittedName.trim();
      patch.normalized_name = normalizeRecognitionSubmittedName(body.submittedName);
    }
    if (body.eventAwardId !== undefined) patch.event_award_id = body.eventAwardId;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase
        .from("recognition_submission_entries")
        .update(patch)
        .eq("id", entry.id);
      if (error) throw new RecognitionServiceError(error.message, 500);
    }

    const applied = await applyRecognitionEntrySelfService({
      eventId: event.eventId,
      entryId: entry.id,
      crop: body.crop,
      originalWidth: body.originalWidth,
      originalHeight: body.originalHeight,
      confirmedWarnings: body.confirmedWarnings,
    });
    return NextResponse.json({ ok: true, status: applied.status, issues: applied.issues, pptReady: applied.pptReady });
  } catch (error) {
    const message = error instanceof Error ? error.message : "無法更新投稿。";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
