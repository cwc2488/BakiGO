import type { Metadata } from "next";
import { buildFatLossQuizPublicMetadata } from "@/lib/quiz/fat-loss/public-metadata";

export const metadata: Metadata = buildFatLossQuizPublicMetadata();

export default function FatLossQuizLayout({ children }: LayoutProps<"/quiz/fat-loss">) {
  return children;
}
