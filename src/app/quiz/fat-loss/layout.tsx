import type { Metadata } from "next";
import { buildQuizPartnerShareMetadata } from "@/lib/quiz/partner/quiz-partner-share-metadata";

export function generateMetadata(): Metadata {
  return buildQuizPartnerShareMetadata();
}

export default function FatLossQuizLayout({ children }: LayoutProps<"/quiz/fat-loss">) {
  return children;
}
