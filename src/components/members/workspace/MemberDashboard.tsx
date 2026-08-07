"use client";

import { formatShortDate } from "@/lib/mission-control/format";
import type { MemberDashboardSnapshot } from "@/types/member-workspace";
import { CrmCard, CrmSectionTitle } from "../ui";

function DashboardTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <article className="rounded-2xl bg-[var(--brand-bg)] px-4 py-4">
      <p className="text-[0.8125rem] text-[#86868b]">{label}</p>
      <p className="mt-1 text-[1.0625rem] font-semibold text-[#1d1d1f]">{value}</p>
      {detail ? <p className="mt-1 text-[0.8125rem] text-[#86868b]">{detail}</p> : null}
    </article>
  );
}

function formatOptionalDate(date: string | null): string {
  return date ? formatShortDate(date) : "—";
}

export function MemberDashboard({ dashboard }: { dashboard: MemberDashboardSnapshot }) {
  return (
    <CrmCard>
      <CrmSectionTitle>會員總覽</CrmSectionTitle>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <DashboardTile label="目前等級" value={dashboard.currentRank} />
        <DashboardTile label="VP" value={`${dashboard.vp} VP`} />
        <DashboardTile label="任務" value={dashboard.missionLabel} />
        <DashboardTile label="今日建議" value={dashboard.presidentAiLabel} />
        <DashboardTile
          label="本月成交"
          value={`${dashboard.monthlyTransactionCount} 筆`}
        />
        <DashboardTile
          label="最近一次量測"
          value={formatOptionalDate(dashboard.lastInBodyDate)}
          detail={dashboard.lastInBodySummary}
        />
        <DashboardTile
          label="最近一次成交"
          value={formatOptionalDate(dashboard.lastTransactionDate)}
          detail={dashboard.lastTransactionSummary}
        />
        <DashboardTile
          label="最近一次諮詢"
          value={formatOptionalDate(dashboard.lastConsultationDate)}
          detail={dashboard.lastConsultationSummary}
        />
      </div>
    </CrmCard>
  );
}
