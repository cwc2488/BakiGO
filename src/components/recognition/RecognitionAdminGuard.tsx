"use client";

import { useRecognitionAdmin } from "@/lib/recognition/use-recognition-admin";
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
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">權限不足</p>
        <p className="max-w-xs text-[0.9375rem] text-[#86868b]">
          表揚中心需要 Recognition Admin 授權。請聯絡管理員。
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
