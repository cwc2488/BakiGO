"use client";

import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { useEffect, useState } from "react";

/**
 * Client-side hook that checks Super Admin via the canonical server API.
 * Components must not hard-code the Super Admin 會員編號.
 */
export function useSuperAdmin(): {
  isAdmin: boolean | null;
  isLoading: boolean;
} {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetchWithMemberAuth("/api/admin/me");
        if (!cancelled) {
          setIsAdmin(res.ok);
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return { isAdmin, isLoading };
}
