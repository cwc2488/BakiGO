export interface DailyActionMetricView {
  current: number;
  target: number | null;
  progressPercent: number | null;
  isRuleMissing: boolean;
}

export interface DailyActionSuperLeagueEntryView {
  id: string;
  displayName: string;
  isSupervisor: boolean;
}

export interface DailyActionSuperLeagueView {
  firstGeneration: DailyActionMetricView;
  supervisor: DailyActionMetricView;
  completionPercent: number | null;
  entries: DailyActionSuperLeagueEntryView[];
}

export interface DailyActionSnapshot {
  referenceDate: string;
  yearMonth: string;
  monthlyMeasurement: DailyActionMetricView;
  monthlyConsultation: DailyActionMetricView;
  superLeague: DailyActionSuperLeagueView;
  presidentAiTitle: string;
  presidentAiDescription: string | null;
}

export type TodayActionKey = "measurement" | "consultation" | "recruit";
