"use client";

import { getCurrentSession } from "@/lib/auth/auth-service";
import { useAuth } from "@/lib/auth/auth-context";
import { CloudMemberError, updateCloudMemberSponsor } from "@/lib/cloud/update-cloud-member-sponsor";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";
import { getMemberProfileIdentity } from "@/lib/config/app-config";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProfileCard, ProfileSectionTitle, StatRow } from "./ui";

export function ProfileAccountSection({ onSponsorUpdated }: { onSponsorUpdated?: () => void }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const identity = getMemberProfileIdentity();
  const [newSponsorMemberNumber, setNewSponsorMemberNumber] = useState("");
  const [sponsorMessage, setSponsorMessage] = useState<string | null>(null);
  const [sponsorError, setSponsorError] = useState<string | null>(null);
  const [isUpdatingSponsor, setIsUpdatingSponsor] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleChangeSponsor(event: React.FormEvent) {
    event.preventDefault();
    setSponsorMessage(null);
    setSponsorError(null);
    setIsUpdatingSponsor(true);

    try {
      const storage = createLocalStorageAdapter();
      const session = getCurrentSession(storage);
      if (!session) {
        throw new CloudMemberError("請先登入");
      }

      await updateCloudMemberSponsor(session.memberNumber, newSponsorMemberNumber);
      await syncCloudMembersToLocalStorage(storage);
      setNewSponsorMemberNumber("");
      setSponsorMessage("上線已更新，您的下線組織已一併移至新上線底下");
      onSponsorUpdated?.();
    } catch (caught) {
      setSponsorError(
        caught instanceof CloudMemberError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "修改上線失敗，請稍後再試",
      );
    } finally {
      setIsUpdatingSponsor(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <ProfileCard>
      <ProfileSectionTitle emoji="⚙️">帳號設定</ProfileSectionTitle>

      <dl className="mt-4">
        <StatRow label="目前上線會員編號" value={identity.sponsorHerbalifeMemberId ?? "—"} />
      </dl>

      <form className="mt-5 space-y-3" onSubmit={handleChangeSponsor}>
        <label className="block space-y-2">
          <span className="text-[0.9375rem] font-medium text-[#1d1d1f]">修改上線會員編號</span>
          <input
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)] focus:bg-[var(--brand-surface)]"
            placeholder="例如 00000 或上線的會員編號"
            value={newSponsorMemberNumber}
            onChange={(event) => setNewSponsorMemberNumber(event.target.value)}
          />
        </label>
        <p className="text-[0.8125rem] leading-relaxed text-[#86868b]">
          修改後，您與所有下線會一起掛到新上線底下；下線之間的上下關係不變。
        </p>
        {sponsorError ? <p className="text-[0.875rem] text-[#ff375f]">{sponsorError}</p> : null}
        {sponsorMessage ? (
          <p className="text-[0.875rem] text-[var(--brand-primary-dark)]">{sponsorMessage}</p>
        ) : null}
        <button
          className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 text-[1rem] font-semibold text-[#1d1d1f] disabled:opacity-60"
          disabled={isUpdatingSponsor || !newSponsorMemberNumber.trim()}
          type="submit"
        >
          {isUpdatingSponsor ? "更新中…" : "更新上線"}
        </button>
      </form>

      <button
        className="mt-6 w-full rounded-2xl bg-[#ff375f] px-4 py-3.5 text-[1rem] font-semibold text-white disabled:opacity-60"
        disabled={isSigningOut}
        onClick={() => void handleSignOut()}
        type="button"
      >
        {isSigningOut ? "登出中…" : "登出"}
      </button>
    </ProfileCard>
  );
}
