"use client";

import { isPublicPath, normalizePathname } from "@/lib/auth/public-paths";
import { useAuth } from "@/lib/auth/auth-context";
import { runAppDataResetIfNeeded } from "@/lib/repositories/clear-test-app-data";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppBottomNav, AppSideNav } from "./AppNav";
import { CalendarReminderScheduler } from "@/components/calendar/CalendarReminderScheduler";
import { CalendarSyncBootstrap } from "@/components/calendar/CalendarSyncBootstrap";
import { CustomerFollowUpReminderScheduler } from "@/components/customers/CustomerFollowUpReminderScheduler";

/** Route-code-only prefetch after idle — no API data preload. */
const PRIMARY_ROUTE_PREFETCH = ["/", "/5plus5", "/questionnaire", "/customers", "/calendar"] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const pathname = normalizePathname(usePathname());
  const router = useRouter();
  const showNav = Boolean(session) && !isPublicPath(pathname);

  useEffect(() => {
    runAppDataResetIfNeeded(createLocalStorageAdapter());
  }, []);

  useEffect(() => {
    if (!showNav) return;
    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    const run = () => {
      if (cancelled) return;
      for (const href of PRIMARY_ROUTE_PREFETCH) {
        if (href === pathname || (href !== "/" && pathname.startsWith(`${href}/`))) {
          continue;
        }
        try {
          router.prefetch(href);
        } catch {
          /* ignore */
        }
      }
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(run, { timeout: 4000 });
    } else {
      timeoutHandle = window.setTimeout(run, 1200);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
    };
  }, [showNav, pathname, router]);

  return (
    <>
      <CalendarSyncBootstrap />
      <CalendarReminderScheduler />
      <CustomerFollowUpReminderScheduler />
      <div className="min-h-full max-w-[100vw]">
        {showNav ? <AppSideNav /> : null}
        <div
          className={
            showNav
              ? "min-w-0 md:ml-[5.75rem] lg:ml-[15rem]"
              : undefined
          }
        >
          <div
            className={
              showNav
                ? "pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0"
                : undefined
            }
          >
            {children}
          </div>
        </div>
      </div>
      {/* Viewport-fixed bottom nav must not sit inside max-w / page chrome
          wrappers — those can become fixed containing blocks on mobile WebKit. */}
      {showNav ? <AppBottomNav /> : null}
    </>
  );
}
