import type { ReactNode } from "react";
import type { Metadata } from "next";
import { MetaPixel } from "@/components/meta/MetaPixel";
import { buildQuizPartnerShareMetadata } from "@/lib/quiz/partner/quiz-partner-share-metadata";

export function generateMetadata(): Metadata {
  return buildQuizPartnerShareMetadata();
}

export default function ResultShareLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MetaPixel />
      {children}
    </>
  );
}
