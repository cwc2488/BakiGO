import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { QuizPartnerPreviewPage } from "@/components/quiz/QuizPartnerPreviewPage";
import { isProductionRuntime } from "@/lib/analysis/interview/native/native-path";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function QuizPartnerPreviewRoute() {
  if (isProductionRuntime()) notFound();
  return (
    <Suspense>
      <QuizPartnerPreviewPage />
    </Suspense>
  );
}
