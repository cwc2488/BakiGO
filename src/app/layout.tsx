import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { AuthGate } from "@/components/auth/AuthGate";
import { AppShell } from "@/components/navigation/AppShell";
import { AuthProvider } from "@/lib/auth/auth-context";
import { getSupabaseEnvScript } from "@/lib/supabase/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Baki GO",
  description: "直銷組織的每日成長夥伴",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Baki GO",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${geistSans.variable} h-full antialiased`}>
      <head>
        <link href="/apple-touch-icon.png" rel="apple-touch-icon" sizes="180x180" />
        <link href="/icon.svg" rel="icon" type="image/svg+xml" />
        <script dangerouslySetInnerHTML={{ __html: getSupabaseEnvScript() }} />
      </head>
      <body className="min-h-full font-sans">
        <AuthProvider>
          <AuthGate>
            <AppShell>{children}</AppShell>
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
