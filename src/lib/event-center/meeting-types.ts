/** MAP 期間可重複登記的會議類型 — 各類型可多次參加，合計計入 MAP 30 場目標。 */
export const MEETING_KEYS = {
  HOM: "hom",
  STS: "sts",
  BUSINESS_OPPORTUNITY: "business_opportunity",
  NEW_MEMBER_SETUP: "new_member_setup",
  ACHIEVEMENT_CAMP: "achievement_camp",
  STAR_JOURNEY: "star_journey",
  STYLE_JOURNEY: "style_journey",
  GRAND_GATHERING: "grand_gathering",
  NEW_MEMBER_NAVIGATION: "new_member_navigation",
  ONE_DAY_TRAINING: "one_day_training",
  SUPERVISOR_TRAINING: "supervisor_training",
  RO_UNIVERSITY: "ro_university",
  NUTRITION_CLASS: "nutrition_class",
  WEALTH_HEALTH_SEMINAR: "wealth_health_seminar",
} as const;

export type MeetingKey = (typeof MEETING_KEYS)[keyof typeof MEETING_KEYS];

export const MEETING_KEY_LIST: MeetingKey[] = Object.values(MEETING_KEYS);

export const MEETING_LABELS: Record<MeetingKey, string> = {
  [MEETING_KEYS.HOM]: "HOM",
  [MEETING_KEYS.STS]: "STS",
  [MEETING_KEYS.BUSINESS_OPPORTUNITY]: "商機",
  [MEETING_KEYS.NEW_MEMBER_SETUP]: "新人設定",
  [MEETING_KEYS.ACHIEVEMENT_CAMP]: "成就營",
  [MEETING_KEYS.STAR_JOURNEY]: "摘星之旅",
  [MEETING_KEYS.STYLE_JOURNEY]: "風尚之旅",
  [MEETING_KEYS.GRAND_GATHERING]: "風雲盛會",
  [MEETING_KEYS.NEW_MEMBER_NAVIGATION]: "新人導航",
  [MEETING_KEYS.ONE_DAY_TRAINING]: "一日培訓",
  [MEETING_KEYS.SUPERVISOR_TRAINING]: "督導培訓",
  [MEETING_KEYS.RO_UNIVERSITY]: "RO 大學",
  [MEETING_KEYS.NUTRITION_CLASS]: "營養課",
  [MEETING_KEYS.WEALTH_HEALTH_SEMINAR]: "財富健康講座",
};

/** MAP 計劃期間需參加之會議總場次（各類型可重複累計）。 */
export const MAP_MEETING_TARGET = 30;
