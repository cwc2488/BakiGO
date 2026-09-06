"use client";

import { LifeAnalyticsPage } from "@/components/life/LifeAnalyticsPage";
import { LifeAssetsPage } from "@/components/life/LifeAssetsPage";
import { LifeDashboardPage } from "@/components/life/LifeDashboardPage";
import { LifeDataProvider } from "@/components/life/LifeDataProvider";
import { LifeGoalsPage } from "@/components/life/LifeGoalsPage";
import { LifeQuickPage } from "@/components/life/LifeQuickPage";
import { LifePanelActivityProvider } from "@/components/life/LifePanelActivity";
import {
  LifeTabProvider,
  syncLifeTabUrl,
} from "@/components/life/LifeTabContext";
import {
  LIFE_TABS,
  isLifeAuxPath,
  lifeHrefForTab,
  lifeTabFromPath,
  type LifeTabId,
} from "@/components/life/life-tabs";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

function LifeBottomNav({
  activeTab,
  pressedTab,
  onSelect,
  onPressStart,
  onPressEnd,
}: {
  activeTab: LifeTabId;
  pressedTab: LifeTabId | null;
  onSelect: (tab: LifeTabId) => void;
  onPressStart: (tab: LifeTabId) => void;
  onPressEnd: () => void;
}) {
  return (
    <nav className="life-bottom-nav" aria-label="Baki Life">
      <ul className="life-bottom-nav-inner mx-auto grid max-w-lg grid-cols-5">
        {LIFE_TABS.map((item) => {
          const active = activeTab === item.id || pressedTab === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                data-life-tab={item.id}
                data-active={active ? "true" : "false"}
                aria-current={activeTab === item.id ? "page" : undefined}
                onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
                  if (e.button !== 0) return;
                  // Instant pressed + active on touch down — never wait for pointerup/router.
                  onPressStart(item.id);
                  onSelect(item.id);
                }}
                onPointerUp={onPressEnd}
                onPointerCancel={onPressEnd}
                onPointerLeave={onPressEnd}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(item.id);
                  }
                }}
                className={`flex h-full min-h-11 w-full flex-col items-center justify-center gap-0.5 px-1 text-center transition-colors duration-0 ${
                  active
                    ? "text-[var(--brand-primary-dark)] bg-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)]"
                    : "text-[var(--life-muted)]"
                }`}
              >
                <span
                  className={`h-0.5 w-6 rounded-full transition-colors duration-0 ${
                    active ? "bg-[var(--brand-primary)]" : "bg-transparent"
                  }`}
                />
                <span className="text-base leading-none" aria-hidden>
                  {item.icon}
                </span>
                <span className="text-[0.6875rem] font-semibold leading-tight tracking-wide">
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function useLifeViewportPaint() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    const theme = document.querySelector('meta[name="theme-color"]');
    const prevTheme = theme?.getAttribute("content") ?? null;

    html.style.backgroundColor = "#f5faf6";
    body.style.backgroundColor = "#f5faf6";
    if (theme) theme.setAttribute("content", "#f5faf6");

    return () => {
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
      if (theme && prevTheme != null) theme.setAttribute("content", prevTheme);
    };
  }, []);
}

/**
 * Persistent Life app shell: tab swaps happen in client memory first.
 * URL sync via history.pushState must never block the panel swap.
 * Leaving aux routes (ledger) uses fire-and-forget router.replace to
 * realign App Router — UI already switched via shellMode/activeTab.
 */
