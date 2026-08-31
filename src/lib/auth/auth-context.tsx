"use client";

import {
  getCurrentMember,
  getCurrentSession,
  logoutAccount,
  restoreCloudSession,
} from "@/lib/auth/auth-service";
import { getCloudBackgroundSyncVersion } from "@/lib/auth/cloud-sync";
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
      // Session restore starts background cloud sync (members + retail + app-data).
      // Do NOT await Retail House reconciliation on the auth-critical path —
      // that blocked first paint with duplicate cloud merges.
      const restored = await restoreCloudSession(storage);
      const nextSession = restored ?? getCurrentSession(storage);
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
