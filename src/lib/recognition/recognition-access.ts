import { normalizePathname } from "@/lib/auth/public-paths";
import {
  ADMIN_AUTHORITY,
  ADMIN_CENTER_HOME_ENTRY,
  decideAdminAccess,
  homeMoreEntriesForViewer as homeMoreEntriesForAdminViewer,
  RECOGNITION_CENTER_ENTRY,
  type AdminAccessDecision,
} from "@/lib/auth/admin-access";
import type { HomeMoreEntry } from "@/lib/home/my-home-presentation";

/**
 * Canonical Recognition Center authority is the same Super Admin source
 * as Admin Center. See `src/lib/auth/super-admin.ts`.
 */
export const RECOGNITION_ADMIN_AUTHORITY = ADMIN_AUTHORITY;

export type RecognitionAccessDecision = AdminAccessDecision;

export const RECOGNITION_CENTER_HOME_ENTRY: HomeMoreEntry = RECOGNITION_CENTER_ENTRY;

export const decideRecognitionAdminAccess = decideAdminAccess;

export { ADMIN_CENTER_HOME_ENTRY, homeMoreEntriesForAdminViewer as homeMoreEntriesForViewer };

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

