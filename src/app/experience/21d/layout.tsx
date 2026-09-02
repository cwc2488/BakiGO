import type { ReactNode } from "react";
import { MetaPixel } from "@/components/meta/MetaPixel";

/** Public 21-day Experience landing (`/experience/21d/[token]`). */
export default function Experience21dLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MetaPixel />
      {children}
    </>
  );
}
