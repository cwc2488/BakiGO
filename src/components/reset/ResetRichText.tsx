"use client";

import { renderResetEmphasisHtml } from "@/lib/analysis/reset/reset-emphasis";

export function ResetRichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: renderResetEmphasisHtml(text) }}
    />
  );
}
