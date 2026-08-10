import type { Metadata } from "next";
import { getPublicAppOrigin } from "@/lib/app/public-origin";

export const FAT_LOSS_QUIZ_PUBLIC_PAGE_TITLE =
  "你是哪一種瘦不下來的人？｜12題測出你的減脂卡關人格";

export const FAT_LOSS_QUIZ_PUBLIC_DESCRIPTION =
  "明明很努力，為什麼還是瘦不下來？用 12 題找出真正讓你卡住的原因。";

export const FAT_LOSS_QUIZ_OG_TITLE = "你是哪一種瘦不下來的人？";

export const FAT_LOSS_QUIZ_OG_DESCRIPTION =
  "12 題測出你的減脂卡關人格，看看真正讓你卡住的是什麼！";

export const FAT_LOSS_QUIZ_OG_IMAGE_PATH = "/quiz/fat-loss/opengraph-image";

type BuildFatLossQuizPublicMetadataOptions = {
  title?: string;
  requestOrigin?: string | null;
};

export function buildFatLossQuizPublicMetadata(
  options: BuildFatLossQuizPublicMetadataOptions = {},
): Metadata {
  const origin = getPublicAppOrigin(options.requestOrigin);
  const pageTitle = options.title ?? FAT_LOSS_QUIZ_PUBLIC_PAGE_TITLE;

  return {
    metadataBase: new URL(origin),
    title: pageTitle,
    description: FAT_LOSS_QUIZ_PUBLIC_DESCRIPTION,
    openGraph: {
      title: FAT_LOSS_QUIZ_OG_TITLE,
      description: FAT_LOSS_QUIZ_OG_DESCRIPTION,
      type: "website",
      locale: "zh_TW",
      siteName: "Baki GO",
      images: [
        {
          url: FAT_LOSS_QUIZ_OG_IMAGE_PATH,
          width: 1200,
          height: 630,
          alt: FAT_LOSS_QUIZ_OG_TITLE,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: FAT_LOSS_QUIZ_OG_TITLE,
      description: FAT_LOSS_QUIZ_OG_DESCRIPTION,
      images: [FAT_LOSS_QUIZ_OG_IMAGE_PATH],
    },
  };
}
