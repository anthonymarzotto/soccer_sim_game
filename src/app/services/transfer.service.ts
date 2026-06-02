import { Injectable } from '@angular/core';
import { TransferWindowPhase } from '../models/types';

export const SUMMER_WINDOW_START = 1;
export const SUMMER_WINDOW_END = 3;
export const WINTER_WINDOW_START = 20;
export const WINTER_WINDOW_END = 22;

@Injectable({
  providedIn: 'root'
})
export class TransferService {
  /**
   * Calculates the transfer window phase based on the current schedule week.
   * Summer window: Weeks 1–3
   * Winter window: Weeks 20–22
   * Closed: All other weeks
   */
  getTransferWindowPhase(week: number): TransferWindowPhase {
    if (week >= SUMMER_WINDOW_START && week <= SUMMER_WINDOW_END) {
      return 'summer';
    } else if (week >= WINTER_WINDOW_START && week <= WINTER_WINDOW_END) {
      return 'winter';
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
      return SUMMER_WINDOW_END - week + 1;
    } else if (phase === 'winter') {
      return WINTER_WINDOW_END - week + 1;
    }
    return 0;
  }
}

