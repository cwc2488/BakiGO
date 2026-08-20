import { randomUUID, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  attachRecognitionPublicEditToken,
  finalizeRecognitionPublicSubmission,
  prepareRecognitionPublicSubmissionContext,
  RecognitionServiceError,
} from "@/lib/recognition/recognition-service";
import {
  allowRecognitionPublicSubmission,
  getRecognitionClientIp,
} from "@/lib/recognition/recognition-public-rate-limit";
import {
  validateRecognitionPublicEntryCount,
  validateRecognitionPublicPhoto,
} from "@/lib/recognition/recognition-domain";
import { validateRecognitionImageSignature } from "@/lib/recognition/recognition-image-signature";
import {
  applyRecognitionSubmissionSelfService,
  inspectRecognitionImageBuffer,
} from "@/lib/recognition/recognition-validation-service";
import { detectRecognitionPhotoPersons } from "@/lib/recognition/recognition-person-detect";
import type { RecognitionNormalizedCrop } from "@/types/recognition";
import type { RecognitionImageInspectResult } from "@/lib/recognition/recognition-validation";
import type { RecognitionPersonDetection } from "@/lib/recognition/recognition-person-detect";

export const runtime = "nodejs";

type PublicFormEntry = {
  submittedName?: string;
  eventAwardId?: string;
  photoFieldKey?: string | null;
  crop?: RecognitionNormalizedCrop | null;
  originalWidth?: number | null;
  originalHeight?: number | null;
  confirmedWarnings?: string[];
};

