"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

const AUTH_PUBLIC_PATHS = new Set(["/login", "/register"]);
const OPEN_PUBLIC_PATHS = new Set(["/privacy", "/data-deletion"]);

function isPublicPath(pathname: string): boolean {
  return (
    AUTH_PUBLIC_PATHS.has(pathname) ||
    OPEN_PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/c/")
  );
}

function shouldRedirectAuthenticatedUser(pathname: string): boolean {
  return AUTH_PUBLIC_PATHS.has(pathname) || pathname.startsWith("/c/");
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = isPublicPath(pathname);

  useEffect(() => {
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
  }, [isLoading, isPublic, pathname, router, session]);

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
