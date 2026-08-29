import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Customer-scoped installable manifest for Baki Go 21. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const startUrl = `/c/${encodeURIComponent(token)}/go21`;
  const manifest = {
    name: "Baki Go 21",
    short_name: "Baki Go 21",
    description: "你的 21 天 AI 飲食教練",
    start_url: startUrl,
    scope: startUrl,
    display: "standalone",
    background_color: "#f3f8ef",
    theme_color: "#77b539",
    lang: "zh-Hant",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
