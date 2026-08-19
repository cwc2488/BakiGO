export const RESET_ENTRY = "reset_v1" as const;
export const RESET_SCHEMA_VERSION = "conversation_reset_v1" as const;
export const RESET_META_KEY = "__resetV1" as const;
export const RESET_CONVERSATION_PROMPT_VERSION = "conversation_reset_v1" as const;
export const RESET_REPORT_PROMPT_VERSION = "conversation_reset_report_v1" as const;
export const RESET_MODEL = "gpt-4.1" as const;
export const RESET_OPENING =
  "你最近為什麼會開始想改變自己的體態？";
export const RESET_HARD_MAX_TURNS = 10 as const;
export const RESET_MIN_TURNS_BEFORE_CLOSE = 4 as const;
export const RESET_TIMEOUT_MS = 28_000 as const;
export const RESET_MAX_OUTPUT_TOKENS = 1600 as const;
export const RESET_REPORT_MAX_TOKENS = 900 as const;

export function isResetPreviewAllowed(): boolean {
  return true;
}
