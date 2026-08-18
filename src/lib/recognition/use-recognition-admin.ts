"use client";

import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { useEffect, useState } from "react";

/**
 * Client-side hook that checks if the current authenticated user
 * is a Recognition Admin. Uses a lightweight server API call
 * so the check is always authoritative (server-side).
 */
export function useRecognitionAdmin(): {
  isAdmin: boolean | null;
  isLoading: boolean;
} {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetchWithMemberAuth("/api/recognition/admin/me");
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