function inferExtension(file: File): string {
  switch (file.type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return "bin";
  }
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip, "utf8").digest("hex");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json({ error: "Recognition service unavailable." }, { status: 503 });
  }

  const ip = getRecognitionClientIp(request);
  if (!allowRecognitionPublicSubmission(`submit:${ip}`)) {
    return NextResponse.json({ error: "送出過於頻繁，請稍後再試。", code: "rate_limited" }, { status: 429 });
  }

  const uploadedPaths: string[] = [];

  try {
    const { token } = await context.params;
    const formData = await request.formData();

    const submitterName = String(formData.get("submitterName") ?? "");
    const submitterOrganization = String(formData.get("submitterOrganization") ?? "");
    const entriesJson = String(formData.get("entries") ?? "[]");
    const entries = JSON.parse(entriesJson) as PublicFormEntry[];

    const entryCountError = validateRecognitionPublicEntryCount(entries.length);
    if (entryCountError) {
      return NextResponse.json({ error: entryCountError }, { status: 400 });
    }

    const submissionId = randomUUID();
    const prepared = await prepareRecognitionPublicSubmissionContext({
      token,
      submitterName,
      submitterOrganization,
      entries: entries.map((entry) => ({
        submittedName: String(entry.submittedName ?? ""),
        eventAwardId: String(entry.eventAwardId ?? ""),
        hasPhoto: Boolean(entry.photoFieldKey?.trim() && formData.get(entry.photoFieldKey.trim())),
      })),
    });

    const finalizedEntries = [] as Array<{
      id: string;
      eventAwardId: string;
      submittedName: string;
      normalizedName: string;
      originalPhotoStoragePath: string | null;
      originalPhotoMimeType: string | null;
      originalPhotoSizeBytes: number | null;
    }>;
    const inspectByEntryId: Record<string, RecognitionImageInspectResult | null> = {};
    const personDetectionByEntryId: Record<string, RecognitionPersonDetection | null> = {};
    const cropByEntryId: Record<string, RecognitionNormalizedCrop | null> = {};
    const confirmedWarningsByEntryId: Record<string, string[]> = {};
    const dimensionsByEntryId: Record<string, { width: number; height: number }> = {};

    for (const entry of entries) {
      const entryId = randomUUID();
      let originalPhotoStoragePath: string | null = null;
      let originalPhotoMimeType: string | null = null;
      let originalPhotoSizeBytes: number | null = null;

      const fieldKey = entry.photoFieldKey?.trim() ?? "";
      if (fieldKey) {
        const file = formData.get(fieldKey);
        if (!(file instanceof File)) {
          return NextResponse.json({ error: "照片上傳失敗。", code: "upload_failed" }, { status: 400 });
        }
        const photoValidationError = validateRecognitionPublicPhoto({
          mimeType: file.type,
          byteSize: file.size,
        });
        if (photoValidationError) {
          return NextResponse.json({ error: photoValidationError, code: "invalid_file" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const signatureError = validateRecognitionImageSignature({
          declaredMimeType: file.type,
          buffer,
        });
        if (signatureError) {
          return NextResponse.json({ error: signatureError, code: "invalid_file" }, { status: 400 });
        }

        const inspect = await inspectRecognitionImageBuffer(buffer);
        inspectByEntryId[entryId] = inspect;
        if (inspect.ok) {
          dimensionsByEntryId[entryId] = { width: inspect.width, height: inspect.height };
        }
        personDetectionByEntryId[entryId] = await detectRecognitionPhotoPersons({
          buffer,
          mimeType: file.type,
        });

        const path = `recognition/${submissionId}/entries/${entryId}/original.${inferExtension(file)}`;
        const supabase = createSupabaseServiceClient();
        const { error: uploadError } = await supabase.storage
          .from("recognition-photos")
          .upload(path, buffer, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          return NextResponse.json({ error: "照片上傳失敗。", code: "upload_failed" }, { status: 500 });
        }

        uploadedPaths.push(path);
        originalPhotoStoragePath = path;
        originalPhotoMimeType = file.type;
        originalPhotoSizeBytes = file.size;
      }

      if (entry.crop) cropByEntryId[entryId] = entry.crop;
      if (entry.confirmedWarnings) confirmedWarningsByEntryId[entryId] = entry.confirmedWarnings;
      if (entry.originalWidth && entry.originalHeight && !dimensionsByEntryId[entryId]) {
        dimensionsByEntryId[entryId] = { width: entry.originalWidth, height: entry.originalHeight };
      }

      finalizedEntries.push({
        id: entryId,
        eventAwardId: String(entry.eventAwardId ?? ""),
        submittedName: String(entry.submittedName ?? ""),
        normalizedName: String(entry.submittedName ?? ""),
        originalPhotoStoragePath,
        originalPhotoMimeType,
        originalPhotoSizeBytes,
      });
    }

    const submission = await finalizeRecognitionPublicSubmission({
      eventId: prepared.event.eventId,
      submissionId,
      submitterName,
      submitterOrganization,
      sourceContext: {
        ipHash: hashIp(ip),
        userAgent: request.headers.get("user-agent") ?? "",
      },
      entries: finalizedEntries,
    });

    const selfService = await applyRecognitionSubmissionSelfService({
      eventId: prepared.event.eventId,
      submissionId: submission.id,
      inspectByEntryId,
      personDetectionByEntryId,
      cropByEntryId,
      confirmedWarningsByEntryId,
      dimensionsByEntryId,
    });

    const editToken = await attachRecognitionPublicEditToken(submission.id);
    const message = selfService.completion.complete
      ? "✅ 投稿完成"
      : `⚠️ 投稿尚未完成 ${selfService.completion.readyCount} / ${selfService.completion.total} 完成，${selfService.completion.blockedCount} 筆需要修正`;

    return NextResponse.json({
      ok: true,
      submissionId: submission.id,
      editToken,
      completion: selfService.completion,
      entries: selfService.entries,
      message,
    });
  } catch (error) {
    if (uploadedPaths.length > 0) {
      try {
        const supabase = createSupabaseServiceClient();
        await supabase.storage.from("recognition-photos").remove(uploadedPaths);
      } catch {
        // Best-effort cleanup only; orphaned uploads remain safely private and can be cleaned later.
      }
    }

    const message = error instanceof Error ? error.message : "送出失敗，請稍後再試。";
    const status = error instanceof RecognitionServiceError ? error.status : 500;
    return NextResponse.json({ error: message, code: "submission_failed" }, { status });
  }
}
