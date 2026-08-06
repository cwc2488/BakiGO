"use client";

import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { MemberNameWithAvatar } from "@/components/members/MemberNameWithAvatar";
import { getMemberAvatarUrl } from "@/lib/members/member-service";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import { redeemDownlinePoints } from "@/lib/points/redeem-downline-points";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { formatPointsValue } from "@/lib/points/streak-multiplier";
import { useMemo, useState } from "react";

export function PointRedemptionModal({
  downlineMemberId,
  downlineName,
  downlineAvatarUrl,
  availablePoints,
  open,
  onClose,
  onRedeemed,
}: {
  downlineMemberId: string;
  downlineName: string;
  downlineAvatarUrl?: string | null;
  availablePoints: number;
  open: boolean;
  onClose: () => void;
  onRedeemed?: () => void;
}) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const [points, setPoints] = useState("");
  const [prizeDescription, setPrizeDescription] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!open) {
    return null;
  }

  async function handleSubmit() {
    setError(null);
    setIsSaving(true);

    try {
      redeemDownlinePoints(
        {
          downlineMemberId,
          redeemedByMemberId: resolveAuthenticatedMemberId(storage),
          points: Number(points),
          prizeDescription,
          note,
        },
        storage,
      );
      setPoints("");
      setPrizeDescription("");
      setNote("");
      onRedeemed?.();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "兌換失敗");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-[1.75rem] bg-[var(--brand-surface)] p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">積分兌換</h2>
        <div className="mt-3">
          <MemberNameWithAvatar
            avatarUrl={
              downlineAvatarUrl ??
              getMemberAvatarUrl(createMemberRepository(storage).getById(downlineMemberId))
            }
            name={downlineName}
            nameClassName="text-[0.9375rem] font-semibold text-[#1d1d1f]"
            size="sm"
          />
        </div>
        <p className="mt-2 text-[0.875rem] text-[#86868b]">
          扣除積分 · 可兌換 {formatPointsValue(availablePoints)} 分
        </p>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-[0.875rem] font-medium text-[#636366]">兌換積分</span>
            <input
              className="mt-1.5 w-full rounded-xl border border-[var(--brand-border)] px-3 py-3 text-[1rem]"
              inputMode="decimal"
              onChange={(event) => setPoints(event.target.value)}
              placeholder="例如 50"
              type="number"
              value={points}
            />
          </label>
          <label className="block">
            <span className="text-[0.875rem] font-medium text-[#636366]">獎品內容</span>
            <input
              className="mt-1.5 w-full rounded-xl border border-[var(--brand-border)] px-3 py-3 text-[1rem]"
              onChange={(event) => setPrizeDescription(event.target.value)}
              placeholder="例如 蛋白粉一罐"
              value={prizeDescription}
            />
          </label>
          <label className="block">
            <span className="text-[0.875rem] font-medium text-[#636366]">備註（選填）</span>
            <textarea
              className="mt-1.5 w-full rounded-xl border border-[var(--brand-border)] px-3 py-3 text-[1rem]"
              onChange={(event) => setNote(event.target.value)}
              placeholder="兌換原因或交付方式"
              rows={2}
              value={note}
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-[0.875rem] text-[#ff375f]">{error}</p> : null}

        <div className="mt-6 flex gap-2">
          <button
            className="flex-1 rounded-xl border border-[var(--brand-border)] px-4 py-3 text-[0.9375rem] font-semibold text-[#1d1d1f]"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="flex-1 rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-[0.9375rem] font-semibold text-white disabled:opacity-60"
            disabled={isSaving}
            onClick={handleSubmit}
            type="button"
          >
            {isSaving ? "處理中…" : "確認兌換"}
          </button>
        </div>
      </div>
    </div>
  );
}
