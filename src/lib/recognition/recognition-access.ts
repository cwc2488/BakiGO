import { normalizePathname } from "@/lib/auth/public-paths";
import type { HomeMoreEntry } from "@/lib/home/my-home-presentation";

/**
 * Canonical Recognition Center / administration-center authority:
 * `SUPER_ADMIN_MEMBER_NUMBERS` via `isSuperAdmin` / `resolveIsSuperAdmin`.
 *
 * Not inferred from career rank, president status, a client-provided role,
 * or `recognition_admin_members` rows. The Super Admin 會員編號 lives only
 * in `src/lib/auth/super-admin.ts`.
 */
export const RECOGNITION_ADMIN_AUTHORITY = {
  source: "src/lib/auth/super-admin.ts",
  memberNumbers: "SUPER_ADMIN_MEMBER_NUMBERS",
  resolver: "resolveIsSuperAdmin",
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
