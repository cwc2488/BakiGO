import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ResetVisualStories } from "@/components/reset/ResetVisualStories";
import { isProductionRuntime } from "@/lib/analysis/interview/native/native-path";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ResetVisualPreviewPage() {
  if (isProductionRuntime()) notFound();
  return (
    <Suspense>
      <ResetVisualStories />
    </Suspense>
  );
}
