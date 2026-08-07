import type { ReactNode } from "react";
import { PAGE_GRADIENT_CLASS } from "./brand-ui";

export function TabRootShell({
  children,
  header,
  containerClassName = "home-container",
}: {
  children: ReactNode;
  header?: ReactNode;
  containerClassName?: string;
}) {
  return (
    <div className={`min-h-full ${PAGE_GRADIENT_CLASS}`}>
      <main className={`${containerClassName} flex flex-col gap-5 pb-24 pt-10 sm:pt-12`}>
        {header}
        {children}
      </main>
    </div>
  );
}
