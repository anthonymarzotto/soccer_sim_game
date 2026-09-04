import { Injectable } from '@angular/core';
import { TransferWindowPhase } from '../models/types';

export const SUMMER_WINDOW_START = 1;
export const SUMMER_WINDOW_END = 6;
export const WINTER_WINDOW_START = 26;
export const WINTER_WINDOW_END = 29;
export const POST_SEASON_WINDOW_START = 49;
export const POST_SEASON_WINDOW_END = 50;
export const KICKOFF_WINDOW_WEEK = 52;

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
}

