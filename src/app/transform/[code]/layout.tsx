import { MetaPixel } from "@/components/meta/MetaPixel";
import type { ReactNode } from "react";

export default function TransformLandingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MetaPixel />
      {children}
    </>
  );
}
