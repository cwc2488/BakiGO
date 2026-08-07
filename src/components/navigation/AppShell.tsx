"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { runAppDataResetIfNeeded } from "@/lib/repositories/clear-test-app-data";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AppBottomNav, AppSideNav } from "./AppNav";
import { CalendarReminderScheduler } from "@/components/calendar/CalendarReminderScheduler";
import { CustomerFollowUpReminderScheduler } from "@/components/customers/CustomerFollowUpReminderScheduler";

const PUBLIC_PATHS = new Set(["/login", "/register"]);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith("/c/");
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
      <div className="flex min-h-full overflow-x-hidden max-w-[100vw]">
        {showNav ? <AppSideNav /> : null}
        <div className="min-w-0 flex-1">
          <div
            className={
              showNav
                ? "pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0"
                : undefined
            }
          >
            {children}
          </div>
          {showNav ? <AppBottomNav /> : null}
        </div>
      </div>
    </>
  );
}
