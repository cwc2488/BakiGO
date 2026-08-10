import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const OG_IMAGE_ALT = "你是哪一種瘦不下來的人？";

export async function generateFatLossQuizOgImage(): Promise<ImageResponse> {
  const coverPath = path.join(process.cwd(), "public/quiz/fat-loss/quiz-cover.png");
  const coverBuffer = await readFile(coverPath);
  const coverSrc = `data:image/jpeg;base64,${coverBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #faf6f1 0%, #f3ebe3 50%, #ebe0d5 100%)",
        }}
      >
        <img
          src={coverSrc}
          alt=""
          height={580}
          style={{
            objectFit: "contain",
          }}
        />
      </div>
    ),
    OG_IMAGE_SIZE,
  );
}
