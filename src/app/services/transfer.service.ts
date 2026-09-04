import { Injectable } from '@angular/core';
import { TransferWindowPhase } from '../models/types';

export const SUMMER_WINDOW_START = 1;
export const SUMMER_WINDOW_END = 6;
export const REGULAR_SEASON_START = 7;
export const REGULAR_SEASON_1_END = 25;
export const WINTER_WINDOW_START = 26;
export const WINTER_WINDOW_END = 29;
export const REGULAR_SEASON_2_START = 30;
export const REGULAR_SEASON_2_END = 48;
export const POST_SEASON_WINDOW_START = 49;
export const POST_SEASON_WINDOW_END = 50;
export const SEASON_ROLLOVER_WEEK = 51;
export const KICKOFF_WINDOW_WEEK = 52;
export const TOTAL_CALENDAR_WEEKS = 52;

export type CalendarPhase = 'pre_season' | 'regular_season_1' | 'winter_break' | 'regular_season_2' | 'post_season' | 'off_season';

export interface CalendarWeekInfo {
  week: number;
  phase: CalendarPhase;
  phaseLabel: string;
  hasMatches: boolean;
  matchdayRound?: number;
  description: string;
  nextMatchWeek?: number;
}

@Injectable({
  providedIn: 'root'
})
export class TransferService {
  /**
   * Calculates the transfer window phase based on the current 52-week schedule.
   * Summer window: Weeks 52 & 1–6
   * Winter window: Weeks 26–29
   * Post-season window: Weeks 49–50
   * Closed: All other weeks (Weeks 7–25, 30–48, 51)
   */
  getTransferWindowPhase(week: number): TransferWindowPhase {
    if (week === KICKOFF_WINDOW_WEEK || (week >= SUMMER_WINDOW_START && week <= SUMMER_WINDOW_END)) {
      return 'summer';
    } else if (week >= WINTER_WINDOW_START && week <= WINTER_WINDOW_END) {
      return 'winter';
    } else if (week >= POST_SEASON_WINDOW_START && week <= POST_SEASON_WINDOW_END) {
      return 'post_season';
    }
    return 'closed';
  }

  /**
   * Calculates the number of weeks remaining in the active transfer window.
   * Returns 0 if the transfer window is closed.
   */
  getWeeksRemainingInWindow(week: number): number {
    const phase = this.getTransferWindowPhase(week);
    if (phase === 'summer') {
      if (week === KICKOFF_WINDOW_WEEK) {
        return 1 + SUMMER_WINDOW_END;
      }
      return SUMMER_WINDOW_END - week + 1;
    } else if (phase === 'winter') {
      return WINTER_WINDOW_END - week + 1;
    } else if (phase === 'post_season') {
      return POST_SEASON_WINDOW_END - week + 1;
    }
    return 0;
  }

  /**
   * Retrieves structured calendar metadata and phase status for any week (1–52).
   */
  getCalendarWeekInfo(week: number): CalendarWeekInfo {
    if (week >= SUMMER_WINDOW_START && week <= SUMMER_WINDOW_END) {
      return {
        week,
        phase: 'pre_season',
        phaseLabel: 'Pre-Season',
        hasMatches: false,
        description: 'Pre-season training and summer transfer window. Regular season matches kick off in Week 7.',
        nextMatchWeek: REGULAR_SEASON_START
      };
    } else if (week >= WINTER_WINDOW_START && week <= WINTER_WINDOW_END) {
      return {
        week,
        phase: 'winter_break',
        phaseLabel: 'Winter Break',
        hasMatches: false,
        description: 'Mid-season break and winter transfer window. League fixtures resume in Week 30.',
        nextMatchWeek: REGULAR_SEASON_2_START
      };
    } else if ((week >= REGULAR_SEASON_START && week <= REGULAR_SEASON_1_END) || (week >= REGULAR_SEASON_2_START && week <= REGULAR_SEASON_2_END)) {
      const isFirstHalf = week <= REGULAR_SEASON_1_END;
      const matchdayRound = isFirstHalf
        ? week - (REGULAR_SEASON_START - 1)
        : (REGULAR_SEASON_1_END - REGULAR_SEASON_START + 1) + (week - (REGULAR_SEASON_2_START - 1));
      return {
        week,
        phase: isFirstHalf ? 'regular_season_1' : 'regular_season_2',
        phaseLabel: 'Regular Season',
        hasMatches: true,
        matchdayRound,
        description: `Regular season matchday ${matchdayRound} of 38.`
      };
    } else if (week >= POST_SEASON_WINDOW_START && week <= POST_SEASON_WINDOW_END) {
      return {
        week,
        phase: 'post_season',
        phaseLabel: 'Post-Season',
        hasMatches: false,
        description: 'Post-season awards and transfer window before contract rollover.'
      };
    } else if (week === SEASON_ROLLOVER_WEEK) {
      return {
        week,
        phase: 'off_season',
        phaseLabel: 'Season Rollover',
        hasMatches: false,
        description: 'Contract expirations and player retirements.'
      };
    } else {
      return {
        week,
        phase: 'off_season',
        phaseLabel: 'Kickoff Week',
        hasMatches: false,
        description: 'New season preparation and early transfer market opening.',
        nextMatchWeek: REGULAR_SEASON_START
      };
    }
  }

  /**
   * Returns whether a given calendar week has scheduled league matches.
   */
  hasMatchesInWeek(week: number): boolean {
    return (week >= REGULAR_SEASON_START && week <= REGULAR_SEASON_1_END) ||
           (week >= REGULAR_SEASON_2_START && week <= REGULAR_SEASON_2_END);
  }
}

