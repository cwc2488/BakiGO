import { SuperAdminGuard } from "@/components/admin/SuperAdminGuard";
import { LifePwaLinks } from "@/components/life/LifePwaLinks";
import { LifeShell } from "@/components/life/LifeShell";
import { decideAdminAccess } from "@/lib/auth/admin-access";
import { resolveIsSuperAdmin } from "@/lib/auth/super-admin";
import { getMemberIdFromCookies } from "@/lib/supabase/member-auth-server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service-client";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Baki Life",
  description: "私人生活與財務作業系統",
  manifest: "/life/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Baki Life",
    statusBarStyle: "default",
  },
  icons: {
    apple: [{ url: "/life-icons/apple-touch-icon.png", sizes: "180x180" }],
    icon: [
      { url: "/life-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/life-icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5faf6",
};

/**
 * Owner-only Baki Life gate (Super Admin).
 * Additive module — does not alter Baki Go routes.
 */
export default async function LifeLayout({ children }: { children: ReactNode }) {
  if (isSupabaseServiceConfigured()) {
    const memberId = await getMemberIdFromCookies().catch(() => null);
    if (memberId) {
      const isAdmin = await resolveIsSuperAdmin(memberId).catch(() => false);
      const access = decideAdminAccess({ memberId, isAdmin });
      if (access !== "allowed") {
        notFound();
      }
    }
  }

  return (
    <div className="life-root">
      <SuperAdminGuard>
        <LifePwaLinks />
        <LifeShell>{children}</LifeShell>
      </SuperAdminGuard>
    </div>
  );
}
