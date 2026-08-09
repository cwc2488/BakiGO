"use client";

import {
  isOpenPublicPath,
  isPublicPath,
  normalizePathname,
  shouldRedirectAuthenticatedUser,
} from "@/lib/auth/public-paths";
import { useAuth } from "@/lib/auth/auth-context";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const pathname = normalizePathname(usePathname());
  const router = useRouter();
  const isPublic = isPublicPath(pathname);
  const isOpenPublic = isOpenPublicPath(pathname);

  useEffect(() => {
    if (isOpenPublic) {
      return;
    }

    if (isLoading) {
      return;
    }

    if (!session && !isPublic) {
      router.replace("/login");
      return;
    }

    if (session && shouldRedirectAuthenticatedUser(pathname)) {
      router.replace("/daily-action");
    }
  }, [isLoading, isOpenPublic, isPublic, pathname, router, session]);

  // Legal / Meta review pages must render without waiting for auth.
  if (isOpenPublic) {
    return children;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] text-[#86868b]">
        載入中…
      </div>
    );
  }

  if (!session && !isPublic) {
    return null;
  }

  if (session && shouldRedirectAuthenticatedUser(pathname)) {
    return null;
  }

  return children;
}
