"use client";

import { adjustDownlineRank } from "@/lib/members/adjust-downline-rank";
import { buildMemberActivitySummary } from "@/lib/organization/member-activity-summary";
import { todayISODate } from "@/lib/config/app-config";
import { formatPointsValue } from "@/lib/points/streak-multiplier";
import { loadRedemptionsForMember } from "@/lib/repositories/point-redemption-repository";
import { PointRedemptionModal } from "@/components/points/PointRedemptionModal";
import { getCurrentMember } from "@/lib/auth/auth-service";
import { getRegistrationRankOptions } from "@/lib/auth/registration-ranks";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { OrganizationMemberView } from "@/types/organization-center";
import { APP_EMOJI } from "@/lib/ui/app-emojis";
import { ProgressBar } from "@/components/home/ui";
import { useMemo, useState } from "react";

export function OrganizationMemberDetail({
  member,
  canAdjustRank,
  onRankAdjusted,
}: {
  member: OrganizationMemberView;
  canAdjustRank: boolean;
  onRankAdjusted?: () => void;
}) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const rankOptions = useMemo(() => getRegistrationRankOptions(), []);
  const [selectedRank, setSelectedRank] = useState(member.qualificationLabel);
  const [rankKey, setRankKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [redemptionOpen, setRedemptionOpen] = useState(false);
  const viewer = useMemo(() => getCurrentMember(storage), [storage]);
  const redemptions = useMemo(
    () => loadRedemptionsForMember(member.memberId, storage),
    [member.memberId, storage],
  );
  const activitySummary = useMemo(
    () => buildMemberActivitySummary(member.memberId, todayISODate(), storage),
    [member.memberId, storage],
  );
  const canRedeem = Boolean(viewer) && viewer?.id !== member.memberId;

  const currentRankLabel = member.qualificationLabel;
  const monthlyVpPercent =
    member.monthlyVpTarget && member.monthlyVpTarget > 0
      ? Math.min(100, Math.round((member.monthlyVp / member.monthlyVpTarget) * 100))
      : null;

  function handleRankSave() {
    if (!rankKey) {
      return;
    }

    setError(null);
    setIsSaving(true);
    setSaved(false);

    try {
      adjustDownlineRank(member.memberId, rankKey, storage);
      const label = rankOptions.find((option) => option.key === rankKey)?.label ?? rankKey;
      setSelectedRank(label);
      setSaved(true);
      onRankAdjusted?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "調整失敗");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.8125rem] font-medium text-[#86868b]">夥伴詳情</p>
          <h2 className="mt-1 text-[1.375rem] font-semibold text-[#1d1d1f]">{member.name}</h2>
          <p className="mt-1 text-[0.9375rem] text-[#86868b]">{selectedRank || currentRankLabel}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold ${
            member.metMonthlyVp2500
              ? "bg-[#e8f8ee] text-[#248a3d]"
              : "bg-[#fff4e5] text-[#b25000]"
          }`}
        >
          {member.metMonthlyVp2500 ? "本月達標" : "本月未達標"}
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3">
          <dt className="text-[0.75rem] font-medium text-[#86868b]">本月 VP</dt>
          <dd className="mt-1 text-[1.125rem] font-semibold text-[#1d1d1f]">
            {member.monthlyVp}
            {member.monthlyVpTarget !== null ? (
              <span className="text-[0.875rem] font-normal text-[#86868b]">
                {" "}
                / {member.monthlyVpTarget}
              </span>
            ) : null}
          </dd>
          {monthlyVpPercent !== null ? (
            <div className="mt-2">
              <ProgressBar color="#77b539" percent={monthlyVpPercent} />
              <p className="mt-1 text-[0.75rem] font-medium text-[#86868b]">{monthlyVpPercent}%</p>
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3">
          <dt className="text-[0.75rem] font-medium text-[#86868b]">本月積分</dt>
          <dd className="mt-1 text-[1.125rem] font-semibold text-[var(--brand-primary-dark)]">
            {formatPointsValue(member.monthlyPoints)}
            {member.streakMultiplier > 1 ? (
              <span className="ml-1 text-[0.75rem] font-semibold text-[#248a3d]">
                ×{member.streakMultiplier.toFixed(2)}
              </span>
            ) : null}
          </dd>
        </div>
        <div className="rounded-2xl bg-[var(--brand-bg)] px-4 py-3 col-span-2">
          <dt className="text-[0.75rem] font-medium text-[#86868b]">可兌換 / 歷史總積分</dt>
          <dd className="mt-1 text-[1.125rem] font-semibold text-[#1d1d1f]">
            {formatPointsValue(member.availablePoints)} / {formatPointsValue(member.lifetimePoints)}
          </dd>
        </div>
      </dl>

      <div className="mt-5 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-primary-muted)] px-4 py-4">
        <p className="text-[0.875rem] font-semibold text-[#1d1d1f]">本月活動狀態</p>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-[0.75rem] text-[#86868b]">諮詢</dt>
            <dd className="mt-0.5 text-[1.125rem] font-semibold text-[#1d1d1f]">
              {activitySummary.monthlyConsultations} 次
            </dd>
          </div>
          <div>
            <dt className="text-[0.75rem] text-[#86868b]">量測</dt>
            <dd className="mt-0.5 text-[1.125rem] font-semibold text-[#1d1d1f]">
              {activitySummary.monthlyMeasurements} 次
            </dd>
          </div>
        </dl>
        <div className="mt-3">
          <p className="text-[0.75rem] font-medium text-[#86868b]">近期參加會議</p>
          {activitySummary.recentMeetings.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {activitySummary.recentMeetings.map((meeting) => (
                <li
                  key={`${meeting.date}-${meeting.title}`}
                  className="text-[0.8125rem] text-[#636366]"
                >
                  <span className="font-medium text-[#1d1d1f]">{meeting.title}</span>
                  <span className="text-[#86868b]"> · {meeting.date}</span>
                  <span className="text-[var(--brand-primary-dark)]">
                    {" "}
                    · 帶 {meeting.newFriendsCount} 位新朋友
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[0.8125rem] text-[#86868b]">尚無會議紀錄</p>
          )}
        </div>
      </div>

      {canRedeem ? (
        <div className="mt-4 space-y-2">
          <button
            className="w-full rounded-2xl bg-[var(--brand-primary)] px-4 py-3.5 text-[0.9375rem] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={member.availablePoints <= 0}
            onClick={() => setRedemptionOpen(true)}
            type="button"
          >
            {APP_EMOJI.action.redeem} 為 {member.name} 兌換積分
          </button>
          {member.availablePoints <= 0 ? (
            <p className="text-center text-[0.8125rem] text-[#86868b]">目前無可兌換積分</p>
          ) : (
            <p className="text-center text-[0.8125rem] text-[#86868b]">
              可兌換 {formatPointsValue(member.availablePoints)} 分
            </p>
          )}
        </div>
      ) : null}

      {redemptions.length > 0 ? (
        <div className="mt-5">
          <p className="text-[0.875rem] font-semibold text-[#1d1d1f]">
            {APP_EMOJI.section.activity} 兌換紀錄
          </p>
          <ul className="mt-3 space-y-2">
            {redemptions.slice(-5).reverse().map((item) => (
              <li
                key={item.id}
                className="rounded-xl bg-[var(--brand-bg)] px-3 py-2.5 text-[0.8125rem] text-[#636366]"
              >
                <p className="font-medium text-[#1d1d1f]">
                  -{formatPointsValue(item.points)} · {item.prizeDescription}
                </p>
                <p className="mt-0.5 text-[#86868b]">
                  {String(item.redeemedAt).slice(0, 10)}
                  {item.note ? ` · ${item.note}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <PointRedemptionModal
        availablePoints={member.availablePoints}
        downlineMemberId={member.memberId}
        downlineName={member.name}
        onClose={() => setRedemptionOpen(false)}
        onRedeemed={onRankAdjusted}
        open={redemptionOpen}
      />

      {canAdjustRank ? (
        <div className="mt-5 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-primary-muted)] px-4 py-4">
          <p className="text-[0.875rem] font-semibold text-[#1d1d1f]">調整位階</p>
          <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">推廣組以上可調整下線夥伴</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <select
              className="flex-1 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2.5 text-[0.9375rem]"
              onChange={(event) => setRankKey(event.target.value)}
              value={rankKey}
            >
              <option value="">選擇新位階…</option>
              {rankOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              className="rounded-xl bg-[var(--brand-primary)] px-5 py-2.5 text-[0.9375rem] font-semibold text-white disabled:opacity-60"
              disabled={!rankKey || isSaving}
              onClick={handleRankSave}
              type="button"
            >
              {isSaving ? "儲存中…" : "確認調整"}
            </button>
          </div>
          {saved ? (
            <p className="mt-2 text-[0.8125rem] font-medium text-[#248a3d]">位階已更新</p>
          ) : null}
          {error ? <p className="mt-2 text-[0.8125rem] text-[#ff375f]">{error}</p> : null}
        </div>
      ) : null}

      {member.nextQualification.nextRankLabel ? (
        <div className="mt-5 rounded-2xl bg-[var(--brand-primary-light)] px-4 py-4">
          <p className="text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]">
            下一階：{member.nextQualification.nextRankLabel}
          </p>
          {member.nextQualification.currentSummary ? (
            <p className="mt-2 text-[0.9375rem] text-[#1d1d1f]">
              目前：{member.nextQualification.currentSummary}
            </p>
          ) : null}
          {member.nextQualification.remainingSummary ? (
            <p className="mt-1 text-[0.9375rem] font-medium text-[#ff375f]">
              還差：{member.nextQualification.remainingSummary}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 text-[0.9375rem] text-[#86868b]">已達最高資格或目標尚未定義</p>
      )}
    </section>
  );
}
