import { updateCloudMemberAvatar } from "@/lib/cloud/cloud-member-service";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { EntityId } from "@/types";

const AVATAR_BUCKET = "member-avatars";
const MAX_AVATAR_EDGE = 512;

export function getMemberInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
  }

  return trimmed.slice(0, 2).toUpperCase();
}

export async function resizeImageToJpegBlob(
  file: File,
  maxEdge = MAX_AVATAR_EDGE,
  quality = 0.85,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("無法處理圖片");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });

  if (!blob) {
    throw new Error("無法壓縮圖片");
  }

  return blob;
}

export async function uploadMemberAvatarBlob(input: {
  memberId: EntityId;
  blob: Blob;
  storage: StorageAdapter;
}): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error("雲端尚未設定，無法上傳頭像");
  }

  const supabase = createSupabaseBrowserClient();
  const objectPath = `${input.memberId}/avatar.jpg`;

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(objectPath, input.blob, {
    upsert: true,
    contentType: "image/jpeg",
    cacheControl: "3600",
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;

  await updateCloudMemberAvatar(input.memberId, avatarUrl);
  await syncCloudMembersToLocalStorage(input.storage);

  return avatarUrl;
}

export async function uploadMemberAvatar(input: {
  memberId: EntityId;
  file: File;
  storage: StorageAdapter;
}): Promise<string> {
  if (!input.file.type.startsWith("image/")) {
    throw new Error("請選擇圖片檔案");
  }

  const jpegBlob = await resizeImageToJpegBlob(input.file);
  return uploadMemberAvatarBlob({
    memberId: input.memberId,
    blob: jpegBlob,
    storage: input.storage,
  });
}
