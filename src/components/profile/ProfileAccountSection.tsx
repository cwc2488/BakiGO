"use client";

import { getCurrentSession } from "@/lib/auth/auth-service";
import { useAuth } from "@/lib/auth/auth-context";
import { CloudMemberError, updateCloudMemberSponsor } from "@/lib/cloud/update-cloud-member-sponsor";
import { syncCloudMembersToLocalStorage } from "@/lib/cloud/sync-cloud-members-to-local";
import { getMemberProfileIdentity } from "@/lib/config/app-config";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
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
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

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

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);

    if (newPassword.length < 6) {
      setPasswordError("密碼至少 6 個字元");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("兩次輸入的密碼不一致");
      return;
    }
    if (!isSupabaseConfigured()) {
      setPasswordError("雲端帳號尚未設定，無法修改密碼");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        throw error;
      }
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
      setPasswordMessage("密碼已更新");
    } catch (caught) {
      setPasswordError(
        caught instanceof Error ? caught.message : "修改密碼失敗，請稍後再試",
      );
    } finally {
      setIsUpdatingPassword(false);
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

      <div className="mt-6 border-t border-[var(--brand-border)] pt-5">
        {showPasswordForm ? (
          <form className="space-y-3" onSubmit={(event) => void handleChangePassword(event)}>
            <p className="text-[0.9375rem] font-medium text-[#1d1d1f]">修改密碼</p>
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
              minLength={6}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="新密碼（至少 6 字元）"
              type="password"
              value={newPassword}
            />
            <input
              className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-bg)] px-4 py-3.5 text-[1rem] outline-none focus:border-[var(--brand-primary)]"
              minLength={6}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="再次輸入新密碼"
              type="password"
              value={confirmPassword}
            />
            {passwordError ? <p className="text-[0.875rem] text-[#ff375f]">{passwordError}</p> : null}
            {passwordMessage ? (
              <p className="text-[0.875rem] text-[var(--brand-primary-dark)]">{passwordMessage}</p>
            ) : null}
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-2xl border border-[var(--brand-border)] py-3 font-medium"
                onClick={() => {
                  setShowPasswordForm(false);
                  setNewPassword("");
                  setConfirmPassword("");
                  setPasswordError(null);
                }}
                type="button"
              >
                取消
              </button>
              <button
                className="flex-1 rounded-2xl bg-[var(--brand-primary)] py-3 font-semibold text-white disabled:opacity-60"
                disabled={isUpdatingPassword || !newPassword || !confirmPassword}
                type="submit"
              >
                {isUpdatingPassword ? "更新中…" : "確認修改"}
              </button>
            </div>
          </form>
        ) : (
          <button
            className="w-full rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5 text-[1rem] font-semibold text-[#1d1d1f]"
            onClick={() => setShowPasswordForm(true)}
            type="button"
          >
            修改密碼
          </button>
        )}
      </div>

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
