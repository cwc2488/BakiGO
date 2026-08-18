"use client";

import { SuperAdminGuard } from "@/components/admin/SuperAdminGuard";
import type { ReactNode } from "react";

export function RecognitionAdminGuard({ children }: { children: ReactNode }) {
  return <SuperAdminGuard>{children}</SuperAdminGuard>;
}
