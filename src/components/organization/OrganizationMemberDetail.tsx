"use client";

import { adjustDownlineRank } from "@/lib/members/adjust-downline-rank";
import { buildMemberActivitySummary } from "@/lib/organization/member-activity-summary";
import { todayISODate } from "@/lib/config/app-config";
import { MemberNameWithAvatar } from "@/components/members/MemberNameWithAvatar";
import { getRegistrationRankOptions } from "@/lib/auth/registration-ranks";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { BakiEvent } from "@/types/baki-event";
import type { OrganizationMemberView } from "@/types/organization-center";
import { ProgressBar } from "@/components/home/ui";
import { useMemo, useState } from "react";

export function OrganizationMemberDetail({
  member,
  canAdjustRank,
  downlineEvents = [],
  onRankAdjusted,
}: {
  member: OrganizationMemberView;
  canAdjustRank: boolean;
  downlineEvents?: BakiEvent[];
  onRankAdjusted?: () => void;
}) {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const rankOptions = useMemo(() => getRegistrationRankOptions(), []);
  const [selectedRank, setSelectedRank] = useState(member.qualificationLabel);
  const [rankKey, setRankKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const activitySummary = useMemo(
    () => buildMemberActivitySummary(member.memberId, todayISODate(), storage, downlineEvents),
    [downlineEvents, member.memberId, storage],
  );

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
    <section className="rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-5 shadow-[0_1px_2px_rgba(29,29,31,0.04)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
            夥伴詳情
          </p>
          <MemberNameWithAvatar
            avatarUrl={member.avatarUrl}
            className="mt-2"
            name={member.name}
            nameClassName="text-[1.375rem] font-semibold text-[var(--brand-text)]"
            size="lg"
            subtitle={
              <>
                {member.memberNumber ? (
                  <span className="font-medium text-[var(--brand-primary-dark)]">
                    會員編號 {member.memberNumber}
                    {" · "}
                  </span>
                ) : null}
                {selectedRank || currentRankLabel}
              </>
            }
            subtitleClassName="text-[0.9375rem] text-[var(--brand-text-muted)]"
            variant="hero"
          />
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold ${
            member.metMonthlyVp2500
              ? "bg-[var(--brand-primary-muted)] text-[var(--brand-primary-dark)]"
              : "bg-[#fff4e5] text-[#b25000]"
          }`}
        >
          {member.metMonthlyVp2500 ? "本月達標" : "本月未達標"}
        </span>
      </div>

      <div className="mt-5 rounded-[1rem] bg-[var(--brand-bg)] px-4 py-4">
        <p className="text-[0.75rem] font-medium text-[var(--brand-text-muted)]">本月 VP</p>
        <p className="mt-1 text-[1.5rem] font-semibold tabular-nums tracking-tight text-[var(--brand-text)]">
          {member.productVpStatus === "error" ? (
            <span className="text-[1.125rem] font-medium text-[var(--brand-text-muted)]">—</span>
          ) : (
            <>
              {member.monthlyVp.toLocaleString("zh-Hant")}
              {member.monthlyVpTarget !== null ? (
                <span className="text-[0.9375rem] font-normal text-[var(--brand-text-muted)]">
                  {" "}
                  / {member.monthlyVpTarget.toLocaleString("zh-Hant")}
                </span>
              ) : null}
            </>
          )}
        </p>
        {monthlyVpPercent !== null && member.productVpStatus !== "error" ? (
          <div className="mt-3">
            <ProgressBar color="var(--brand-primary)" height="h-1" percent={monthlyVpPercent} />
            <p className="mt-1.5 text-[0.75rem] font-medium text-[var(--brand-text-muted)]">
              {monthlyVpPercent}%
            </p>
          </div>
        ) : null}
        <p className="mt-2 text-[0.75rem] leading-relaxed text-[var(--brand-hint)]">
          {member.productVpStatus === "error"
            ? "零售屋產品 VP 暫時無法讀取"
            : "以零售屋本月產品 VP 為準"}
        </p>
      </div>

      <div className="mt-4 rounded-[1rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] px-4 py-4">
        <p className="text-[0.875rem] font-semibold text-[var(--brand-text)]">本月活動狀態</p>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-[0.75rem] text-[var(--brand-text-muted)]">諮詢</dt>
            <dd className="mt-0.5 text-[1.125rem] font-semibold tabular-nums text-[var(--brand-text)]">
              {activitySummary.monthlyConsultations} 次
            </dd>
          </div>
          <div>
            <dt className="text-[0.75rem] text-[var(--brand-text-muted)]">量測</dt>
            <dd className="mt-0.5 text-[1.125rem] font-semibold tabular-nums text-[var(--brand-text)]">
              {activitySummary.monthlyMeasurements} 次
            </dd>
          </div>
        </dl>
        <div className="mt-3">
          <p className="text-[0.75rem] font-medium text-[var(--brand-text-muted)]">近期參加會議</p>
          {activitySummary.recentMeetings.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {activitySummary.recentMeetings.map((meeting) => (
                <li
                  key={`${meeting.date}-${meeting.title}`}
                  className="text-[0.8125rem] text-[var(--brand-text-secondary)]"
                >
                  <span className="font-medium text-[var(--brand-text)]">{meeting.title}</span>
                  <span className="text-[var(--brand-text-muted)]"> · {meeting.date}</span>
                  <span className="text-[var(--brand-primary-dark)]">
                    {" "}
                    · 帶 {meeting.newFriendsCount} 位新朋友
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[0.8125rem] text-[var(--brand-text-muted)]">尚無會議紀錄</p>
          )}
        </div>
      </div>

      {canAdjustRank ? (
        <div className="mt-4 rounded-[1rem] border border-[var(--brand-border)]/80 bg-[var(--brand-primary-muted)] px-4 py-4">
          <p className="text-[0.875rem] font-semibold text-[var(--brand-text)]">調整位階</p>
          <p className="mt-0.5 text-[0.8125rem] text-[var(--brand-text-muted)]">
            推廣組以上可調整下線夥伴
          </p>
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
            <p className="mt-2 text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]">
              位階已更新
            </p>
          ) : null}
          {error ? <p className="mt-2 text-[0.8125rem] text-[#ff375f]">{error}</p> : null}
        </div>
      ) : null}

      {member.nextQualification.nextRankLabel ? (
        <div className="mt-4 rounded-[1rem] bg-[var(--brand-primary-light)] px-4 py-4">
          <p className="text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]">
            下一階：{member.nextQualification.nextRankLabel}
          </p>
          {member.nextQualification.currentSummary ? (
            <p className="mt-2 text-[0.9375rem] text-[var(--brand-text)]">
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
        <p className="mt-4 text-[0.9375rem] text-[var(--brand-text-muted)]">
          已達最高資格或目標尚未定義
        </p>
      )}
    </section>
  );
}
