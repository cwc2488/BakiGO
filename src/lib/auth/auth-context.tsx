"use client";

import {
  getCurrentMember,
  getCurrentSession,
  logoutAccount,
  ensureBootstrapPresidentAccount,
} from "@/lib/auth/auth-service";
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
  refresh: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    const storage = createLocalStorageAdapter();
    void ensureBootstrapPresidentAccount(storage).finally(() => {
      setSession(getCurrentSession(storage));
      setMember(getCurrentMember(storage));
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      refresh();
    });
  }, [refresh]);

  const signOut = useCallback(() => {
    logoutAccount(createLocalStorageAdapter());
    setSession(null);
    setMember(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      member,
      isLoading,
      refresh,
      signOut,
    }),
    [session, member, isLoading, refresh, signOut],
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
