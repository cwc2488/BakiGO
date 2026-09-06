"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { LifeTabId } from "@/components/life/life-tabs";

const LifePanelActivityContext = createContext<LifeTabId | null>(null);

/** Provides the currently visible Life tab so panels can skip work when hidden. */
export function LifePanelActivityProvider({
  activeTab,
  children,
}: {
  activeTab: LifeTabId;
  children: ReactNode;
}) {
  return (
    <LifePanelActivityContext.Provider value={activeTab}>
      {children}
    </LifePanelActivityContext.Provider>
  );
}

export function useLifePanelActive(panel: LifeTabId): boolean {
  return useContext(LifePanelActivityContext) === panel;
}
