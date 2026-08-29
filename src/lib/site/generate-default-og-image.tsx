import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import {
  BAKI_GO_DEFAULT_DESCRIPTION,
  BAKI_GO_DEFAULT_TITLE,
} from "@/lib/site/default-metadata";

export const DEFAULT_OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const DEFAULT_OG_IMAGE_ALT = BAKI_GO_DEFAULT_TITLE;
export const DEFAULT_OG_IMAGE_PATH = "/opengraph-image";
export const DEFAULT_OG_CONTENT_TYPE = "image/png";

const NOTO_SANS_TC_BOLD_URL =
  "https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-tc@5.2.5/chinese-traditional-700-normal.woff";

async function loadDefaultOgFont(): Promise<ArrayBuffer> {
  const response = await fetch(NOTO_SANS_TC_BOLD_URL);
  if (!response.ok) {
    throw new Error(`Failed to load OG font: ${response.status}`);
  }
  return response.arrayBuffer();
}

export async function generateDefaultOgImage(): Promise<ImageResponse> {
  const [fontData, logoSvg] = await Promise.all([
    loadDefaultOgFont(),
    readFile(path.join(process.cwd(), "public/icon.svg")),
  ]);
  const logoSrc = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f7fbf4 0%, #eef7e6 48%, #dcefd0 100%)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 10,
            background: "linear-gradient(90deg, #95d44a 0%, #77b539 50%, #248a3d 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 10,
            background: "linear-gradient(90deg, #95d44a 0%, #77b539 50%, #248a3d 100%)",
          }}
        />

        <img
          src={logoSrc}
          alt=""
          width={168}
          height={168}
          style={{
            borderRadius: 36,
          }}
        />

        <div
          style={{
            marginTop: 36,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            maxWidth: 980,
          }}
        >
          <div
            style={{
              fontFamily: "Noto Sans TC",
              fontSize: 64,
              fontWeight: 700,
              color: "#1d1d1f",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              textAlign: "center",
            }}
          >
            {BAKI_GO_DEFAULT_TITLE}
          </div>
          <div
            style={{
              marginTop: 22,
              fontFamily: "Noto Sans TC",
              fontSize: 30,
              fontWeight: 700,
              color: "#3a5f2e",
              lineHeight: 1.45,
              textAlign: "center",
            }}
          >
            {BAKI_GO_DEFAULT_DESCRIPTION}
          </div>
        </div>
      </div>
    ),
    {
      ...DEFAULT_OG_IMAGE_SIZE,
      fonts: [
        {
          name: "Noto Sans TC",
          data: fontData,
          style: "normal",
          weight: 700,
        },
      ],
    },
  );
}
