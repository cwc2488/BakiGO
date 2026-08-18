import { randomUUID, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import {
  createPublicRecognitionSubmission,
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

export const runtime = "nodejs";

type PublicFormEntry = {
  submittedName?: string;
  eventAwardId?: string;
  photoFieldKey?: string | null;
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
    const finalizedEntries = [] as Array<{
      id: string;
      eventAwardId: string;
      submittedName: string;
      normalizedName: string;
      originalPhotoStoragePath: string | null;
      originalPhotoMimeType: string | null;
      originalPhotoSizeBytes: number | null;
    }>;

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

        const path = `recognition/${submissionId}/entries/${entryId}/original.${inferExtension(file)}`;
        const buffer = Buffer.from(await file.arrayBuffer());
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

    const submission = await createPublicRecognitionSubmission({
      token,
      submissionId,
      submitterName,
      submitterOrganization,
      sourceContext: {
        ipHash: hashIp(ip),
        userAgent: request.headers.get("user-agent") ?? "",
      },
      entries: finalizedEntries,
    });

    return NextResponse.json({
      ok: true,
      submissionId: submission.id,
      message: "已收到你的表揚名單，將由管理員審核。",
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
