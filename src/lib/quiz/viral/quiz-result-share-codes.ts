import { PRODUCTION_APP_ORIGIN } from "@/lib/app/public-origin";
import { isOpaqueShareCode } from "@/lib/quiz/partner/quiz-partner-presentation";

export function normalizeResultShareCode(code: string | null | undefined): string | null {
  const normalized = String(code ?? "")
    .trim()
    .toUpperCase();
  if (!isOpaqueShareCode(normalized)) return null;
  return normalized;
}

export function canonicalResultShareHref(code: string): string {
  const normalized = normalizeResultShareCode(code);
  if (!normalized) return `${PRODUCTION_APP_ORIGIN}/s`;
  return `${PRODUCTION_APP_ORIGIN}/s/${normalized}`;
}

export function canonicalResultShareDisplay(code: string): string {
  const normalized = normalizeResultShareCode(code);
  if (!normalized) return "bakigo.tw/s";
  return `bakigo.tw/s/${normalized}`;
}

export function resultShareLandingPath(code: string): string {
  const normalized = normalizeResultShareCode(code);
  return normalized ? `/quiz/fat-loss?rs=${encodeURIComponent(normalized)}` : "/quiz/fat-loss";
}
