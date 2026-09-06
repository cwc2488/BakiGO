"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { LifeTabId } from "@/components/life/life-tabs";
import { lifeHrefForTab } from "@/components/life/life-tabs";

type LifeTabContextValue = {
  activeTab: LifeTabId;
  selectTab: (tab: LifeTabId) => void;
};

const LifeTabContext = createContext<LifeTabContextValue | null>(null);

export function LifeTabProvider({
  activeTab,
  onSelectTab,
  children,
}: {
  activeTab: LifeTabId;
  onSelectTab: (tab: LifeTabId) => void;
  children: ReactNode;
}) {
  const selectTab = useCallback(
    (tab: LifeTabId) => {
      onSelectTab(tab);
    },
    [onSelectTab],
  );

  const value = useMemo(
    () => ({ activeTab, selectTab }),
    [activeTab, selectTab],
  );

  return (
    <LifeTabContext.Provider value={value}>{children}</LifeTabContext.Provider>
  );
}

export function useLifeTab() {
  const ctx = useContext(LifeTabContext);
  if (!ctx) throw new Error("useLifeTab must be used within LifeTabProvider");
  return ctx;
}

export function useOptionalLifeTab() {
  return useContext(LifeTabContext);
}

/** Sync URL without Next App Router / RSC navigation. */
export function syncLifeTabUrl(tab: LifeTabId) {
  if (typeof window === "undefined") return;
  const href = lifeHrefForTab(tab);
  if (window.location.pathname === href) return;
  window.history.pushState({ lifeTab: tab }, "", href);
}
