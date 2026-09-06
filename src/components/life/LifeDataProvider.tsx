"use client";

import { lifeFetch } from "@/lib/life/client";
import type { LifeAccount, LifeCategory } from "@/types/life";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type QuickBootstrap = {
  categories: LifeCategory[];
  expenseCategories: LifeCategory[];
  incomeCategories: LifeCategory[];
  accounts: LifeAccount[];
  lastExpenseAccountId: string | null;
  lastIncomeAccountId: string | null;
};

type LifeDataContextValue = {
  ready: boolean;
  loading: boolean;
  error: string | null;
  accounts: LifeAccount[];
  expenseCategories: LifeCategory[];
  incomeCategories: LifeCategory[];
  lastExpenseAccountId: string | null;
  lastIncomeAccountId: string | null;
  refreshQuick: () => Promise<void>;
  invalidate: () => void;
  /** Bumps when finance mutations land — panels soft-refresh. */
  mutationEpoch: number;
};

const LifeDataContext = createContext<LifeDataContextValue | null>(null);

/**
 * Shared Life bootstrap cache. Accounts/categories survive tab switches.
 * Call invalidate() after mutations that change seed lists or balances.
 */
export function LifeDataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<QuickBootstrap | null>(null);
  const [mutationEpoch, setMutationEpoch] = useState(0);
  const inflight = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    if (inflight.current) return inflight.current;
    const run = (async () => {
      try {
        const next = await lifeFetch<QuickBootstrap>("/api/life/quick");
        setData({
          categories: next.expenseCategories ?? next.categories ?? [],
          expenseCategories: next.expenseCategories ?? next.categories ?? [],
          incomeCategories: next.incomeCategories ?? [],
          accounts: next.accounts ?? [],
          lastExpenseAccountId: next.lastExpenseAccountId ?? null,
          lastIncomeAccountId: next.lastIncomeAccountId ?? null,
        });
        setError(null);
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "載入失敗");
        setReady(true);
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = run;
    return run;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const invalidate = useCallback(() => {
    setMutationEpoch((n) => n + 1);
    void load();
  }, [load]);

  const value = useMemo<LifeDataContextValue>(
    () => ({
      ready,
      loading: !ready,
      error,
      accounts: data?.accounts ?? [],
      expenseCategories: data?.expenseCategories ?? [],
      incomeCategories: data?.incomeCategories ?? [],
      lastExpenseAccountId: data?.lastExpenseAccountId ?? null,
      lastIncomeAccountId: data?.lastIncomeAccountId ?? null,
      refreshQuick: load,
      invalidate,
      mutationEpoch,
    }),
    [ready, error, data, load, invalidate, mutationEpoch],
  );

  return <LifeDataContext.Provider value={value}>{children}</LifeDataContext.Provider>;
}

export function useLifeData() {
  const ctx = useContext(LifeDataContext);
  if (!ctx) throw new Error("useLifeData must be used within LifeDataProvider");
  return ctx;
}
