import { normalizePathname } from "@/lib/auth/public-paths";
import type { HomeMoreEntry } from "@/lib/home/my-home-presentation";

/**
 * Canonical Recognition Center admin authority:
 * `public.recognition_admin_members` where `is_active = true`.
 *
 * This is the existing Recognition Admin allowlist. It is not inferred from
 * career rank, president status, or a client-provided role claim.
 */
export const RECOGNITION_ADMIN_AUTHORITY = {
  table: "recognition_admin_members",
  memberIdColumn: "member_id",
  activeColumn: "is_active",
} as const;

export type RecognitionAccessDecision = "unauthenticated" | "forbidden" | "allowed";

export const RECOGNITION_CENTER_HOME_ENTRY: HomeMoreEntry = {
  href: "/recognition",
  title: "表揚中心",
};

export function decideRecognitionAdminAccess(input: {
  memberId: string | null | undefined;
  isAdmin: boolean;
}): RecognitionAccessDecision {
  if (!input.memberId) return "unauthenticated";
  if (!input.isAdmin) return "forbidden";
  return "allowed";
}

export function isRecognitionPublicCollectionPath(pathname: string): boolean {
  return normalizePathname(pathname).startsWith("/recognition/p/");
}

export function isRecognitionAdminPagePath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (isRecognitionPublicCollectionPath(normalized)) return false;
  return normalized === "/recognition" || normalized.startsWith("/recognition/");
}

export function isRecognitionPublicApiPath(pathname: string): boolean {
  return normalizePathname(pathname).startsWith("/api/recognition/public/");
}

export function isRecognitionAdminApiPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (isRecognitionPublicApiPath(normalized)) return false;
  return normalized === "/api/recognition" || normalized.startsWith("/api/recognition/");
}

export function homeMoreEntriesForViewer(
  entries: readonly HomeMoreEntry[],
  isRecognitionAdmin: boolean,
): HomeMoreEntry[] {
  const withoutRecognition = entries.filter((entry) => entry.href !== RECOGNITION_CENTER_HOME_ENTRY.href);
  if (!isRecognitionAdmin) return withoutRecognition;
  const profileIndex = withoutRecognition.findIndex((entry) => entry.href === "/profile");
  if (profileIndex === -1) {
    return [...withoutRecognition, RECOGNITION_CENTER_HOME_ENTRY];
  }
  return [
    ...withoutRecognition.slice(0, profileIndex),
    RECOGNITION_CENTER_HOME_ENTRY,
    ...withoutRecognition.slice(profileIndex),
  ];
}
