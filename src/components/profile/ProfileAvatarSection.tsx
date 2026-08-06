"use client";

import { getCurrentSession } from "@/lib/auth/auth-service";
import { getMemberProfileIdentity } from "@/lib/config/app-config";
import { uploadMemberAvatarBlob } from "@/lib/members/member-avatar";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { MemberAvatar } from "@/components/members/MemberAvatar";
import { AvatarCropModal } from "@/components/profile/AvatarCropModal";
import { useRef, useState } from "react";
import { ProfileCard, ProfileSectionTitle } from "./ui";

export function ProfileAvatarSection({ onAvatarUpdated }: { onAvatarUpdated?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const identity = getMemberProfileIdentity();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(identity.avatarUrl);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setErrorMessage("請選擇圖片檔案");
      return;
    }

    setStatusMessage(null);
    setErrorMessage(null);
    setCropImageSrc(URL.createObjectURL(file));
    setCropOpen(true);
  }

  async function handleCropConfirm(blob: Blob) {
    setIsUploading(true);

    try {
      const storage = createLocalStorageAdapter();
      const session = getCurrentSession(storage);
      if (!session) {
        throw new Error("請先登入");
      }

      const nextAvatarUrl = await uploadMemberAvatarBlob({
        memberId: session.memberId,
        blob,
        storage,
      });
      setAvatarUrl(nextAvatarUrl);
      setStatusMessage("頭像已更新");
      onAvatarUpdated?.();
    } catch (caught) {
      setErrorMessage(caught instanceof Error ? caught.message : "上傳失敗");
      throw caught;
    } finally {
      setIsUploading(false);
    }
  }

  function handleCropClose() {
    if (isUploading) {
      return;
    }
    if (cropImageSrc) {
      URL.revokeObjectURL(cropImageSrc);
    }
    setCropOpen(false);
    setCropImageSrc(null);
  }

  return (
    <>
      <ProfileCard>
        <ProfileSectionTitle emoji="🙂">個人頭像</ProfileSectionTitle>
        <div className="mt-4 flex items-center gap-4">
          <MemberAvatar avatarUrl={avatarUrl} name={identity.displayName} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-medium text-[#1d1d1f]">{identity.displayName}</p>
            <p className="mt-1 text-[0.8125rem] text-[#86868b]">
              上傳後可裁切與選擇尺寸，組織圖也會顯示這張頭像。
            </p>
            <input
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              type="file"
            />
            <button
              className="mt-3 rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-[0.875rem] font-semibold text-white disabled:opacity-50"
              disabled={isUploading || !isSupabaseConfigured()}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {isUploading ? "上傳中…" : "更換頭像"}
            </button>
            {!isSupabaseConfigured() ? (
              <p className="mt-2 text-[0.8125rem] text-[#86868b]">需設定 Supabase 才能上傳頭像</p>
            ) : null}
            {statusMessage ? (
              <p className="mt-2 text-[0.8125rem] font-medium text-[#248a3d]">{statusMessage}</p>
            ) : null}
            {errorMessage ? (
              <p className="mt-2 text-[0.8125rem] text-[#ff375f]">{errorMessage}</p>
            ) : null}
          </div>
        </div>
      </ProfileCard>

      <AvatarCropModal
        displayName={identity.displayName}
        imageSrc={cropImageSrc}
        onClose={handleCropClose}
        onConfirm={handleCropConfirm}
        open={cropOpen}
      />
    </>
  );
}
