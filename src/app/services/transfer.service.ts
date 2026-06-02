import { Injectable } from '@angular/core';
import { TransferWindowPhase } from '../models/types';

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
    if (week >= 1 && week <= 3) {
      return 'summer';
    } else if (week >= 20 && week <= 22) {
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
      return 3 - week + 1;
    } else if (phase === 'winter') {
      return 22 - week + 1;
    }
    return 0;
  }
}
