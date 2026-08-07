"use client";

import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import {
  getMemberProfileCompleteness,
  loadMemberById,
} from "@/lib/members/member-service";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import Link from "next/link";
import { useMemo } from "react";
import { ProgressBar } from "@/components/home/ui";

export function ProfileSetupSection() {
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const memberId = resolveAuthenticatedMemberId(storage);
  const member = loadMemberById(memberId, storage);
  const completeness = member
    ? getMemberProfileCompleteness(member)
    : { percent: 0, missingLabels: [], isComplete: false };

  const ctaLabel = completeness.isComplete ? "編輯個人資料" : "建立個人資料";
  const editHref = `/members/${memberId}/edit`;
  const previewHref = `/members/${memberId}`;

  return (
    <section className="rounded-[1.75rem] border border-[var(--brand-border)] bg-gradient-to-br from-[#f0faf3] to-white p-5 sm:p-6">
      <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[var(--brand-primary-dark)]">
        給上線看的個人頁
      </p>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#636366]">
        填好電話、LINE、目標，上線在組織圖和會員頁就能認識你。
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-[0.875rem] font-medium text-[#1d1d1f]">資料完成度</p>
        <span className="text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]">
          {completeness.percent}%
        </span>
      </div>
      <ProgressBar color="#77b539" percent={completeness.percent} />

      {!completeness.isComplete && completeness.missingLabels.length > 0 ? (
        <p className="mt-3 text-[0.8125rem] text-[#86868b]">
          還差：{completeness.missingLabels.join("、")}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-2.5">
        <Link
          className="inline-flex w-full items-center justify-center rounded-2xl bg-[#1d1d1f] px-5 py-3.5 text-[0.9375rem] font-semibold text-white transition-transform active:scale-[0.98]"
          href={editHref}
        >
          {ctaLabel}
        </Link>
        <Link
          className="inline-flex w-full items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-white px-5 py-3 text-[0.875rem] font-semibold text-[#636366] transition-colors active:bg-[var(--brand-bg)]"
          href={previewHref}
        >
          預覽上線看到的頁面
        </Link>
      </div>
    </section>
  );
}
