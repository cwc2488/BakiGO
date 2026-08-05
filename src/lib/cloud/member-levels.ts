/** Registration 目前資格 options — cloud `current_level` values (not business-rule edits). */
export const CLOUD_MEMBER_LEVELS = [
  { value: "map", label: "MAP" },
  { value: "supervisor", label: "督導" },
  { value: "active_supervisor", label: "活躍督導" },
  { value: "world_team", label: "世界組" },
  { value: "promotion_group", label: "推廣組" },
  { value: "wealth_group", label: "富豪組" },
  { value: "president", label: "總裁組" },
] as const;

export type CloudMemberLevel = (typeof CLOUD_MEMBER_LEVELS)[number]["value"];

export function isValidCloudMemberLevel(value: string): value is CloudMemberLevel {
  return CLOUD_MEMBER_LEVELS.some((level) => level.value === value);
}

export function getCloudMemberLevelLabel(value: string): string {
  return CLOUD_MEMBER_LEVELS.find((level) => level.value === value)?.label ?? value;
}

export function resolveCloudMemberRole(currentLevel: string): string {
  return currentLevel === "president" ? "president" : "member";
}
