import { formatShortDisplayDate } from "@/lib/five-plus-five/dates";
import type { FivePlusFiveMyStats, FivePlusFiveOrgSummary } from "@/types/five-plus-five";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/** Personal war report for clipboard (no screenshot). */
export function formatPersonalWarReport(stats: FivePlusFiveMyStats): string {
  const dateLabel = formatShortDisplayDate(stats.todayDate);
  const fishOk = stats.today.hasReport && stats.today.fishMet;
  const fishLine = stats.today.hasReport
    ? `🐟 今日魚池：${stats.today.fishPool}/${stats.today.fishTarget}${fishOk ? " ✅" : ""}`
    : `🐟 今日魚池：尚未回報`;

  return [
    `【5＋5 行動回報｜${stats.memberName}｜${dateLabel}】`,
    "",
    fishLine,
    `🎯 今日邀約5步驟：+${stats.today.invitationFiveSteps}`,
    "",
    "📅 本週",
    `🐟 魚池：+${stats.week.fishPool}/${stats.week.fishTarget}`,
    `🎯 邀約5步驟：${stats.week.invitationFiveSteps}/${stats.week.invitationTarget}`,
    "",
    "📊 本月",
    `🐟 魚池：+${fmt(stats.month.fishPool)}`,
    `🎯 邀約5步驟：+${fmt(stats.month.invitationFiveSteps)}`,
    "",
    "🏆 歷史累積",
    `🐟 魚池：+${fmt(stats.history.fishPool)}`,
    `🎯 邀約5步驟：+${fmt(stats.history.invitationFiveSteps)}`,
    "",
    `🔥 連續準時回報：${stats.streakOnTimeDays}天`,
  ].join("\n");
}

export function formatOrganizationWarReport(summary: FivePlusFiveOrgSummary): string {
  const dateLabel = formatShortDisplayDate(summary.todayDate);
  return [
    `【5＋5 組織戰報｜${dateLabel}】`,
    "",
    `👥 應回報：${summary.totalMembers}人`,
    `✅ 已回報：${summary.reportedToday}人`,
    `🐟 今日魚池達標：${summary.fishMetToday}人`,
    `🎯 本週邀約5步驟達標：${summary.invitationMetThisWeek}人`,
    `⏳ 尚未回報：${summary.notReportedToday}人`,
  ].join("\n");
}
