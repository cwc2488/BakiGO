import { normalizePathname } from "@/lib/auth/public-paths";
import type { HomeMoreEntry } from "@/lib/home/my-home-presentation";

/**
 * Canonical Admin Center / Recognition Center authority:
 * `SUPER_ADMIN_MEMBER_NUMBERS` via `isSuperAdmin` / `resolveIsSuperAdmin`.
 *
 * Not inferred from career rank, president status, a client-provided role,
 * or `recognition_admin_members` rows. The Super Admin 會員編號 lives only
 * in `src/lib/auth/super-admin.ts`.
 */
export const ADMIN_AUTHORITY = {
  source: "src/lib/auth/super-admin.ts",
  memberNumbers: "SUPER_ADMIN_MEMBER_NUMBERS",
  resolver: "resolveIsSuperAdmin",
} as const;

export type AdminAccessDecision = "unauthenticated" | "forbidden" | "allowed";

export const ADMIN_CENTER_HOME_ENTRY: HomeMoreEntry = {
  href: "/admin",
  title: "管理中心",
};

export const RECOGNITION_CENTER_ENTRY: HomeMoreEntry = {
  href: "/recognition",
  title: "表揚中心",
};

export const ADMIN_CENTER_EXISTING_TOOLS: readonly HomeMoreEntry[] = [
  { href: "/organization", title: "我的組織" },
  { href: "/members", title: "夥伴關懷" },
  { href: "/profile", title: "個人資料／設定" },
] as const;

export function decideAdminAccess(input: {
  memberId: string | null | undefined;
  isAdmin: boolean;
}): AdminAccessDecision {
  if (!input.memberId) return "unauthenticated";
  if (!input.isAdmin) return "forbidden";
  return "allowed";
}

export function isAdminCenterPagePath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return normalized === "/admin" || normalized.startsWith("/admin/");
}

export function isAdminCenterApiPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return normalized === "/api/admin" || normalized.startsWith("/api/admin/");
}

export function homeMoreEntriesForViewer(
  entries: readonly HomeMoreEntry[],
  isSuperAdmin: boolean,
): HomeMoreEntry[] {
  const withoutAdminSurfaces = entries.filter(
    (entry) =>
      entry.href !== ADMIN_CENTER_HOME_ENTRY.href &&
      entry.href !== RECOGNITION_CENTER_ENTRY.href,
  );
  if (!isSuperAdmin) return withoutAdminSurfaces;
  const profileIndex = withoutAdminSurfaces.findIndex((entry) => entry.href === "/profile");
  if (profileIndex === -1) {
    return [...withoutAdminSurfaces, ADMIN_CENTER_HOME_ENTRY];
  }
  return [
    ...withoutAdminSurfaces.slice(0, profileIndex),
    ADMIN_CENTER_HOME_ENTRY,
    ...withoutAdminSurfaces.slice(profileIndex),
  ];
}
