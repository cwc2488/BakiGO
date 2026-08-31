"use client";

import {
  getCurrentMember,
  getCurrentSession,
  logoutAccount,
  restoreCloudSession,
} from "@/lib/auth/auth-service";
import { getCloudBackgroundSyncVersion } from "@/lib/auth/cloud-sync";
import { ensureOwnRetailTransactionsReconciled } from "@/lib/cloud/reconcile-retail-transactions";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { AuthSession } from "@/types/auth";
import type { Member } from "@/types/member";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  const refresh = useCallback(async () => {
    const storage = createLocalStorageAdapter();
    setIsLoading(true);

    try {
      const restored = await restoreCloudSession(storage);
      const nextSession = restored ?? getCurrentSession(storage);
      // Await retail legacy upload on every authenticated bootstrap
      // (refresh / PWA / restored session) — do not rely on fire-and-forget sync alone.
      if (nextSession?.memberId) {
        try {
          await ensureOwnRetailTransactionsReconciled({
            storage,
            memberId: nextSession.memberId,
          });
        } catch (error) {
          console.error("[retail_house] retail_reconcile_bootstrap_failure", {
            memberId: nextSession.memberId,
            error,
          });
        }
      }
      setSession(nextSession);
      setMember(nextSession ? getCurrentMember(storage) : null);
      setCloudSyncVersion(getCloudBackgroundSyncVersion());
    } catch {
      setSession(null);
      setMember(null);
    } finally {
      setIsLoading(false);
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
