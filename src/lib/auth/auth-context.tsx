"use client";

import {
  getCurrentMember,
  logoutAccount,
  restoreCloudSession,
  restoreCloudSessionFast,
} from "@/lib/auth/auth-service";
import { getCloudBackgroundSyncVersion } from "@/lib/auth/cloud-sync";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { AuthSession } from "@/types/auth";
import { normalizeEmail } from "@/types/auth";
import type { Member } from "@/types/member";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface AuthContextValue {
  session: AuthSession | null;
  member: Member | null;
  isLoading: boolean;
  cloudSyncVersion: number;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cloudSyncVersion, setCloudSyncVersion] = useState(0);
  /** Invalidate in-flight background reconcile on logout / refresh / account change. */
  const authGenerationRef = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++authGenerationRef.current;
    const storage = createLocalStorageAdapter();
    setIsLoading(true);

    const stillCurrent = () => generation === authGenerationRef.current;

    try {
      const {
        clearSensitiveResourceCache,
        ensureResourceCacheOwner,
      } = await import("@/lib/client-cache/resource-cache");

      // Critical path: Supabase getSession + local read only (no members network).
      const fast = await restoreCloudSessionFast(storage);
      if (!stillCurrent()) return;

      if (fast.path === "signed_out") {
        clearSensitiveResourceCache();
        setSession(null);
        setMember(null);
        setCloudSyncVersion(getCloudBackgroundSyncVersion());
        return;
      }

      if (fast.path === "fast") {
        // Confirm identity → bind cache owner → then paint (never reverse this order)
        ensureResourceCacheOwner(fast.session.memberId);
        setSession(fast.session);
        setMember(fast.member);
        setCloudSyncVersion(getCloudBackgroundSyncVersion());
        setIsLoading(false);

        // Background full reconcile (fetchCloudMemberByEmail + sync) — do not block AuthGate
        const expectedEmail = fast.supabaseEmail;
        void (async () => {
          try {
            const restored = await restoreCloudSession(storage);
            if (!stillCurrent()) return;
            if (!restored) return;
            if (normalizeEmail(restored.email) !== expectedEmail) return;
            ensureResourceCacheOwner(restored.memberId);
            setSession(restored);
            setMember(getCurrentMember(storage));
            setCloudSyncVersion(getCloudBackgroundSyncVersion());
          } catch {
            /* keep fast-path paint; background failure is non-fatal */
          }
        })();
        return;
      }

      // needs_full — email mismatch must never flash prior account PII/cache
      if (fast.reason === "email_mismatch") {
        clearSensitiveResourceCache();
      }

      const restored = await restoreCloudSession(storage);
      if (!stillCurrent()) return;

      if (restored?.memberId) {
        ensureResourceCacheOwner(restored.memberId);
        setSession(restored);
        setMember(getCurrentMember(storage));
      } else {
        clearSensitiveResourceCache();
        setSession(null);
        setMember(null);
      }
      setCloudSyncVersion(getCloudBackgroundSyncVersion());
    } catch {
      if (!stillCurrent()) return;
      setSession(null);
      setMember(null);
    } finally {
      if (stillCurrent()) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const pollBackgroundSync = async () => {
      const { getCloudBackgroundSyncPromise } = await import("@/lib/auth/cloud-sync");
      const pending = getCloudBackgroundSyncPromise();
      if (!pending) {
        return;
      }
      await pending;
      if (!cancelled) {
        const storage = createLocalStorageAdapter();
        setMember(getCurrentMember(storage));
        setCloudSyncVersion(getCloudBackgroundSyncVersion());
      }
    };

    void pollBackgroundSync();
    return () => {
      cancelled = true;
    };
  }, [session?.memberId, isLoading]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
  }, [refresh]);

  const signOut = useCallback(async () => {
    // Bump generation first so any in-flight background reconcile cannot re-apply
    authGenerationRef.current += 1;
    const { clearSensitiveResourceCache } = await import("@/lib/client-cache/resource-cache");
    clearSensitiveResourceCache();
    await logoutAccount(createLocalStorageAdapter());
    setSession(null);
    setMember(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      member,
      isLoading,
      cloudSyncVersion,
      refresh,
      signOut,
    }),
    [session, member, isLoading, cloudSyncVersion, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
