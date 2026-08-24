"use client";

import { isPublicPath, normalizePathname } from "@/lib/auth/public-paths";
import { useAuth } from "@/lib/auth/auth-context";
import { runAppDataResetIfNeeded } from "@/lib/repositories/clear-test-app-data";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AppBottomNav, AppSideNav } from "./AppNav";
import { CalendarReminderScheduler } from "@/components/calendar/CalendarReminderScheduler";
import { CustomerFollowUpReminderScheduler } from "@/components/customers/CustomerFollowUpReminderScheduler";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const pathname = normalizePathname(usePathname());
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
        {/* Keep bottom nav outside the padded page column so fixed anchoring
            matches short pages (顧客 / 心理測驗) on long scroll pages (/radar). */}
        {showNav ? <AppBottomNav /> : null}
      </div>
    </>
  );
}
