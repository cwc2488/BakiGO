"use client";

import { useSuperAdmin } from "@/lib/auth/use-super-admin";

/**
 * Client-side Super Admin check for Recognition Center.
 * Canonical source: `/api/admin/me` → `resolveIsSuperAdmin`.
 */
export function useRecognitionAdmin(): {
  isAdmin: boolean | null;
  isLoading: boolean;
} {
  return useSuperAdmin();
}
