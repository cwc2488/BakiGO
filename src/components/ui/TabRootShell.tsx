import type { ReactNode } from "react";
import { PAGE_GRADIENT_CLASS } from "./brand-ui";
import { IconLeafDecoration } from "./BrandIcons";

export function TabRootShell({
  children,
  header,
  containerClassName = "home-container",
  decorated = false,
}: {
  children: ReactNode;
  header?: ReactNode;
  containerClassName?: string;
  decorated?: boolean;
}) {
  return (
    <div className={`relative min-h-full overflow-hidden ${PAGE_GRADIENT_CLASS}`}>
      {decorated ? (
        <IconLeafDecoration className="pointer-events-none absolute -right-2 top-0 h-28 w-28 sm:h-32 sm:w-32" />
      ) : null}
      <main className={`relative ${containerClassName} flex flex-col gap-6 pb-24 pt-10 sm:pt-12`}>
        {header}
        {children}
      </main>
    </div>
  );
}
