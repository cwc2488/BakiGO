import type { Metadata } from "next";
import { MetaPixel } from "@/components/meta/MetaPixel";
import { buildQuizPartnerShareMetadata } from "@/lib/quiz/partner/quiz-partner-share-metadata";

export function generateMetadata(): Metadata {
  return buildQuizPartnerShareMetadata();
}

export default function QuizShareLayout({ children }: LayoutProps<"/q/[code]">) {
  return (
    <>
      <MetaPixel />
      {children}
    </>
  );
}
