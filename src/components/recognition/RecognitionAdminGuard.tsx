"use client";

import { useRecognitionAdmin } from "@/lib/recognition/use-recognition-admin";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export function RecognitionAdminGuard({ children }: { children: ReactNode }) {
  const { isAdmin, isLoading } = useRecognitionAdmin();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[#86868b]">
        載入中…
      </div>
    );
  }

  if (!isAdmin) {
    notFound();
  }

  return <>{children}</>;
}
