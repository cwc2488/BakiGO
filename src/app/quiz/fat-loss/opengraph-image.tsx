import {
  QUIZ_PARTNER_OG_CONTENT_TYPE,
  QUIZ_PARTNER_OG_IMAGE_ALT,
  QUIZ_PARTNER_OG_SIZE,
  serveQuizPartnerOgImage,
} from "@/lib/quiz/partner/quiz-partner-og-image";

export const alt = QUIZ_PARTNER_OG_IMAGE_ALT;
export const size = QUIZ_PARTNER_OG_SIZE;
export const contentType = QUIZ_PARTNER_OG_CONTENT_TYPE;
export const runtime = "nodejs";

export default serveQuizPartnerOgImage;
