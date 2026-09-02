import {
  generateFatLossQuizOgImage,
  OG_IMAGE_ALT,
  OG_IMAGE_SIZE,
} from "@/lib/quiz/fat-loss/generate-og-image";

export const alt = OG_IMAGE_ALT;
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";
export const runtime = "nodejs";

export default generateFatLossQuizOgImage;
