/** 全 App 賀寶芙白綠品牌色 */
export const BRAND_COLORS = {
  bg: "#f5faf6",
  surface: "#ffffff",
  border: "#dce8df",
  primary: "#77b539",
  primaryDark: "#248a3d",
  primaryLight: "#e8f8ee",
  primaryMuted: "#f0faf3",
  text: "#1d1d1f",
  textSecondary: "#636366",
  textMuted: "#86868b",
  hint: "#aeaeb2",
} as const;

/** @deprecated 使用 BRAND_COLORS */
export const CALENDAR_THEME = {
  bg: "var(--brand-bg)",
  surface: "var(--brand-surface)",
  border: "var(--brand-border)",
  primary: "var(--brand-primary)",
  primaryDark: "var(--brand-primary-dark)",
  primaryLight: "var(--brand-primary-light)",
  primaryMuted: "var(--brand-primary-muted)",
  text: "var(--brand-text)",
  textSecondary: "var(--brand-text-secondary)",
  textMuted: "var(--brand-text-muted)",
  hint: "var(--brand-hint)",
} as const;
