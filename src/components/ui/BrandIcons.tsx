import type { ReactNode, SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

export type IconComponent = (props: IconProps) => ReactNode;

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

export function IconHome(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9V20.5H5.5A1.5 1.5 0 0 1 4 19v-8.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconToday(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="m8.5 12.2 2.2 2.2 4.8-4.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="15" rx="2.25" stroke="currentColor" strokeWidth="1.75" width="16" x="4" y="5.5" />
      <path d="M4 9.5h16" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 4v3M16 4v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <circle cx="9" cy="13.5" fill="currentColor" r="1" />
      <circle cx="12" cy="13.5" fill="currentColor" r="1" />
      <circle cx="15" cy="13.5" fill="currentColor" r="1" />
    </IconBase>
  );
}

export function IconCalendarToday(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="14" rx="2" stroke="currentColor" strokeWidth="1.75" width="14" x="5" y="6" />
      <path d="M5 10h14M9 4v2.5M15 4v2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M9 14h2.5M9 17h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconProfile(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="M6.5 19c1.2-2.8 3.4-4.25 5.5-4.25S16.3 16.2 17.5 19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconPipeline(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="2.75" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 18v-1.2c0-1.65 1.35-3 3-3h2c1.1 0 2 .55 2.55 1.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M14 7h5M14 11h5M14 15h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconDailyAction(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="14" rx="2" stroke="currentColor" strokeWidth="1.75" width="12" x="6" y="5" />
      <path d="M9 4h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M9 10h6M9 13.5h4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconAddRecord(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 8.5v7M8.5 12h7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconLearning(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 9.5 12 5l8 4.5-8 4.5-8-4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M20 10v6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconGoals(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="12" fill="currentColor" r="1.25" />
    </IconBase>
  );
}

export function IconOrganization(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="6.5" cy="16.5" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17.5" cy="16.5" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10.2 8.4 7.8 14M13.8 8.4l2.4 5.6" stroke="currentColor" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconOrganizationHandshake(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 12.5 10.5 15l3-3 2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M6.5 10.5 8 12l1.5-1.5M15 10.5l1.5 1.5L18 12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <circle cx="7" cy="8" r="2" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17" cy="8" r="2" stroke="currentColor" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconLeaderboard(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 19h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M10 19V9l-2 4M14 19V6l2 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M7 9h6M9 6h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconTrophy(props: IconProps) {
  return IconLeaderboard(props);
}

export function IconRetailHouse(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 10.5 12 5l7 5.5V19H5v-8.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M9.5 19v-4h5v4" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconPromotions(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="12" rx="2" stroke="currentColor" strokeWidth="1.75" width="14" x="5" y="8" />
      <path d="M12 8V5.5a1.5 1.5 0 0 0-3 0V8M12 8a1.5 1.5 0 0 0 3 0V5.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M9.5 13h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconPromotionsTarget(props: IconProps) {
  return IconGoals(props);
}

export function IconEvents(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5.5v13M8.5 9.5 12 5.5l3.5 4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconPreMeetingGraphic(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="12" rx="2" stroke="currentColor" strokeWidth="1.75" width="16" x="4" y="6" />
      <circle cx="9" cy="10.5" fill="currentColor" r="1.25" />
      <path d="M12 14.5h5M12 11.5h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconPresidentRoad(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 17c2.5-4 4.5-6 7-6s4.5 2 7 6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <circle cx="8" cy="9" r="2" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16" cy="7" r="2" stroke="currentColor" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconPresidentAi(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4a4 4 0 0 1 4 4c0 1.6-.9 3-2.2 3.7V13H10v-1.3A4 4 0 0 1 12 4Z" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9 17h6M10 20h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M8.5 13h7l1 3.5H7.5L8.5 13Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconMissions(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="14" rx="2" stroke="currentColor" strokeWidth="1.75" width="12" x="6" y="5" />
      <path d="m9 10.5 2 2 4-4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconAchievements(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="10" r="5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8.5 14.5 7 19l5-2 5 2-1.5-4.5" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconMapUniverse(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4 12h16M12 4c2.5 2.8 2.5 14.2 0 16M12 4c-2.5 2.8-2.5 14.2 0 16" stroke="currentColor" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconPoints(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5.5 14.5 11H20l-4.5 3.5 1.5 6L12 17l-5 3.5 1.5-6L4 11h5.5L12 5.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconQuickLog(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 5h8l3 3v11H7V5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M15 5v3h3M10 12h6M10 15.5h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconSuperLeague(props: IconProps) {
  return IconAchievements(props);
}

export function IconGrowth(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 17V7M5 17h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="m8 14 3-3 3 2 4-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconActivity(props: IconProps) {
  return IconGrowth(props);
}

export function IconAiAnalysis(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconRetailRules(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 6h12v12H6V6Z" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9 10h6M9 14h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconGroupCompetition(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 8.5 12 5l4 3.5v8H8v-8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M5 19h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconMeasurement(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 16 16 5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M7.5 13.5h2v2M14.5 8.5h2v2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconConsultation(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6.5 8.5A5.5 5.5 0 0 1 17 8.5c0 3-2.2 5.5-5 5.5-.7 0-1.3-.1-1.9-.4L8 17v-3.2c-1-.9-1.5-2.2-1.5-3.8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconRecruit(props: IconProps) {
  return IconOrganizationHandshake(props);
}

export function IconPresentation(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="10" rx="1.5" stroke="currentColor" strokeWidth="1.75" width="14" x="5" y="6" />
      <path d="M12 16v3M8 19h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconRedeem(props: IconProps) {
  return IconPromotions(props);
}

export function IconNotify(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5.5a4.5 4.5 0 0 0-4.5 4.5v3.5L6 16h12l-1.5-2.5V10A4.5 4.5 0 0 0 12 5.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M10.5 17a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconWelcome(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6.5 11.5c1-2 2.5-3 5.5-3s4.5 1 5.5 3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M8 11.5V9.5c0-2.2 1.8-4 4-4s4 1.8 4 4v2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M7 14.5c1 1.5 2.5 2.5 5 2.5s4-1 5-2.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconEmpty(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 20c4-3.5 6-7 6-10a6 6 0 1 0-12 0c0 3 2 6.5 6 10Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M12 12v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconDone(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="m8.5 12.2 2.2 2.2 4.8-4.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconError(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 8.5v4.5M12 16h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconLoading(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.75" />
      <path d="M12 3.75a8.25 8.25 0 0 1 8.25 8.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconStreak(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5.5c1 2.5-.5 4.5-2 6 1.5-.5 3-2 3.5-3.5C16 11 17 13.5 15.5 16 18 14.5 19 11.5 17.5 8.5 16.5 6.5 14 5 12 5.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconNewCustomer(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10" cy="9" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5.5 18c.8-2.5 2.4-4 4.5-4s3.7 1.5 4.5 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M17 8v4M15 10h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconReturningCustomer(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10" cy="9" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5.5 18c.8-2.5 2.4-4 4.5-4s3.7 1.5 4.5 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M16 10a3 3 0 1 0 0-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconNewMember(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10" cy="9" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5.5 18c.8-2.5 2.4-4 4.5-4s3.7 1.5 4.5 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M17 7.5 18.5 9 17 10.5 15.5 9 17 7.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconReturningMember(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10" cy="9" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5.5 18c.8-2.5 2.4-4 4.5-4s3.7 1.5 4.5 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M16.5 8.5 18 10l-1.5 1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconLink(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 13a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1 1M14 11a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1-1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </IconBase>
  );
}

export function IconQuizHub(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M8 9.5h6.5a2.5 2.5 0 0 1 2.5 2.5V14l-2.25 1.75H8a2.5 2.5 0 0 1-2.5-2.5v-3A2.5 2.5 0 0 1 8 9.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
      <path
        d="M13.5 11h4a2 2 0 0 1 2 2v2.25L18 17v-4.5a2 2 0 0 0-2-2h-2.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </IconBase>
  );
}

export function IconLeafDecoration({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <path d="M95 18c-8 14-22 22-38 24 16-2 28-12 34-28-14 6-28 4-40-4 12 12 28 16 44 8Z" fill="#77b539" opacity="0.18" />
      <path d="M88 32c-5 9-14 14-24 15 10-1 18-7 22-16-8 4-17 3-24-2 7 7 17 10 26 5Z" fill="#248a3d" opacity="0.12" />
    </svg>
  );
}

export const ROUTE_ICON_COMPONENTS = {
  "/": IconHome,
  "/daily-action": IconDailyAction,
  "/goals": IconGoals,
  "/leaderboard": IconLeaderboard,
  "/retail-pipeline": IconPipeline,
  "/customers": IconNewCustomer,
  "/members": IconOrganization,
  "/retail-house": IconRetailHouse,
  "/organization": IconOrganization,
  "/promotions": IconPromotions,
  "/calendar": IconCalendar,
  "/events": IconEvents,
  "/pre-meeting-graphic": IconPreMeetingGraphic,
  "/learning": IconLearning,
  "/president-road": IconPresidentRoad,
  "/profile": IconProfile,
  "/quiz/hub": IconQuizHub,
} as const;

export const NAV_ICONS = {
  "/": IconHome,
  "/daily-action": IconToday,
  "/calendar": IconCalendar,
  "/profile": IconProfile,
} as const;

export type QuickLinkHref = keyof typeof ROUTE_ICON_COMPONENTS;
export type NavHref = keyof typeof NAV_ICONS;
