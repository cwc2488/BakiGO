import type { TrainingChecklistEntry } from "@/types/training-checklist";

export function buildIncompleteCount(
  activeItemCount: number,
  completedActiveItemCount: number,
): number {
  return Math.max(0, activeItemCount - completedActiveItemCount);
}

export function partitionChecklistEntries(entries: TrainingChecklistEntry[]): {
  incomplete: TrainingChecklistEntry[];
  completed: TrainingChecklistEntry[];
} {
  return {
    incomplete: entries.filter((entry) => entry.status === "incomplete"),
    completed: entries.filter((entry) => entry.status === "completed"),
  };
}

export function formatTrainingSignedDate(iso: string): string {
  const day = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return day.replaceAll("-", "/");
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso.slice(0, 10);
  }
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

/** V1 seed names — used by regression tests (must not contain「360」). */
export const TRAINING_V1_ITEM_NAMES = [
  "開名單轉介紹",
  "主動釣竿（1）",
  "主動釣竿（2）",
  "被動釣竿（1）",
  "HOM",
  "STS",
  "商機",
  "月會",
  "90天行動計畫",
  "市場行銷計畫",
  "分店巡禮5家",
  "馬克培訓／賀寶芙文化",
  "麗寶成就營",
  "屏東摘星山莊",
  "EMS 體驗",
  "跳床體驗",
  "頭療體驗",
  "XPRO 深度營養培訓",
  "BeU 體驗",
  "促銷 ABC",
  "會前會圖製作",
  "認識績優組",
  "締結諮詢",
  "售後服務",
  "邀約會議",
] as const;

export const TRAINING_V1_ITEM_KEYS = [
  "open_list_referral",
  "active_rod_1",
  "active_rod_2",
  "passive_rod_1",
  "hom",
  "sts",
  "business_opportunity",
  "monthly_meeting",
  "ninety_day_action_plan",
  "marketing_plan",
  "branch_tour_5",
  "mark_herbalife_culture",
  "lihpao_achievement_camp",
  "pingtung_star_villa",
  "ems_experience",
  "trampoline_experience",
  "scalp_therapy_experience",
  "xpro_deep_nutrition",
  "beu_experience",
  "promotion_abc",
  "pre_meeting_graphic",
  "meet_top_performers",
  "closing_consultation",
  "after_sales_service",
  "invite_meeting",
] as const;
