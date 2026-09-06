"use client";

import { useSuperAdmin } from "@/lib/auth/use-super-admin";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export function SuperAdminGuard({ children }: { children: ReactNode }) {
  const { isAdmin, isLoading } = useSuperAdmin();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--life-bg)] text-[var(--life-muted)]">
        載入中…
      </div>
    );
  }

  if (!isAdmin) {
    notFound();
  }

  return <>{children}</>;
}
