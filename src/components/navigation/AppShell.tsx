"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { runAppDataResetIfNeeded } from "@/lib/repositories/clear-test-app-data";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AppNav } from "./AppNav";
import { CalendarReminderScheduler } from "@/components/calendar/CalendarReminderScheduler";

const PUBLIC_PATHS = new Set(["/login", "/register"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const pathname = usePathname();
  const showNav = Boolean(session) && !PUBLIC_PATHS.has(pathname);

  useEffect(() => {
    runAppDataResetIfNeeded(createLocalStorageAdapter());
  }, []);

  return (
    <>
      <CalendarReminderScheduler />
      <div className={showNav ? "pb-24" : undefined}>{children}</div>
      {showNav ? <AppNav /> : null}
    </>
  );
}
