import { Injectable, effect, inject, signal } from '@angular/core';
import { GameService } from './game.service';
import { PersistenceService } from './persistence.service';
import { League } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class ScheduleStateService {
  private readonly gameService = inject(GameService);
  private readonly persistenceService = inject(PersistenceService);

  selectedWeek = signal<number>(1);

  private isHydrating = signal(true);
  private hydrationPromise: Promise<void> | null = null;
  private isSelectionInitialized = false;
  private skipNextPersist = false;

  constructor() {
    void this.ensureHydrated();

    effect(() => {
      const week = this.selectedWeek();
      if (this.isHydrating()) return;

      if (this.skipNextPersist) {
        this.skipNextPersist = false;
        return;
      }

      void this.persistenceService.saveSelectedWeek(week).catch((error) => {
        // Prevent unhandled promise rejections from persistence failures
        console.error('Failed to persist selected week:', error);
      });
    });

    effect(() => {
      const league = this.gameService.league();
      if (!league || this.isHydrating()) return;

      if (!this.isSelectionInitialized) {
        const targetWeek = this.clampWeek(league.currentWeek, league);
        if (targetWeek !== this.selectedWeek()) {
          this.selectedWeek.set(targetWeek);
        }
        this.markSelectionInitialized();
        return;
      }

      const clamped = this.clampWeek(this.selectedWeek(), league);
      if (clamped !== this.selectedWeek()) {
        this.selectedWeek.set(clamped);
      }
    });
  }

  ensureHydrated(): Promise<void> {
    if (this.hydrationPromise) {
      return this.hydrationPromise;
    }

    this.hydrationPromise = this.hydrateFromPersistence();
    return this.hydrationPromise;
  }

  async resetToWeek(week: number): Promise<void> {
    const safeWeek = Math.max(1, Math.floor(week));
    this.markSelectionInitialized();
    this.skipNextPersist = true;
    this.selectedWeek.set(safeWeek);
    await this.persistenceService.saveSelectedWeek(safeWeek);
  }

  async clearPersistedWeek(): Promise<void> {
    this.skipNextPersist = true;
    this.selectedWeek.set(1);
    this.markSelectionInitialized();
    await this.persistenceService.clearSelectedWeek();
  }

  private async hydrateFromPersistence(): Promise<void> {
    try {
      const storedWeek = await this.persistenceService.loadSelectedWeek();
      if (typeof storedWeek === 'number' && Number.isFinite(storedWeek) && storedWeek >= 1) {
        this.selectedWeek.set(Math.floor(storedWeek));
        this.markSelectionInitialized();
      }

      const gameHydration = this.gameService.ensureHydrated?.();
      if (gameHydration) {
        await gameHydration;
      }
      const league = this.gameService.league();
      if (league) {
        if (!this.isSelectionInitialized) {
          this.selectedWeek.set(this.clampWeek(league.currentWeek, league));
          this.markSelectionInitialized();
        } else {
          this.selectedWeek.set(this.clampWeek(this.selectedWeek(), league));
        }
      }
    } catch (error) {
      console.error('Failed to load selected week:', error);
    } finally {
      this.isHydrating.set(false);
    }
  }

  private clampWeek(week: number, league: League): number {
    const maxWeeks = Math.max(1, (league.teams.length - 1) * 2);
    return Math.min(Math.max(week, 1), maxWeeks);
  }

  /**
   * Marks the selected week as initialized (persisted or fallback).
   * This is the single point where the selection lifecycle transitions to "initialized".
   *
   * Lifecycle:
   * 1. Constructor: isHydrating=true, isSelectionInitialized=false
   * 2. hydrateFromPersistence() runs:
   *    - If stored week exists: set selectedWeek, then call this method (persisted path)
   *    - If no stored week: wait for league, set to currentWeek, then call this method (fallback path)
   * 3. Public methods (resetToWeek, clearPersistedWeek) call this method when explicitly setting a week
   * 4. Constructor effect calls this method when resolving fallback during hydration
   * 5. After this method: effects may react to selectedWeek changes and persist them
   *
   * This consolidation ensures all selection initialization paths go through one place,
   * making the state machine easier to reason about and less prone to inconsistency.
   */
  private markSelectionInitialized(): void {
    this.isSelectionInitialized = true;
  }
}