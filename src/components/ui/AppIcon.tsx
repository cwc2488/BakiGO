import type { ComponentType, ReactNode } from "react";
import { ROUTE_ICONS } from "@/lib/ui/app-icons";
import {
  IconActivity,
  IconAddRecord,
  IconAiAnalysis,
  IconAchievements,
  IconCalendar,
  IconCalendarToday,
  IconConsultation,
  IconDailyAction,
  IconDone,
  IconEmpty,
  IconError,
  IconEvents,
  IconGoals,
  IconGroupCompetition,
  IconGrowth,
  IconHome,
  IconLeaderboard,
  IconLearning,
  IconLink,
  IconLoading,
  IconMapUniverse,
  IconMeasurement,
  IconMissions,
  IconNewCustomer,
  IconNewMember,
  IconNotify,
  IconOrganization,
  IconOrganizationHandshake,
  IconPipeline,
  IconPoints,
  IconPreMeetingGraphic,
  IconPresentation,
  IconPresidentAi,
  IconPresidentRoad,
  IconProfile,
  IconPromotions,
  IconPromotionsTarget,
  IconQuickLog,
  IconRecruit,
  IconRedeem,
  IconRetailHouse,
  IconRetailRules,
  IconReturningCustomer,
  IconReturningMember,
  IconSettings,
  IconStreak,
  IconSuperLeague,
  IconToday,
  IconTrophy,
  IconWelcome,
  type IconComponent,
} from "./BrandIcons";

export type AppIconName =
  | "home"
  | "daily"
  | "today"
  | "calendar"
  | "calendarToday"
  | "profile"
  | "pipeline"
  | "dailyAction"
  | "addRecord"
  | "learning"
  | "goals"
  | "organization"
  | "organizationHandshake"
  | "leaderboard"
  | "retailHouse"
  | "promotions"
  | "promotionsTarget"
  | "events"
  | "preMeetingGraphic"
  | "presidentRoad"
  | "presidentAi"
  | "missions"
  | "nextSteps"
  | "achievements"
  | "mapUniverse"
  | "points"
  | "quickLog"
  | "superLeague"
  | "growth"
  | "business"
  | "aiAnalysis"
  | "activity"
  | "retailRules"
  | "groupCompetition"
  | "measurement"
  | "consultation"
  | "recruit"
  | "presentation"
  | "redeem"
  | "notify"
  | "welcome"
  | "empty"
  | "done"
  | "error"
  | "loading"
  | "streak"
  | "trophy"
  | "newCustomer"
  | "returningCustomer"
  | "newMember"
  | "returningMember"
  | "settings"
  | "link"
  | "promotion";

const ICON_REGISTRY: Record<AppIconName, IconComponent> = {
  home: IconHome,
  daily: IconToday,
  today: IconToday,
  calendar: IconCalendar,
  calendarToday: IconCalendarToday,
  profile: IconProfile,
  pipeline: IconPipeline,
  dailyAction: IconDailyAction,
  addRecord: IconAddRecord,
  learning: IconLearning,
  goals: IconGoals,
  organization: IconOrganization,
  organizationHandshake: IconOrganizationHandshake,
  leaderboard: IconLeaderboard,
  retailHouse: IconRetailHouse,
  promotions: IconPromotions,
  promotionsTarget: IconPromotionsTarget,
  events: IconEvents,
  preMeetingGraphic: IconPreMeetingGraphic,
  presidentRoad: IconPresidentRoad,
  presidentAi: IconPresidentAi,
  missions: IconMissions,
  nextSteps: IconMissions,
  achievements: IconAchievements,
  mapUniverse: IconMapUniverse,
  points: IconPoints,
  quickLog: IconQuickLog,
  superLeague: IconSuperLeague,
  growth: IconGrowth,
  business: IconActivity,
  aiAnalysis: IconAiAnalysis,
  activity: IconActivity,
  retailRules: IconRetailRules,
  groupCompetition: IconGroupCompetition,
  measurement: IconMeasurement,
  consultation: IconConsultation,
  recruit: IconRecruit,
  presentation: IconPresentation,
  redeem: IconRedeem,
  notify: IconNotify,
  welcome: IconWelcome,
  empty: IconEmpty,
  done: IconDone,
  error: IconError,
  loading: IconLoading,
  streak: IconStreak,
  trophy: IconTrophy,
  newCustomer: IconNewCustomer,
  returningCustomer: IconReturningCustomer,
  newMember: IconNewMember,
  returningMember: IconReturningMember,
  settings: IconSettings,
  link: IconLink,
  promotion: IconPromotions,
};

export function AppIcon({
  name,
  size = 20,
  className = "text-[var(--brand-primary)]",
}: {
  name: AppIconName;
  size?: number;
  className?: string;
}) {
  const Icon = ICON_REGISTRY[name] as ComponentType<{ size?: number; className?: string }>;
  return <Icon className={className} size={size} />;
}

export function IconLabel({
  children,
  className = "",
  icon,
  iconClassName = "text-[var(--brand-primary)]",
  size = 16,
}: {
  children: ReactNode;
  className?: string;
  icon: AppIconName;
  iconClassName?: string;
  size?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <AppIcon className={iconClassName} name={icon} size={size} />
      <span>{children}</span>
    </span>
  );
}

export function routeIcon(href: string): AppIconName {
  return ROUTE_ICONS[href] ?? "addRecord";
}
