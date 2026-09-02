import type { ReactNode } from "react";
import { MetaPixel } from "@/components/meta/MetaPixel";

/** Public analysis consumer sessions only (`/analysis/[token]`). */
export default function AnalysisLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MetaPixel />
      {children}
    </>
  );
}
