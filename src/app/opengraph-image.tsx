import {
  DEFAULT_OG_CONTENT_TYPE,
  DEFAULT_OG_IMAGE_ALT,
  DEFAULT_OG_IMAGE_SIZE,
  generateDefaultOgImage,
} from "@/lib/site/generate-default-og-image";

export const alt = DEFAULT_OG_IMAGE_ALT;
export const size = DEFAULT_OG_IMAGE_SIZE;
export const contentType = DEFAULT_OG_CONTENT_TYPE;
export const runtime = "nodejs";

export default generateDefaultOgImage;
