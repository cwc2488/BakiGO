"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { runAppDataResetIfNeeded } from "@/lib/repositories/clear-test-app-data";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AppBottomNav, AppSideNav } from "./AppNav";
import { CalendarReminderScheduler } from "@/components/calendar/CalendarReminderScheduler";
import { CustomerFollowUpReminderScheduler } from "@/components/customers/CustomerFollowUpReminderScheduler";

const AUTH_PUBLIC_PATHS = new Set(["/login", "/register"]);
const OPEN_PUBLIC_PATHS = new Set(["/privacy", "/data-deletion"]);

function isPublicPath(pathname: string): boolean {
  return (
    AUTH_PUBLIC_PATHS.has(pathname) ||
    OPEN_PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/c/")
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const pathname = usePathname();
  const showNav = Boolean(session) && !isPublicPath(pathname);

  useEffect(() => {
    runAppDataResetIfNeeded(createLocalStorageAdapter());
  }, []);

  return (
    <>
      <CalendarReminderScheduler />
      <CustomerFollowUpReminderScheduler />
      <div className="min-h-full max-w-[100vw]">
        {showNav ? <AppSideNav /> : null}
        <div
          className={
            showNav
              ? "min-w-0 md:ml-[5.75rem] lg:ml-[15rem] pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0"
              : undefined
          }
        >
          {children}
          {showNav ? <AppBottomNav /> : null}
        </div>
      </div>
    </>
  );
}
