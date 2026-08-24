import type { Metadata } from "next";
import { getPublicAppOrigin } from "@/lib/app/public-origin";
import {
  QUIZ_PARTNER_OG_DESCRIPTION,
  QUIZ_PARTNER_OG_IMAGE_ALT,
  QUIZ_PARTNER_OG_IMAGE_PATH,
  QUIZ_PARTNER_OG_TITLE,
} from "@/lib/quiz/partner/quiz-partner-presentation";

export function buildQuizPartnerShareMetadata(requestOrigin?: string | null): Metadata {
  const origin = getPublicAppOrigin(requestOrigin);
  const image = `${origin}${QUIZ_PARTNER_OG_IMAGE_PATH}`;
  return {
    metadataBase: new URL(origin),
    title: QUIZ_PARTNER_OG_TITLE,
    description: QUIZ_PARTNER_OG_DESCRIPTION,
    openGraph: {
      title: QUIZ_PARTNER_OG_TITLE,
      description: QUIZ_PARTNER_OG_DESCRIPTION,
      type: "website",
      locale: "zh_TW",
      siteName: "Baki GO",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: QUIZ_PARTNER_OG_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: QUIZ_PARTNER_OG_TITLE,
      description: QUIZ_PARTNER_OG_DESCRIPTION,
      images: [image],
    },
  };
}
