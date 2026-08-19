import { readFile } from "node:fs/promises";
import path from "node:path";
import { QUIZ_PARTNER_OG_IMAGE_ALT } from "@/lib/quiz/partner/quiz-partner-presentation";

export const QUIZ_PARTNER_OG_SIZE = { width: 1200, height: 630 } as const;
export const QUIZ_PARTNER_OG_CONTENT_TYPE = "image/png";
export { QUIZ_PARTNER_OG_IMAGE_ALT };

export async function serveQuizPartnerOgImage(): Promise<Response> {
  const file = await readFile(path.join(process.cwd(), "public/reset/og-quiz-share.png"));
  return new Response(file, {
    headers: {
      "Content-Type": QUIZ_PARTNER_OG_CONTENT_TYPE,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
