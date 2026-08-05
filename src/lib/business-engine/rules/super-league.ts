/**
 * Super League (超級聯賽 10+2) — calendar-year recruitment challenge.
 *
 * Source of truth: docs/BUSINESS_RULES.md → Super League
 */

export interface SuperLeagueRules {
  /** First-generation recruits required in the calendar year (1/1–12/31). */
  firstGenerationTarget: number;
  /** First-generation recruits who become 督導 within the same calendar year. */
  supervisorTarget: number;
  /** When true, counts are scoped to Jan 1 – Dec 31 of the reference year. */
  calendarYearScope: boolean;
}

export const DEFAULT_SUPER_LEAGUE_RULES: SuperLeagueRules = {
  firstGenerationTarget: 10,
  supervisorTarget: 2,
  calendarYearScope: true,
};
