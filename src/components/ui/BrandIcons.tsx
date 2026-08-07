import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function IconBase({ size = 24, className = "", children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconHome({ size = 24, className = "", ...props }: IconProps) {
  return (
    <IconBase className={className} size={size} {...props}>
      <path
        d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9V20.5H5.5A1.5 1.5 0 0 1 4 19v-8.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </IconBase>
  );
}

export function IconToday({ size = 24, className = "", ...props }: IconProps) {
  return (
    <IconBase className={className} size={size} {...props}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="m8.5 12.2 2.2 2.2 4.8-4.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </IconBase>
  );
}

export function IconCalendar({ size = 24, className = "", ...props }: IconProps) {
  return (
    <IconBase className={className} size={size} {...props}>
      <rect height="15" rx="2.25" stroke="currentColor" strokeWidth="1.75" width="16" x="4" y="5.5" />
      <path d="M4 9.5h16" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 4v3M16 4v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <circle cx="9" cy="13.5" fill="currentColor" r="1" />
      <circle cx="12" cy="13.5" fill="currentColor" r="1" />
      <circle cx="15" cy="13.5" fill="currentColor" r="1" />
    </IconBase>
  );
}

export function IconProfile({ size = 24, className = "", ...props }: IconProps) {
  return (
    <IconBase className={className} size={size} {...props}>
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M6.5 19c1.2-2.8 3.4-4.25 5.5-4.25S16.3 16.2 17.5 19"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.75"
      />
    </IconBase>
  );
}

export function IconPipeline({ size = 24, className = "", ...props }: IconProps) {
  return (
    <IconBase className={className} size={size} {...props}>
      <circle cx="9" cy="8" r="2.75" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 18v-1.2c0-1.65 1.35-3 3-3h2c1.1 0 2 .55 2.55 1.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M14 7h5M14 11h5M14 15h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconDailyAction({ size = 24, className = "", ...props }: IconProps) {
  return (
    <IconBase className={className} size={size} {...props}>
      <rect height="14" rx="2" stroke="currentColor" strokeWidth="1.75" width="12" x="6" y="5" />
      <path d="M9 4h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M9 10h6M9 13.5h4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconAddRecord({ size = 24, className = "", ...props }: IconProps) {
  return (
    <IconBase className={className} size={size} {...props}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 8.5v7M8.5 12h7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconLearning({ size = 24, className = "", ...props }: IconProps) {
  return (
    <IconBase className={className} size={size} {...props}>
      <path d="M4 9.5 12 5l8 4.5-8 4.5-8-4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M20 10v6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconGoals({ size = 24, className = "", ...props }: IconProps) {
  return (
    <IconBase className={className} size={size} {...props}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" fill="currentColor" r="1.25" />
    </IconBase>
  );
}

export function IconOrganization({ size = 24, className = "", ...props }: IconProps) {
  return (
    <IconBase className={className} size={size} {...props}>
      <circle cx="12" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="6.5" cy="16.5" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17.5" cy="16.5" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10.2 8.4 7.8 14M13.8 8.4l2.4 5.6" stroke="currentColor" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconChevronDown({ size = 24, className = "", ...props }: IconProps) {
  return (
    <IconBase className={className} size={size} {...props}>
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconLeafDecoration({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M95 18c-8 14-22 22-38 24 16-2 28-12 34-28-14 6-28 4-40-4 12 12 28 16 44 8Z"
        fill="#77b539"
        opacity="0.18"
      />
      <path
        d="M88 32c-5 9-14 14-24 15 10-1 18-7 22-16-8 4-17 3-24-2 7 7 17 10 26 5Z"
        fill="#248a3d"
        opacity="0.12"
      />
    </svg>
  );
}

export const QUICK_LINK_ICONS = {
  "/retail-pipeline": IconPipeline,
  "/daily-action": IconDailyAction,
  "/events": IconAddRecord,
  "/learning": IconLearning,
  "/goals": IconGoals,
  "/organization": IconOrganization,
  "/calendar": IconCalendar,
  "/profile": IconProfile,
} as const;

export const NAV_ICONS = {
  "/": IconHome,
  "/daily-action": IconToday,
  "/calendar": IconCalendar,
  "/profile": IconProfile,
} as const;

export type QuickLinkHref = keyof typeof QUICK_LINK_ICONS;
export type NavHref = keyof typeof NAV_ICONS;