export function LifeShell({ children }: { children: React.ReactNode }) {
  useLifeViewportPaint();
  const pathname = usePathname();
  const router = useRouter();

  const initialTab = lifeTabFromPath(pathname) ?? "quick";
  const [activeTab, setActiveTab] = useState<LifeTabId>(initialTab);
  const [pressedTab, setPressedTab] = useState<LifeTabId | null>(null);
  /** When true, show client panels even if Next pathname is still an aux route. */
  const [shellMode, setShellMode] = useState(() => !isLifeAuxPath(pathname));
  const [mounted, setMounted] = useState<Record<LifeTabId, boolean>>(() => ({
    home: initialTab === "home",
    quick: initialTab === "quick",
    goals: initialTab === "goals",
    analytics: initialTab === "analytics",
    assets: initialTab === "assets",
  }));
  const skipPathSync = useRef(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const showAux = isLifeAuxPath(pathname) && !shellMode;

  const selectTab = useCallback(
    (tab: LifeTabId) => {
      const t0 =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      // Local UI is the source of truth — never wait on router/RSC/API.
      setShellMode(true);
      setActiveTab(tab);
      setMounted((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
      skipPathSync.current = true;
      // URL sync after paint — never blocks activeTab commit.
      queueMicrotask(() => {
        if (isLifeAuxPath(pathnameRef.current)) {
          router.replace(lifeHrefForTab(tab));
        } else {
          syncLifeTabUrl(tab);
        }
      });
      if (typeof window !== "undefined") {
        const elapsed =
          (typeof performance !== "undefined"
            ? performance.now()
            : Date.now()) - t0;
        (
          window as unknown as { __lifeLastTabSwapMs?: number }
        ).__lifeLastTabSwapMs = elapsed;
      }
    },
    [router],
  );

  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      if (isLifeAuxPath(path)) {
        setShellMode(false);
        return;
      }
      setShellMode(true);
      const tab = lifeTabFromPath(path);
      if (tab) {
        setActiveTab(tab);
        setMounted((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useLayoutEffect(() => {
    if (skipPathSync.current) {
      skipPathSync.current = false;
      return;
    }
    // Real Next navigation (e.g. Link → ledger).
    if (isLifeAuxPath(pathname)) {
      setShellMode(false);
      return;
    }
    setShellMode(true);
    const tab = lifeTabFromPath(pathname);
    if (!tab) return;
    setActiveTab(tab);
    setMounted((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  }, [pathname]);

  return (
    <LifeDataProvider>
      <LifeTabProvider activeTab={activeTab} onSelectTab={selectTab}>
        <LifePanelActivityProvider activeTab={activeTab}>
        <div className="life-app">
          <div className="life-content mx-auto max-w-lg">
            {showAux ? (
              children
            ) : (
              <>
                {mounted.home ? (
                  <div
                    className="life-panel"
                    data-life-panel="home"
                    hidden={activeTab !== "home"}
                    aria-hidden={activeTab !== "home"}
                  >
                    <LifeDashboardPage />
                  </div>
                ) : null}
                {mounted.quick ? (
                  <div
                    className="life-panel"
                    data-life-panel="quick"
                    hidden={activeTab !== "quick"}
                    aria-hidden={activeTab !== "quick"}
                  >
                    <LifeQuickPage />
                  </div>
                ) : null}
                {mounted.goals ? (
                  <div
                    className="life-panel"
                    data-life-panel="goals"
                    hidden={activeTab !== "goals"}
                    aria-hidden={activeTab !== "goals"}
                  >
                    <LifeGoalsPage />
                  </div>
                ) : null}
                {mounted.analytics ? (
                  <div
                    className="life-panel"
                    data-life-panel="analytics"
                    hidden={activeTab !== "analytics"}
                    aria-hidden={activeTab !== "analytics"}
                  >
                    <LifeAnalyticsPage />
                  </div>
                ) : null}
                {mounted.assets ? (
                  <div
                    className="life-panel"
                    data-life-panel="assets"
                    hidden={activeTab !== "assets"}
                    aria-hidden={activeTab !== "assets"}
                  >
                    <LifeAssetsPage />
                  </div>
                ) : null}
              </>
            )}
          </div>
          <LifeBottomNav
            activeTab={activeTab}
            pressedTab={pressedTab}
            onSelect={selectTab}
            onPressStart={setPressedTab}
            onPressEnd={() => setPressedTab(null)}
          />
        </div>
        </LifePanelActivityProvider>
      </LifeTabProvider>
    </LifeDataProvider>
  );
}
