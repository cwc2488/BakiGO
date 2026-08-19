"use client";

import { useSearchParams } from "next/navigation";
import { Quiz21dStartPreviewWalk } from "@/components/quiz/Quiz21dStartPreviewWalk";
import { QuizPartnerPreviewStories } from "@/components/quiz/QuizPartnerPreviewStories";

export function QuizPartnerPreviewPage() {
  const params = useSearchParams();
  if (params.get("walk") === "21d-start") {
    return <Quiz21dStartPreviewWalk />;
  }
  const shot = params.get("shot") ?? "partner-leads";
  return <QuizPartnerPreviewStories shot={shot} />;
}
