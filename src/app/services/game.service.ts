import { Injectable, signal, computed, inject, isDevMode } from '@angular/core';
import { League, Match, Team, Player, PlayerCareerStats, PlayerSeasonAttributes, Role, MatchEvent, MatchStatistics, MatchReport, PlayerStatistics, RecentMatchResult, StatKey } from '../models/types';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';
import { rankThreeStars } from '../models/match-stars';
import { computeAge, seasonAnchorDate } from '../models/player-age';
import { gaussianRandom, clamp } from '../utils/math';
import { derivePhase, phaseGrowthWeight, phaseDecayWeight, getStatKeysForCategory, calculateOverall } from '../models/player-progression';
import { GeneratorService } from './generator.service';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { CommentaryService } from './commentary.service';
import { StatisticsService } from './statistics.service';
import { PostMatchAnalysisService } from './post.match.analysis.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { PersistenceService } from './persistence.service';
import { DataSchemaVersionService } from './data-schema-version.service';
import { normalizeTeamFormation } from '../models/team-migration';
import { normalizeTeamRoster, resolveTeamPlayers } from '../models/team-players';
import {
  createEmptyTeamStats,
  getActiveInjury,
  getCurrentPlayerSeasonAttributes,
  getPlayerSeasonAttributesForYear,
  getTeamSeasonSnapshotForYear,
  isPlayerEligible,
  withSortedUniqueSeasons
} from '../models/season-history';
import { SimulationConfig, MatchState, PlayByPlayEvent } from '../models/simulation.types';
import { MatchResult, CommentaryStyle, Position, EventImportance, EventType } from '../models/enums';
import { getInjuryDefinition, InjuryRecord } from '../data/injuries';

interface SimulateMatchWithDetailsResult {
  matchState: MatchState;
  matchStats: MatchStatistics;
  matchReport: MatchReport;
  keyEvents: MatchEvent[];
  commentary: string[];
}

export interface TeamMatchReadinessIssue {
  kind: 'formation' | 'injured-starter' | 'injured-bench';
  message: string;
  playerId?: string;
  playerName?: string;
  injuryDefinitionId?: string;
  injuryName?: string;
  weeksRemaining?: number;
}

export interface TeamMatchReadiness {
  isReady: boolean;
  issues: TeamMatchReadinessIssue[];
}

type CareerStatsAggregate = Omit<PlayerCareerStats, 'seasonYear'> & {
  seasonYear: 'Career';
};

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private static readonly WEEK_SIMULATION_LOCK_MS = 350;
  private static readonly MATCH_RETENTION_CAP = 5000;

  private leagueState = signal<League | null>(null);
  private hydrationPromise: Promise<void> | null = null;
  private isHydrating = signal(true);
  private isSimulatingWeekState = signal(false);
  private singleMatchSimulationSessionCount = signal(0);
  private weekSimulationUnlockTimer: ReturnType<typeof setTimeout> | null = null;

  public league = this.leagueState.asReadonly();
  public isSimulatingMatchWeek = this.isSimulatingWeekState.asReadonly();
  public isSimulatingSingleMatch = computed(() => this.singleMatchSimulationSessionCount() > 0);
  public isAnySimulationInProgress = computed(() => this.isSimulatingMatchWeek() || this.isSimulatingSingleMatch());
  public isSeasonComplete = computed(() => {
    const league = this.leagueState();
    return Boolean(league && league.schedule.length > 0 && league.schedule.every(match => match.played));
  });

  public hasLeague = computed(() => this.leagueState() !== null);

  public standings = computed(() => {
    const l = this.leagueState();
    if (!l) return [];
    return [...l.teams].sort((a, b) => {
      const aStats = this.getTeamSnapshotForSeason(a, l.currentSeasonYear).stats;
      const bStats = this.getTeamSnapshotForSeason(b, l.currentSeasonYear).stats;
      if (bStats.points !== aStats.points) return bStats.points - aStats.points;
      const gdA = aStats.goalsFor - aStats.goalsAgainst;
      const gdB = bStats.goalsFor - bStats.goalsAgainst;
      if (gdB !== gdA) return gdB - gdA;
      return bStats.goalsFor - aStats.goalsFor;
    });
  });

  public currentWeekMatches = computed(() => {
    const l = this.leagueState();
    if (!l) return [];
    return l.schedule.filter(m => m.week === l.currentWeek && m.seasonYear === l.currentSeasonYear);
  });

  private teamById = computed(() => {
    const l = this.leagueState();
    return new Map((l?.teams ?? []).map(team => [team.id, team]));
  });

  private playerById = computed(() => {
    const l = this.leagueState();
    return new Map((l?.teams ?? []).flatMap(team => resolveTeamPlayers(team).map(player => [player.id, player] as const)));
  });

  private withSyncedPlayerIds(team: Team): Team {
    return normalizeTeamRoster(team);
  }

  private withSyncedPlayerIdsForTeams(teams: Team[]): Team[] {
    return teams.map(team => this.withSyncedPlayerIds(team));
  }

  private generator = inject(GeneratorService);
  private persistenceService = inject(PersistenceService);
  private dataSchemaVersionService = inject(DataSchemaVersionService, { optional: true });
  public isMutatingWritesBlockedBySchemaMismatch = computed(
    () => this.dataSchemaVersionService?.hasPersistedDataSchemaVersionMismatch() ?? false
  );

  private canMutateLeagueState(): boolean {
    return !this.isMutatingWritesBlockedBySchemaMismatch();
  }

  constructor() {
    void this.ensureHydrated();
  }

  ensureHydrated(): Promise<void> {
    if (this.hydrationPromise) {
      return this.hydrationPromise;
    }

    this.hydrationPromise = this.hydrateFromPersistence();
    return this.hydrationPromise;
  }

  private async hydrateFromPersistence(): Promise<void> {
    try {
      const league = await this.persistenceService.loadLeague();
      if (league) {
        this.leagueState.set({
          ...league,
          teams: this.withSyncedPlayerIdsForTeams(league.teams)
        });
      }
    } catch (error) {
      console.error('Failed to load league:', error);
    } finally {
      this.isHydrating.set(false);
    }
  }

  private persistLeague(league: League): void {
    if (this.isHydrating()) {
      return;
    }

    void this.persistenceService.saveLeague(league).catch(error => {
      console.error('Failed to persist league:', error);
    });
  }

  private persistLeagueMetadata(league: Pick<League, 'currentWeek' | 'currentSeasonYear' | 'userTeamId'>): void {
    if (this.isHydrating()) {
      return;
    }

    void this.persistenceService.saveLeagueMetadata(league);
  }

  private persistChangedTeamsAndPlayers(previousTeams: Team[], nextTeams: Team[]): void {
    if (this.isHydrating()) {
      return;
    }

    const previousById = new Map(previousTeams.map(team => [team.id, team]));
    const changedTeams = nextTeams.filter(team => previousById.get(team.id) !== team);

    changedTeams.forEach(team => {
      void this.persistenceService.saveTeam(team, this.getCurrentLeagueSeasonYear());
    });
  }

  private persistChangedTeams(previousTeams: Team[], nextTeams: Team[]): void {
    if (this.isHydrating()) {
      return;
    }

    const previousById = new Map(previousTeams.map(team => [team.id, team]));
    const changedTeams = nextTeams.filter(team => previousById.get(team.id) !== team);

    changedTeams.forEach(team => {
      void this.persistenceService.saveTeamDefinition(team);
    });
  }

  private persistMatch(match: Match): void {
    if (this.isHydrating()) {
      return;
    }

    void this.persistenceService.saveMatch(match);
  }

  generateNewLeague() {
    if (!this.canMutateLeagueState()) {
      return;
    }

    const { teams, schedule, currentSeasonYear } = this.generator.generateLeague();
    const optimizedTeams = this.dressBestPlayers(this.withSyncedPlayerIdsForTeams(teams));
    const league: League = {
      teams: optimizedTeams,
      schedule,
      currentWeek: 1,
      currentSeasonYear
    };

    this.leagueState.set(league);
    this.persistLeague(league);
  }

  private getCurrentLeagueSeasonYear(): number {
    return this.leagueState()?.currentSeasonYear ?? new Date().getFullYear();
  }

  async clearLeague(): Promise<void> {
    this.leagueState.set(null);

    try {
      await this.persistenceService.clearLeague();
    } catch (error) {
      console.error('Failed to clear persisted league:', error);
    }
  }

  getTeam(id: string): Team | undefined {
    return this.teamById().get(id);
  }

  getPlayer(id: string): Player | undefined {
    return this.playerById().get(id);
  }

  getPlayersForTeam(teamId: string): Player[] {
    const team = this.getTeam(teamId);
    if (!team) return [];
    return resolveTeamPlayers(team);
  }

  getPlayerOnTeam(team: Team, playerId: string): Player | undefined {
    return resolveTeamPlayers(team).find(player => player.id === playerId);
  }

  getMatchesForWeek(week: number): Match[] {
    const league = this.leagueState();
    if (!league) return [];
    return league.schedule.filter(match => match.week === week && (match.seasonYear ?? league.currentSeasonYear) === league.currentSeasonYear);
  }

  getCurrentSeasonPlayerAttributes(player: Player): ReturnType<typeof getCurrentPlayerSeasonAttributes> {
    return getCurrentPlayerSeasonAttributes(player, this.getCurrentLeagueSeasonYear());
  }

  getTeamSnapshotForSeason(team: Team, seasonYear: number) {
    const snapshot = getTeamSeasonSnapshotForYear(team, seasonYear);
    if (snapshot) {
      return snapshot;
    }

    // Missing current-season snapshot indicates corrupted in-memory state; the
    // assembleLeague boundary guarantees this record exists. Fail loudly in dev.
    const currentSeasonYear = this.leagueState()?.currentSeasonYear;
    if (seasonYear === currentSeasonYear) {
      const message =
        `getTeamSnapshotForSeason: missing season-${seasonYear} snapshot for team "${team.id}". ` +
        `Persisted/in-memory data is incompatible; reset required.`;
      if (isDevMode()) {
        throw new Error(message);
      }
      console.error(message);
    }

    // Historical-year query for a team that wasn't in that season: return empty stats.
    return {
      seasonYear,
      playerIds: [...team.playerIds],
      stats: createEmptyTeamStats()
    };
  }

  getTeamAverageOverallForSeason(team: Team, seasonYear: number): number | null {
    const snapshot = getTeamSeasonSnapshotForYear(team, seasonYear);
    if (!snapshot || snapshot.playerIds.length === 0) return null;

    const overalls = snapshot.playerIds
      .map(id => this.getPlayer(id))
      .filter((p): p is Player => p !== undefined)
      .map(p => getPlayerSeasonAttributesForYear(p, seasonYear)?.overall.value)
      .filter((o): o is number => o !== undefined);

    if (overalls.length === 0) return null;
    return Math.round(overalls.reduce((a, b) => a + b, 0) / overalls.length);
  }

  getLeagueStandingsRankForSeason(teamId: string, seasonYear: number): { rank: number | null; totalTeams: number } {
    const teams = this.leagueState()?.teams;
    if (!teams) return { rank: null, totalTeams: 0 };

    const withStats: { teamId: string; points: number; gd: number; gf: number }[] = [];
    for (const team of teams) {
      const snapshot = getTeamSeasonSnapshotForYear(team, seasonYear);
      if (snapshot) {
        withStats.push({
          teamId: team.id,
          points: snapshot.stats.points,
          gd: snapshot.stats.goalsFor - snapshot.stats.goalsAgainst,
          gf: snapshot.stats.goalsFor
        });
      }
    }

    withStats.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.gf - a.gf;
    });

    const index = withStats.findIndex(entry => entry.teamId === teamId);
    return { rank: index >= 0 ? index + 1 : null, totalTeams: withStats.length };
  }

  advanceWeek() {
    if (!this.canMutateLeagueState()) {
      return;
    }

    const league = this.leagueState();
    if (!league) return;

    const updatedLeague: League = {
      ...league,
      currentWeek: league.currentWeek + 1,
      teams: this.decrementInjuryWeeks(league.teams, league.currentSeasonYear, league.currentWeek)
    };

    this.leagueState.set(updatedLeague);
    this.persistChangedTeamsAndPlayers(league.teams, updatedLeague.teams);
    this.persistLeagueMetadata(updatedLeague);
  }

  /**
   * Decrements `weeksRemaining` on every player's active injury once the player
   * has completed at least one full future match week on the sideline.
   * Resolved injuries (weeksRemaining hits 0) remain in `player.injuries` as
   * historical records.
   */
  private decrementInjuryWeeks(teams: Team[], currentSeasonYear: number, currentWeek: number): Team[] {
    return teams.map(team => {
      if (!team.players) return team;
      let teamMutated = false;
      const players = team.players.map(player => {
        if (!player.injuries || player.injuries.length === 0) return player;
        let playerMutated = false;
        const updated = player.injuries.map(record => {
          if (record.weeksRemaining <= 0) return record;
          const wasAlreadyActiveBeforeThisWeek =
            record.sustainedInSeason < currentSeasonYear
            || record.sustainedInWeek < currentWeek;
          if (!wasAlreadyActiveBeforeThisWeek) {
            return record;
          }
          playerMutated = true;
          return { ...record, weeksRemaining: record.weeksRemaining - 1 };
        });
        if (!playerMutated) {
          return player;
        }
        teamMutated = true;
        return { ...player, injuries: updated };
      });
      return teamMutated ? { ...team, players } : team;
    });
  }

  /**
   * Scans the completed match's events for INJURY entries and appends an
   * `InjuryRecord` to each affected player's `injuries` array. Returns a new
   * Team[] with the affected players replaced; untouched teams/players are
   * referentially preserved.
   */
  private applyPostMatchInjuries(
    teams: Team[],
    matchState: MatchState,
    seasonYear: number,
    week: number
  ): Team[] {
    const injuryByPlayerId = new Map<string, InjuryRecord>();
    for (const event of matchState.events) {
      if (event.type !== EventType.INJURY) continue;
      const meta = event.additionalData?.injury;
      const playerId = event.playerIds[0];
      if (!meta || !playerId) continue;
      // If a player somehow has multiple INJURY events in a single match, keep the first.
      if (injuryByPlayerId.has(playerId)) continue;
      injuryByPlayerId.set(playerId, {
        definitionId: meta.definitionId,
        totalWeeks: meta.totalWeeks,
        weeksRemaining: meta.weeksRemaining,
        sustainedInSeason: seasonYear,
        sustainedInWeek: week
      });
    }

    if (injuryByPlayerId.size === 0) return teams;

    return teams.map(team => {
      if (!team.players) return team;
      let teamMutated = false;
      const players = team.players.map(player => {
        const record = injuryByPlayerId.get(player.id);
        if (!record) return player;
        teamMutated = true;
        return { ...player, injuries: [...(player.injuries ?? []), record] };
      });
      return teamMutated ? { ...team, players } : team;
    });
  }

  simulateWholeSeason(): void {
    if (!this.canMutateLeagueState()) return;
    if (this.isSeasonComplete() || this.isAnySimulationInProgress()) return;

    if (this.weekSimulationUnlockTimer) {
      clearTimeout(this.weekSimulationUnlockTimer);
      this.weekSimulationUnlockTimer = null;
    }

    this.isSimulatingWeekState.set(true);

    try {
      // Refresh lineups once before the loop; updateLeagueWithMatchResult re-dresses
      // teams after each match, so per-match refreshes are redundant.
      const initialLeague = this.leagueState();
      if (initialLeague) {
        this.persistRefreshedComputerControlledLineups(initialLeague);
      }

      while (!this.isSeasonComplete()) {
        const league = this.leagueState()!;
        const matches = league.schedule.filter(
          m => m.week === league.currentWeek && m.seasonYear === league.currentSeasonYear && !m.played
        );

        matches.forEach(match => {
          const homeTeam = league.teams.find(t => t.id === match.homeTeamId);
          const awayTeam = league.teams.find(t => t.id === match.awayTeamId);
          if (!homeTeam || !awayTeam) return;

          this.simulateMatchWithDetails(match, homeTeam, awayTeam, {
            enablePlayByPlay: false,
            enableSpatialTracking: false,
            enableTactics: true,
            enableFatigue: true,
            skipCommentary: true,
            simulationVariant: 'B'
          }, { bypassWeekSimulationLock: true, skipLineupRefresh: true });
        });

        this.advanceWeek();
      }
    } finally {
      this.weekSimulationUnlockTimer = setTimeout(() => {
        this.isSimulatingWeekState.set(false);
        this.weekSimulationUnlockTimer = null;
      }, GameService.WEEK_SIMULATION_LOCK_MS);
    }
  }

  simulateCurrentWeek(config?: Partial<SimulationConfig>) {
    if (!this.canMutateLeagueState()) return;

    const l = this.leagueState();
    if (!l || this.isSeasonComplete() || this.isSimulatingWeekState() || this.isSimulatingSingleMatch()) return;

    if (this.weekSimulationUnlockTimer) {
      clearTimeout(this.weekSimulationUnlockTimer);
      this.weekSimulationUnlockTimer = null;
    }

    this.isSimulatingWeekState.set(true);

    try {
      const matches = l.schedule.filter(m => m.week === l.currentWeek && m.seasonYear === l.currentSeasonYear);

      matches.forEach(match => {
        if (match.played) return;

        const homeTeam = l.teams.find(t => t.id === match.homeTeamId);
        const awayTeam = l.teams.find(t => t.id === match.awayTeamId);

        if (!homeTeam || !awayTeam) return;

        // Use enhanced simulation with full features enabled.
        // Bypass the single-match lock because this path owns the week-level lock.
        const result = this.simulateMatchWithDetails(match, homeTeam, awayTeam, {
          enablePlayByPlay: true,
          enableSpatialTracking: true,
          enableTactics: true,
          enableFatigue: true,
          commentaryStyle: CommentaryStyle.DETAILED,
          simulationVariant: 'B',
          ...config
        }, { bypassWeekSimulationLock: true });

        if (!result) {
          return;
        }

        // The match result is already updated in the league state by simulateMatchWithDetails
      });

      // Advance to next week
      this.advanceWeek();
    } finally {
      this.weekSimulationUnlockTimer = setTimeout(() => {
        this.isSimulatingWeekState.set(false);
        this.weekSimulationUnlockTimer = null;
      }, GameService.WEEK_SIMULATION_LOCK_MS);
    }
  }

  beginSingleMatchSimulationSession() {
    this.singleMatchSimulationSessionCount.update(count => count + 1);
  }

  endSingleMatchSimulationSession() {
    this.singleMatchSimulationSessionCount.update(count => Math.max(0, count - 1));
  }

  setUserTeam(teamId: string) {
    if (!this.canMutateLeagueState()) {
      return;
    }

    const l = this.leagueState();
    if (l) {
      const updatedLeague: League = { ...l, userTeamId: teamId };
      this.leagueState.set(updatedLeague);
      this.persistLeagueMetadata(updatedLeague);
    }
  }

  updatePlayerRole(playerId: string, newRole: Role) {
    if (!this.canMutateLeagueState()) {
      return;
    }

    const l = this.leagueState();
    if (!l) return;

    const updatedTeams = l.teams.map(team => {
      const teamPlayers = resolveTeamPlayers(team);
      const playerIndex = teamPlayers.findIndex(p => p.id === playerId);
      if (playerIndex !== -1) {
        if (!this.canAssignPlayerToRole(teamPlayers[playerIndex], newRole)) {
          return team;
        }
        const updatedPlayers = [...teamPlayers];
        updatedPlayers[playerIndex] = { ...updatedPlayers[playerIndex], role: newRole };
        return this.withSyncedPlayerIds({ ...team, players: updatedPlayers });
      }
      return team;
    });

    const updatedLeague: League = { ...l, teams: updatedTeams };
    this.leagueState.set(updatedLeague);
    this.persistChangedTeamsAndPlayers(l.teams, updatedLeague.teams);
  }

  updateFormationAssignment(teamId: string, slotId: string, playerId: string) {
    if (!this.canMutateLeagueState()) {
      return;
    }

    const l = this.leagueState();
    if (!l) return;

    const updatedTeams = l.teams.map(team => {
      if (team.id !== teamId) return team;

      const teamPlayers = resolveTeamPlayers(team);

      const player = teamPlayers.find(p => p.id === playerId);
      if (!player || !isPlayerEligible(player)) return team;

      const updatedPlayers = teamPlayers.map(p =>
        p.id === playerId ? { ...p, role: Role.STARTER } : p
      );

      const nextAssignments = { ...team.formationAssignments };
      Object.keys(nextAssignments).forEach(key => {
        if (nextAssignments[key] === playerId) {
          nextAssignments[key] = '';
        }
      });
      nextAssignments[slotId] = playerId;

      return {
        ...team,
        players: updatedPlayers,
        formationAssignments: nextAssignments
      };
    });

    const updatedLeague: League = { ...l, teams: this.withSyncedPlayerIdsForTeams(updatedTeams) };
    this.leagueState.set(updatedLeague);
    this.persistChangedTeamsAndPlayers(l.teams, updatedLeague.teams);
  }

  movePlayerToBench(teamId: string, playerId: string) {
    if (!this.canMutateLeagueState()) {
      return;
    }

    const l = this.leagueState();
    if (!l) return;

    const updatedTeams = l.teams.map(team => {
      if (team.id !== teamId) return team;

      const teamPlayers = resolveTeamPlayers(team);
      const player = teamPlayers.find(p => p.id === playerId);
      if (!player || !this.canAssignPlayerToRole(player, Role.BENCH)) return team;

      const updatedPlayers = teamPlayers.map(p =>
        p.id === playerId ? { ...p, role: Role.BENCH } : p
      );

      const updatedAssignments = { ...team.formationAssignments };
      Object.keys(updatedAssignments).forEach(slotId => {
        if (updatedAssignments[slotId] === playerId) {
          updatedAssignments[slotId] = '';
        }
      });

      return {
        ...team,
        players: updatedPlayers,
        formationAssignments: updatedAssignments
      };
    });

    const updatedLeague: League = { ...l, teams: this.withSyncedPlayerIdsForTeams(updatedTeams) };
    this.leagueState.set(updatedLeague);
    this.persistChangedTeamsAndPlayers(l.teams, updatedLeague.teams);
  }

  clearFormationAssignment(teamId: string, slotId: string) {
    if (!this.canMutateLeagueState()) {
      return;
    }

    const l = this.leagueState();
    if (!l) return;

    const updatedTeams = l.teams.map(team => {
      if (team.id !== teamId) return team;
      return {
        ...team,
        formationAssignments: {
          ...team.formationAssignments,
          [slotId]: ''
        }
      };
    });

    const updatedLeague: League = { ...l, teams: updatedTeams };
    this.leagueState.set(updatedLeague);
    this.persistChangedTeams(l.teams, updatedLeague.teams);
  }

  private buildMatchReadiness(team: Team): TeamMatchReadiness {
    const players = resolveTeamPlayers(team);
    const issues: TeamMatchReadinessIssue[] = this.fieldService
      .validateFormationAssignments(team, players)
      .errors
      .map(message => ({ kind: 'formation', message }));

    const playersById = new Map(players.map(player => [player.id, player]));
    const seenInjuredPlayers = new Set<string>();

    for (const player of players) {
      if (player.role === Role.RESERVE) {
        continue;
      }

      const activeInjury = getActiveInjury(player);
      if (!activeInjury) {
        continue;
      }

      seenInjuredPlayers.add(player.id);
      issues.push(this.createInjuryReadinessIssue(player, activeInjury));
    }

    for (const assignedPlayerId of Object.values(team.formationAssignments ?? {})) {
      if (!assignedPlayerId || seenInjuredPlayers.has(assignedPlayerId)) {
        continue;
      }

      const assigned = playersById.get(assignedPlayerId);
      if (!assigned) {
        continue;
      }

      const activeInjury = getActiveInjury(assigned);
      if (!activeInjury) {
        continue;
      }

      seenInjuredPlayers.add(assignedPlayerId);
      issues.push(this.createInjuryReadinessIssue(assigned, activeInjury));
    }

    return {
      isReady: issues.length === 0,
      issues
    };
  }

  private formatReadinessWeeksRemaining(weeksRemaining: number): string {
    return weeksRemaining === 1 ? '1 week remaining' : `${weeksRemaining} weeks remaining`;
  }

  private canAssignPlayerToRole(player: Player, role: Role): boolean {
    return role === Role.RESERVE || isPlayerEligible(player);
  }

  private createInjuryReadinessIssue(player: Player, activeInjury: InjuryRecord): TeamMatchReadinessIssue {
    const injuryName = getInjuryDefinition(activeInjury.definitionId)?.name ?? activeInjury.definitionId;
    const availability = this.formatReadinessWeeksRemaining(activeInjury.weeksRemaining);
    const issueKind = player.role === Role.BENCH ? 'injured-bench' : 'injured-starter';
    const message = player.role === Role.BENCH
      ? `${player.name} is injured (${injuryName}, ${availability}) and cannot be on the bench.`
      : `${player.name} is injured (${injuryName}, ${availability}) and cannot start.`;

    return {
      kind: issueKind,
      message,
      playerId: player.id,
      playerName: player.name,
      injuryDefinitionId: activeInjury.definitionId,
      injuryName,
      weeksRemaining: activeInjury.weeksRemaining
    };
  }

  getFormationValidationErrors(team: Team): string[] {
    return this.buildMatchReadiness(team).issues
      .filter(issue => issue.kind === 'formation')
      .map(issue => issue.message);
  }

  getMatchReadiness(teamId: string): TeamMatchReadiness {
    const league = this.leagueState();
    if (!league) {
      return { isReady: true, issues: [] };
    }

    const team = league.teams.find(candidate => candidate.id === teamId);
    if (!team) {
      return { isReady: true, issues: [] };
    }

    return this.buildMatchReadiness(team);
  }

  private formationLibrary = inject(FormationLibraryService);

  changeTeamFormation(teamId: string, formationId: string) {
    if (!this.canMutateLeagueState()) {
      return;
    }

    const l = this.leagueState();
    const schema = this.formationLibrary.getFormationSlots(formationId);
    if (!l || !schema) return;

    const updatedTeams = l.teams.map(team => {
      if (team.id !== teamId) return team;
      const normalizedTeam = normalizeTeamFormation({ ...team, selectedFormationId: formationId }, formationId, schema);
      return this.syncStarterRolesWithAssignments(normalizedTeam);
    });

    const updatedLeague: League = { ...l, teams: updatedTeams };
    this.leagueState.set(updatedLeague);
    this.persistChangedTeams(l.teams, updatedLeague.teams);
  }

  private syncStarterRolesWithAssignments(team: Team): Team {
    const assignedPlayerIds = new Set(
      Object.values(team.formationAssignments).filter((playerId): playerId is string => playerId.length > 0)
    );
    const updatedPlayers = resolveTeamPlayers(team).map(player => {
      if (assignedPlayerIds.has(player.id)) {
        return player.role === Role.STARTER ? player : { ...player, role: Role.STARTER };
      }

      if (player.role === Role.STARTER) {
        return { ...player, role: Role.RESERVE };
      }

      return player;
    });

    return this.withSyncedPlayerIds({
      ...team,
      players: updatedPlayers
    });
  }

  swapPlayerRoles(playerId1: string, playerId2: string) {
    if (!this.canMutateLeagueState()) {
      return;
    }

    const l = this.leagueState();
    if (!l) return;

    const updatedTeams = l.teams.map(team => {
      const teamPlayers = resolveTeamPlayers(team);
      const player1Index = teamPlayers.findIndex(p => p.id === playerId1);
      const player2Index = teamPlayers.findIndex(p => p.id === playerId2);

      if (player1Index !== -1 && player2Index !== -1) {
        const updatedPlayers = [...teamPlayers];
        const player1Role = updatedPlayers[player1Index].role;
        const player2Role = updatedPlayers[player2Index].role;
        if (
          !this.canAssignPlayerToRole(updatedPlayers[player1Index], player2Role)
          || !this.canAssignPlayerToRole(updatedPlayers[player2Index], player1Role)
        ) {
          return team;
        }
        const updatedAssignments = { ...team.formationAssignments };
        const player1SlotId = this.findAssignedSlotId(updatedAssignments, playerId1);
        const player2SlotId = this.findAssignedSlotId(updatedAssignments, playerId2);

        updatedPlayers[player1Index] = { ...updatedPlayers[player1Index], role: player2Role };
        updatedPlayers[player2Index] = { ...updatedPlayers[player2Index], role: player1Role };

        if (player1SlotId && player2SlotId) {
          updatedAssignments[player1SlotId] = playerId2;
          updatedAssignments[player2SlotId] = playerId1;
        } else if (player1SlotId) {
          updatedAssignments[player1SlotId] = playerId2;
        } else if (player2SlotId) {
          updatedAssignments[player2SlotId] = playerId1;
        }

        return {
          ...team,
          players: updatedPlayers,
          formationAssignments: updatedAssignments
        };
      }
      return team;
    });

    const updatedLeague: League = { ...l, teams: this.withSyncedPlayerIdsForTeams(updatedTeams) };
    this.leagueState.set(updatedLeague);
    this.persistChangedTeamsAndPlayers(l.teams, updatedLeague.teams);
  }

  private findAssignedSlotId(assignments: Record<string, string>, playerId: string): string | null {
    for (const [slotId, assignedPlayerId] of Object.entries(assignments)) {
      if (assignedPlayerId === playerId) {
        return slotId;
      }
    }

    return null;
  }

  private dressBestPlayers(teams: Team[]): Team[] {
    const userTeamId = this.leagueState()?.userTeamId;
    return teams.map(team => {
      if (team.id === userTeamId) return team; // Skip optimizing the user's team
      return this.dressTeamLineup(team);
    });
  }

  /**
   * Picks the best available formation + starters/bench for a single team.
    * Starts by resetting every player role to `RESERVE`, then assigns starters
    * and bench from the eligible (non-injured) pool.
    * Ineligible players are excluded from selection and remain `RESERVE`.
   *
   * Used by the CPU lineup refresher (`dressBestPlayers`) and by the user-team
   * "Quick Fix" entry point (`optimizeUserTeamLineup`).
   */
  private dressTeamLineup(team: Team): Team {
    const predefinedFormations = this.formationLibrary.listPredefinedFormations();
    const fallbackFormationId = this.formationLibrary.getDefaultFormationId();

    const teamPlayers = resolveTeamPlayers(team);
    if (teamPlayers.length === 0) return team;

    const players = teamPlayers.map(p => ({ ...p, role: Role.RESERVE }));
    const overallOf = (player: Player) => this.getCurrentSeasonPlayerAttributes(player).overall.value;

    // Eligibility gate: injured players are not selectable.
    const eligible = (player: Player) => isPlayerEligible(player);

    // Sort players by position + overall descending; these arrays share object refs with `players`
    const byPosition = new Map<Position, Player[]>([
      [Position.GOALKEEPER, players.filter(p => p.position === Position.GOALKEEPER && eligible(p)).sort((a, b) => overallOf(b) - overallOf(a))],
      [Position.DEFENDER, players.filter(p => p.position === Position.DEFENDER && eligible(p)).sort((a, b) => overallOf(b) - overallOf(a))],
      [Position.MIDFIELDER, players.filter(p => p.position === Position.MIDFIELDER && eligible(p)).sort((a, b) => overallOf(b) - overallOf(a))],
      [Position.FORWARD, players.filter(p => p.position === Position.FORWARD && eligible(p)).sort((a, b) => overallOf(b) - overallOf(a))],
    ]);

    // Evaluate each formation: score = sum of overalls of best-fit starters per slot
    let bestScore = -1;
    let bestFormationId = fallbackFormationId;
    let bestSlotAssignments: Record<string, string> | null = null;

    for (const formation of predefinedFormations) {
      // Group slot IDs by preferredPosition
      const slotsByPos = new Map<Position, string[]>();
      for (const slot of formation.slots) {
        const ids = slotsByPos.get(slot.preferredPosition) ?? [];
        ids.push(slot.slotId);
        slotsByPos.set(slot.preferredPosition, ids);
      }

      // Viable only if the team has enough eligible players to fill every slot in the formation
      const viable = [...slotsByPos].every(([pos, slotIds]) => (byPosition.get(pos)?.length ?? 0) >= slotIds.length);
      if (!viable) continue;

      // Score this formation and build its slot assignment map
      let score = 0;
      const slotAssignments: Record<string, string> = {};
      for (const [pos, slotIds] of slotsByPos) {
        const available = byPosition.get(pos) ?? [];
        for (let i = 0; i < slotIds.length; i++) {
          slotAssignments[slotIds[i]] = available[i].id;
          score += overallOf(available[i]);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestFormationId = formation.id;
        bestSlotAssignments = slotAssignments;
      }
    }

    // Build final formationAssignments, falling back to hardcoded 4-4-2 heuristic
    let formationAssignments: Record<string, string>;
    if (bestSlotAssignments) {
      formationAssignments = bestSlotAssignments;
    } else {
      const gks = byPosition.get(Position.GOALKEEPER) ?? [];
      const defs = byPosition.get(Position.DEFENDER) ?? [];
      const mids = byPosition.get(Position.MIDFIELDER) ?? [];
      const fwds = byPosition.get(Position.FORWARD) ?? [];

      formationAssignments = {
        gk_1: gks[0]?.id ?? '',
        def_l: defs[0]?.id ?? '',
        def_lc: defs[1]?.id ?? '',
        def_rc: defs[2]?.id ?? '',
        def_r: defs[3]?.id ?? '',
        mid_l: mids[0]?.id ?? '',
        mid_lc: mids[1]?.id ?? '',
        mid_rc: mids[2]?.id ?? '',
        mid_r: mids[3]?.id ?? '',
        att_l: fwds[0]?.id ?? '',
        att_r: fwds[1]?.id ?? '',
      };
    }

    // Mark starters (mutates shared object refs, updating `players` in place)
    const starterIds = new Set(Object.values(formationAssignments).filter(id => id !== ''));
    for (const player of players) {
      if (starterIds.has(player.id)) player.role = Role.STARTER;
    }

    // Mark bench: next best available players per position not already starting
    const benchGks = (byPosition.get(Position.GOALKEEPER) ?? []).filter(p => !starterIds.has(p.id));
    const benchDefs = (byPosition.get(Position.DEFENDER) ?? []).filter(p => !starterIds.has(p.id));
    const benchMids = (byPosition.get(Position.MIDFIELDER) ?? []).filter(p => !starterIds.has(p.id));
    const benchFwds = (byPosition.get(Position.FORWARD) ?? []).filter(p => !starterIds.has(p.id));

    if (benchGks.length > 0) benchGks[0].role = Role.BENCH;
    for (let i = 0; i < Math.min(2, benchDefs.length); i++) benchDefs[i].role = Role.BENCH;
    for (let i = 0; i < Math.min(4, benchMids.length); i++) benchMids[i].role = Role.BENCH;
    for (let i = 0; i < Math.min(2, benchFwds.length); i++) benchFwds[i].role = Role.BENCH;

    // Backfill: if any of the 9 bench spots are still open (e.g. due to positional
    // injuries leaving one position pool empty), promote the best remaining eligible
    // non-starters regardless of position until the bench is full.
    const MAX_BENCH_SIZE = 9;
    const benchedIds = new Set(players.filter(p => p.role === Role.BENCH).map(p => p.id));
    const openSpots = MAX_BENCH_SIZE - benchedIds.size;
    if (openSpots > 0) {
      const remainingEligible = players
        .filter(p => !starterIds.has(p.id) && !benchedIds.has(p.id) && eligible(p))
        .sort((a, b) => overallOf(b) - overallOf(a));
      for (let i = 0; i < Math.min(openSpots, remainingEligible.length); i++) {
        remainingEligible[i].role = Role.BENCH;
      }
    }

    return this.withSyncedPlayerIds({ ...team, selectedFormationId: bestFormationId, players, formationAssignments });
  }

  /**
   * Re-runs the lineup optimizer on the user's team. Use this as a "Quick Fix"
   * action when the user team's lineup contains injured players or has open
   * slots after a multi-week injury.
   */
  optimizeUserTeamLineup(): boolean {
    if (!this.canMutateLeagueState()) return false;
    const league = this.leagueState();
    if (!league?.userTeamId) return false;

    const userTeam = league.teams.find(team => team.id === league.userTeamId);
    if (!userTeam) return false;

    const optimized = this.dressTeamLineup(userTeam);
    const updatedTeams = league.teams.map(team => team.id === userTeam.id ? optimized : team);
    const updatedLeague: League = { ...league, teams: updatedTeams };
    this.leagueState.set(updatedLeague);
    this.persistChangedTeamsAndPlayers(league.teams, updatedTeams);
    return true;
  }

  /**
   * Returns a list of human-readable readiness issues blocking this team from
   * playing a match. Empty array means the team is ready.
   *
   * Issues currently checked:
   * - Any player marked as STARTER/BENCH/SUBSTITUTED_OUT/DISMISSED who is
   *   currently injured (data-integrity case).
   * - formationAssignments references an injured or missing player.
   */
  getMatchReadinessIssues(teamId: string): string[] {
    return this.getMatchReadiness(teamId).issues.map(issue => issue.message);
  }

  private areFormationAssignmentsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every(key => left[key] === right[key]);
  }

  private arePlayerRolesEqual(currentTeam: Team, nextTeam: Team): boolean {
    const currentPlayers = resolveTeamPlayers(currentTeam);
    const nextPlayers = resolveTeamPlayers(nextTeam);

    if (currentPlayers.length !== nextPlayers.length) {
      return false;
    }

    const currentRoleById = new Map(currentPlayers.map(player => [player.id, player.role]));
    return nextPlayers.every(player => currentRoleById.get(player.id) === player.role);
  }

  private persistRefreshedComputerControlledLineups(league: League): League {
    const dressedTeams = this.dressBestPlayers(league.teams);

    const mergedTeams = league.teams.map((team, index) => {
      const nextTeam = dressedTeams[index];
      const isUnchanged = this.arePlayerRolesEqual(team, nextTeam)
        && this.areFormationAssignmentsEqual(team.formationAssignments, nextTeam.formationAssignments);

      return isUnchanged ? team : nextTeam;
    });

    const hasChanges = mergedTeams.some((team, index) => team !== league.teams[index]);
    if (!hasChanges) {
      return league;
    }

    const updatedLeague: League = {
      ...league,
      teams: mergedTeams
    };

    this.leagueState.set(updatedLeague);
    this.persistChangedTeamsAndPlayers(league.teams, mergedTeams);
    return updatedLeague;
  }

  public calculateTeamOverall(team: Team): number {
    let startersCount = 0;
    let sum = 0;
    const players = resolveTeamPlayers(team);

    for (const player of players) {
      if (player.role === Role.STARTER) {
        sum += this.getCurrentSeasonPlayerAttributes(player).overall.value;
        startersCount++;
      }
    }

    if (startersCount === 0) return 50;
    return Math.round(sum / startersCount);
  }

  public getTeamOverall(teamId: string): number {
    const team = this.getTeam(teamId);
    if (!team) return 0;
    return this.calculateTeamOverall(team);
  }

  public getMatchProbabilities(homeTeamId: string, awayTeamId: string): { home: number; draw: number; away: number } {
    const homeOverall = this.getTeamOverall(homeTeamId);
    const awayOverall = this.getTeamOverall(awayTeamId);

    if (homeOverall === 0 && awayOverall === 0) {
      return { home: 0, draw: 0, away: 0 };
    }

    const homeAdvantage = 5;
    const homeChance = homeOverall + homeAdvantage;
    const awayChance = awayOverall;
    const totalChance = homeChance + awayChance;

    const homeWinProb = Math.round((homeChance / totalChance) * 100);
    const awayWinProb = Math.round((awayChance / totalChance) * 100);

    const diff = Math.abs(homeChance - awayChance);
    const drawProb = Math.max(5, 30 - diff);

    const adjustedHome = Math.round((homeWinProb * (100 - drawProb)) / 100);
    const adjustedAway = Math.round((awayWinProb * (100 - drawProb)) / 100);
    const finalDraw = 100 - adjustedHome - adjustedAway;

    return { home: adjustedHome, draw: finalDraw, away: adjustedAway };
  }

  /**
   * Gets the current season's stats entry for a player.
   * Returns the stats object, or null if no current season stats exist.
   */
  getCurrentSeasonStats(player: Player): PlayerCareerStats | null {
    const currentSeasonYear = this.getCurrentLeagueSeasonYear();
    return player.careerStats.find(stats => stats.seasonYear === currentSeasonYear) || null;
  }

  /**
   * Gets all available seasons for a player.
   */
  getAvailableSeasons(player: Player): number[] {
    return [...new Set(player.careerStats.map(stats => stats.seasonYear))].sort((a, b) => a - b);
  }

  /**
   * Gets stats for a specific season year.
   */
  getSeasonStats(player: Player, seasonYear: number): PlayerCareerStats | null {
    return player.careerStats.find(stats => stats.seasonYear === seasonYear) || null;
  }

  /**
   * Gets aggregated career stats across all seasons.
   */
  getAggregatedCareerStats(player: Player): CareerStatsAggregate {
    const aggregated: CareerStatsAggregate = {
      seasonYear: 'Career',
      teamId: player.teamId,
      matchesPlayed: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      shots: 0,
      shotsOnTarget: 0,
      tackles: 0,
      interceptions: 0,
      passes: 0,
      saves: 0,
      cleanSheets: 0,
      minutesPlayed: 0,
      fouls: 0,
      foulsSuffered: 0,
      totalMatchRating: 0,
      starNominations: { first: 0, second: 0, third: 0 }
    };

    player.careerStats.forEach(season => {
      aggregated.matchesPlayed += season.matchesPlayed;
      aggregated.goals += season.goals;
      aggregated.assists += season.assists;
      aggregated.yellowCards += season.yellowCards;
      aggregated.redCards += season.redCards;
      aggregated.shots += season.shots;
      aggregated.shotsOnTarget += season.shotsOnTarget;
      aggregated.tackles += season.tackles;
      aggregated.interceptions += season.interceptions;
      aggregated.passes += season.passes;
      aggregated.saves += season.saves;
      aggregated.cleanSheets += season.cleanSheets;
      aggregated.minutesPlayed += season.minutesPlayed;
      aggregated.fouls += (season.fouls ?? 0);
      aggregated.foulsSuffered += (season.foulsSuffered ?? 0);
      aggregated.totalMatchRating += season.totalMatchRating;
      aggregated.starNominations.first += season.starNominations.first;
      aggregated.starNominations.second += season.starNominations.second;
      aggregated.starNominations.third += season.starNominations.third;
    });

    return aggregated;
  }

  // Enhanced simulation methods
  private matchSimulationVariantBService = inject(MatchSimulationVariantBService);
  private commentaryService = inject(CommentaryService);
  private statisticsService = inject(StatisticsService);
  private postMatchAnalysisService = inject(PostMatchAnalysisService);
  private fieldService = inject(FieldService);

  simulateMatchWithDetails(
    match: Match,
    homeTeam: Team,
    awayTeam: Team,
    config?: Partial<SimulationConfig>,
    options?: { bypassWeekSimulationLock?: boolean; bypassSingleMatchSimulationLock?: boolean; skipLineupRefresh?: boolean }
  ): SimulateMatchWithDetailsResult | null {
    if (!this.canMutateLeagueState()) {
      return null;
    }

    if (this.isSimulatingWeekState() && !options?.bypassWeekSimulationLock) {
      return null;
    }

    if (this.isSimulatingSingleMatch() && !options?.bypassSingleMatchSimulationLock) {
      return null;
    }

    if (!options?.skipLineupRefresh) {
      const refreshedLeague = this.leagueState();
      if (refreshedLeague) {
        this.persistRefreshedComputerControlledLineups(refreshedLeague);
      }
    }

    const currentLeague = this.leagueState();
    const preparedHomeTeam = currentLeague?.teams.find(team => team.id === match.homeTeamId) ?? homeTeam;
    const preparedAwayTeam = currentLeague?.teams.find(team => team.id === match.awayTeamId) ?? awayTeam;

    // Merge caller-supplied overrides on top of the simulation defaults.
    const simConfig: SimulationConfig = {
      enablePlayByPlay: true,
      enableSpatialTracking: true,
      enableTactics: true,
      enableFatigue: true,
      commentaryStyle: CommentaryStyle.DETAILED,
      simulationVariant: 'B',
      ...config
    };

    const matchState = this.matchSimulationVariantBService.simulateMatch(match, preparedHomeTeam, preparedAwayTeam, simConfig);
    const endedByForfeit = (this.matchSimulationVariantBService as unknown as {
      didLastSimulationEndByForfeit?: () => boolean;
    }).didLastSimulationEndByForfeit?.() ?? false;

    // Generate statistics
    const matchStats = this.statisticsService.generateMatchStatistics(matchState, preparedHomeTeam, preparedAwayTeam);

    // Generate post-match analysis
    const matchReport = this.postMatchAnalysisService.generateMatchReport(matchState, preparedHomeTeam, preparedAwayTeam);

    // Extract key events from match state
    const keyEvents = this.extractKeyEvents(matchState.events);

    // Update league state with results
    this.updateLeagueWithMatchResult(match, matchState, preparedHomeTeam, preparedAwayTeam, keyEvents, matchStats, matchReport, endedByForfeit);

    return {
      matchState,
      matchStats,
      matchReport,
      keyEvents,
      commentary: simConfig.skipCommentary ? [] : this.generateMatchCommentary(matchState, preparedHomeTeam, preparedAwayTeam, simConfig.commentaryStyle === CommentaryStyle.STATS_ONLY ? CommentaryStyle.DETAILED : simConfig.commentaryStyle)
    };
  }

  private updateLeagueWithMatchResult(
    match: Match,
    matchState: MatchState,
    homeTeam: Team,
    awayTeam: Team,
    keyEvents: MatchEvent[],
    matchStats: MatchStatistics,
    matchReport: MatchReport,
    skipPlayerCareerStats = false
  ) {
    const l = this.leagueState();
    if (!l) return;

    // Update match in schedule
    const updatedSchedule = l.schedule.map(m =>
      m.id === match.id
        ? {
          ...m,
          seasonYear: m.seasonYear ?? l.currentSeasonYear,
          homeScore: matchState.homeScore,
          awayScore: matchState.awayScore,
          played: true,
          keyEvents,
          matchStats,
          matchReport
        }
        : m
    );

    const currentSeasonYear = l.currentSeasonYear;

    // Update team stats
    const updatedTeams = l.teams.map(team => {
      if (team.id === homeTeam.id) {
        const snapshot = this.getTeamSnapshotForSeason(team, currentSeasonYear);
        const nextStats = {
          ...snapshot.stats,
          played: snapshot.stats.played + 1,
          goalsFor: snapshot.stats.goalsFor + matchState.homeScore,
          goalsAgainst: snapshot.stats.goalsAgainst + matchState.awayScore,
          won: snapshot.stats.won + (matchState.homeScore > matchState.awayScore ? 1 : 0),
          drawn: snapshot.stats.drawn + (matchState.homeScore === matchState.awayScore ? 1 : 0),
          lost: snapshot.stats.lost + (matchState.homeScore < matchState.awayScore ? 1 : 0),
          points: snapshot.stats.points + this.getPoints(matchState.homeScore, matchState.awayScore, true),
          last5: this.updateLast5Array(snapshot.stats.last5, this.buildRecentMatchResult(matchState.homeScore, matchState.awayScore, true, awayTeam.name))
        };

        return {
          ...team,
          stats: nextStats,
          seasonSnapshots: withSortedUniqueSeasons([
            ...(team.seasonSnapshots ?? []).filter(existing => existing.seasonYear !== currentSeasonYear),
            {
              seasonYear: currentSeasonYear,
              playerIds: [...snapshot.playerIds],
              stats: nextStats
            }
          ])
        };
      } else if (team.id === awayTeam.id) {
        const snapshot = this.getTeamSnapshotForSeason(team, currentSeasonYear);
        const nextStats = {
          ...snapshot.stats,
          played: snapshot.stats.played + 1,
          goalsFor: snapshot.stats.goalsFor + matchState.awayScore,
          goalsAgainst: snapshot.stats.goalsAgainst + matchState.homeScore,
          won: snapshot.stats.won + (matchState.awayScore > matchState.homeScore ? 1 : 0),
          drawn: snapshot.stats.drawn + (matchState.awayScore === matchState.homeScore ? 1 : 0),
          lost: snapshot.stats.lost + (matchState.awayScore < matchState.homeScore ? 1 : 0),
          points: snapshot.stats.points + this.getPoints(matchState.homeScore, matchState.awayScore, false),
          last5: this.updateLast5Array(snapshot.stats.last5, this.buildRecentMatchResult(matchState.homeScore, matchState.awayScore, false, homeTeam.name))
        };

        return {
          ...team,
          stats: nextStats,
          seasonSnapshots: withSortedUniqueSeasons([
            ...(team.seasonSnapshots ?? []).filter(existing => existing.seasonYear !== currentSeasonYear),
            {
              seasonYear: currentSeasonYear,
              playerIds: [...snapshot.playerIds],
              stats: nextStats
            }
          ])
        };
      }
      return team;
    });

    if (!skipPlayerCareerStats) {
      this.updatePlayerCareerStats(matchState, homeTeam, awayTeam, matchReport.homePlayerStats, matchReport.awayPlayerStats);
    }

    // Persist injuries sustained during the match onto the team rosters.
    const teamsWithInjuries = this.applyPostMatchInjuries(updatedTeams, matchState, l.currentSeasonYear, l.currentWeek);

    const finalizedTeams = this.dressBestPlayers(teamsWithInjuries);

    // Persist updated league state. Week progression is managed externally
    // (e.g., by the schedule component) to avoid double-incrementing.
    const updatedLeague: League = {
      ...l,
      teams: finalizedTeams,
      schedule: updatedSchedule
    };

    this.leagueState.set(updatedLeague);
    const updatedMatch = updatedSchedule.find(scheduledMatch => scheduledMatch.id === match.id);
    const changedTeams = updatedLeague.teams.filter(team => {
      if (team.id !== homeTeam.id && team.id !== awayTeam.id) {
        return false;
      }

      return l.teams.find(previousTeam => previousTeam.id === team.id) !== team;
    });

    if (updatedMatch && changedTeams.length > 0 && !this.isHydrating()) {
      void this.persistenceService.saveMatchResult(updatedMatch, changedTeams, updatedLeague.currentSeasonYear);
    }
  }

  private getOrCreateCurrentSeasonStats(player: Player, teamId: string): PlayerCareerStats {
    const currentSeasonYear = this.getCurrentLeagueSeasonYear();
    let statsEntry = player.careerStats.find(stats => stats.seasonYear === currentSeasonYear);

    if (!statsEntry) {
      // Create new entry for current season using factory
      statsEntry = createEmptyPlayerCareerStats(currentSeasonYear, teamId);
      player.careerStats.push(statsEntry);
    }

    return statsEntry;
  }

  private updatePlayerCareerStats(matchState: MatchState, homeTeam: Team, awayTeam: Team, homePlayerStats: PlayerStatistics[], awayPlayerStats: PlayerStatistics[]) {
    const l = this.leagueState();
    if (!l) return;

    const { events, homeScore, awayScore } = matchState;
    const homePlayers = resolveTeamPlayers(homeTeam);
    const awayPlayers = resolveTeamPlayers(awayTeam);

    // Create a map of all players for quick lookup
    const allPlayers = new Map<string, Player>();
    [...homePlayers, ...awayPlayers].forEach(player => {
      allPlayers.set(player.id, player);
    });

    // Update player stats based on events
    events.forEach(event => {
      if (event.type === EventType.GOAL) {
        const scorer = allPlayers.get(event.playerIds[0]);
        if (scorer) {
          const stats = this.getOrCreateCurrentSeasonStats(scorer, scorer.teamId);
          stats.shots++;
          stats.shotsOnTarget++;
          stats.goals++;
        }
        return;
      }

      if (event.type === EventType.SAVE) {
        const shooter = allPlayers.get(event.playerIds[0]);
        if (shooter) {
          const stats = this.getOrCreateCurrentSeasonStats(shooter, shooter.teamId);
          stats.shots++;
          stats.shotsOnTarget++;
        }
        const keeperId = event.playerIds[1] ?? event.playerIds[0];
        const keeper = allPlayers.get(keeperId);
        if (keeper) {
          const stats = this.getOrCreateCurrentSeasonStats(keeper, keeper.teamId);
          stats.saves++;
        }
        return;
      }

      if (event.type === EventType.MISS) {
        const shooter = allPlayers.get(event.playerIds[0]);
        if (shooter) {
          const stats = this.getOrCreateCurrentSeasonStats(shooter, shooter.teamId);
          stats.shots++;
        }
        return;
      }

      const primaryPlayerId = event.playerIds[0];

      event.playerIds.forEach((playerId: string) => {
        const player = allPlayers.get(playerId);
        if (!player) return;

        const stats = this.getOrCreateCurrentSeasonStats(player, player.teamId);

        // Update career stats based on event type
        switch (event.type) {
          case EventType.TACKLE:
            if (playerId !== primaryPlayerId) return;
            if (player.position !== Position.GOALKEEPER) {
              stats.tackles++;
            }
            break;
          case EventType.INTERCEPTION:
            if (playerId !== primaryPlayerId) return;
            if (player.position !== Position.GOALKEEPER) {
              stats.interceptions++;
            }
            break;
          case EventType.PASS:
            stats.passes++;
            break;
          case EventType.FOUL:
            if (playerId === primaryPlayerId) {
              stats.fouls = (stats.fouls ?? 0) + 1;
            } else {
              stats.foulsSuffered = (stats.foulsSuffered ?? 0) + 1;
            }
            break;
          case EventType.YELLOW_CARD:
            if (playerId !== primaryPlayerId) return;
            stats.yellowCards++;
            break;
          case EventType.RED_CARD:
            if (playerId !== primaryPlayerId) return;
            stats.redCards++;
            break;
        }
      });
    });

    // Compute exact minutes played using on/off intervals.
    // Starters begin on the pitch at minute 0; players can leave via substitution, red card, or injury.
    const matchLength = 90;
    const substitutionsAndDismissals = events
      .filter(e => e.type === EventType.SUBSTITUTION || e.type === EventType.RED_CARD || e.type === EventType.INJURY)
      .sort((left, right) => left.time - right.time);
    const minutesOnPitch = new Map<string, number>();
    const activeSince = new Map<string, number | null>();

    const allTeamPlayers = [...homePlayers, ...awayPlayers];
    for (const player of allTeamPlayers) {
      if (player.role === Role.RESERVE) continue;
      minutesOnPitch.set(player.id, 0);
      activeSince.set(player.id, player.role === Role.STARTER ? 0 : null);
    }

    for (const event of substitutionsAndDismissals) {
      const minute = Math.max(0, Math.min(event.time, matchLength));

      if (event.type === EventType.SUBSTITUTION) {
        const outId = event.playerIds[0];
        const inId = event.playerIds[1];

        if (outId && activeSince.has(outId)) {
          const startedAt = activeSince.get(outId);
          if (typeof startedAt === 'number') {
            minutesOnPitch.set(outId, (minutesOnPitch.get(outId) ?? 0) + (minute - startedAt));
            activeSince.set(outId, null);
          }
        }

        if (inId && activeSince.has(inId) && activeSince.get(inId) === null) {
          activeSince.set(inId, minute);
        }
        continue;
      }

      const dismissedPlayerId = event.playerIds[0];
      if (dismissedPlayerId && activeSince.has(dismissedPlayerId)) {
        const startedAt = activeSince.get(dismissedPlayerId);
        if (typeof startedAt === 'number') {
          minutesOnPitch.set(
            dismissedPlayerId,
            (minutesOnPitch.get(dismissedPlayerId) ?? 0) + (minute - startedAt)
          );
          activeSince.set(dismissedPlayerId, null);
        }
      }
    }

    activeSince.forEach((startedAt, playerId) => {
      if (typeof startedAt !== 'number') {
        return;
      }

      minutesOnPitch.set(playerId, (minutesOnPitch.get(playerId) ?? 0) + (matchLength - startedAt));
    });

    // Update minutes played for all players who participated
    allTeamPlayers.forEach(player => {
      const minutes = minutesOnPitch.get(player.id) ?? 0;
      if (minutes > 0) {
        const stats = this.getOrCreateCurrentSeasonStats(player, player.teamId);
        stats.minutesPlayed += minutes;
      }
    });

    // Update matches played for players with any pitch time
    allTeamPlayers.forEach(player => {
      const minutes = minutesOnPitch.get(player.id) ?? 0;
      if (minutes > 0) {
        const stats = this.getOrCreateCurrentSeasonStats(player, player.teamId);
        stats.matchesPlayed++;
      }
    });

    // Update clean sheets for goalkeepers
    const homeGoalkeeper = homePlayers.find(p => p.id === homeTeam.formationAssignments['gk_1']);
    const awayGoalkeeper = awayPlayers.find(p => p.id === awayTeam.formationAssignments['gk_1']);

    if (homeGoalkeeper && awayScore === 0) {
      const stats = this.getOrCreateCurrentSeasonStats(homeGoalkeeper, homeGoalkeeper.teamId);
      stats.cleanSheets++;
    }
    if (awayGoalkeeper && homeScore === 0) {
      const stats = this.getOrCreateCurrentSeasonStats(awayGoalkeeper, awayGoalkeeper.teamId);
      stats.cleanSheets++;
    }

    // Accumulate assists and totalMatchRating from per-match player stats.
    [...homePlayerStats, ...awayPlayerStats].forEach(ps => {
      const player = [...homePlayers, ...awayPlayers].find(p => p.id === ps.playerId);
      if (!player) return;
      const stats = this.getOrCreateCurrentSeasonStats(player, player.teamId);
      stats.assists += ps.assists;
      if (ps.rating !== 0) {
        stats.totalMatchRating += ps.rating;
      }
    });

    // Determine stars and increment nomination counts.
    const winningTeamId = homeScore > awayScore
      ? homeTeam.id
      : awayScore > homeScore
        ? awayTeam.id
        : null;
    const stars = rankThreeStars(homePlayerStats, awayPlayerStats, winningTeamId, homeTeam.id, awayTeam.id);
    stars.forEach(star => {
      const player = [...homePlayers, ...awayPlayers].find(p => p.id === star.stats.playerId);
      if (!player) return;
      const stats = this.getOrCreateCurrentSeasonStats(player, player.teamId);
      if (star.rank === 1) stats.starNominations.first++;
      else if (star.rank === 2) stats.starNominations.second++;
      else stats.starNominations.third++;
    });
  }

  private extractKeyEvents(events: PlayByPlayEvent[]): MatchEvent[] {
    const keyEvents: MatchEvent[] = [];

    events.forEach(event => {
      let importance: EventImportance = EventImportance.LOW;
      let icon = '';
      let description = event.description;

      switch (event.type) {
        case EventType.GOAL:
          importance = EventImportance.HIGH;
          icon = '⚽';
          description = `Goal by ${event.playerIds.join(', ')} at ${event.time}'`;
          break;
        case EventType.RED_CARD:
          importance = EventImportance.HIGH;
          icon = '🟥';
          description = `Red card for ${event.playerIds[0]} at ${event.time}'`;
          break;
        case EventType.INJURY:
          importance = EventImportance.HIGH;
          icon = '🩹';
          description = `Injury to ${event.playerIds[0]} at ${event.time}'`;
          break;
        case EventType.YELLOW_CARD:
          importance = EventImportance.MEDIUM;
          icon = '🟨';
          description = `Yellow card for ${event.playerIds[0]} at ${event.time}'`;
          break;
        case EventType.PENALTY:
          importance = EventImportance.HIGH;
          icon = '🎯';
          description = `Penalty awarded at ${event.time}'`;
          break;
        case EventType.CORNER:
          if (event.success) {
            importance = EventImportance.MEDIUM;
            icon = '📐';
            description = `Dangerous corner at ${event.time}'`;
          }
          break;
      }

      if (importance !== EventImportance.LOW || event.type === EventType.GOAL || event.type === EventType.RED_CARD || event.type === EventType.INJURY) {
        keyEvents.push({
          id: event.id,
          type: event.type,
          description,
          playerIds: event.playerIds,
          time: event.time,
          location: event.location,
          additionalData: event.additionalData,
          icon,
          importance
        });
      }
    });

    return keyEvents.sort((a, b) => a.time - b.time);
  }

  private getPoints(homeScore: number, awayScore: number, isHome: boolean): number {
    if (isHome) {
      if (homeScore > awayScore) return 3;
      if (homeScore === awayScore) return 1;
    } else {
      if (awayScore > homeScore) return 3;
      if (awayScore === homeScore) return 1;
    }
    return 0;
  }

  private getResult(homeScore: number, awayScore: number, isHome: boolean): MatchResult {
    if (isHome) {
      if (homeScore > awayScore) return MatchResult.WIN;
      if (homeScore === awayScore) return MatchResult.DRAW;
      return MatchResult.LOSS;
    } else {
      if (awayScore > homeScore) return MatchResult.WIN;
      if (awayScore === homeScore) return MatchResult.DRAW;
      return MatchResult.LOSS;
    }
  }

  private buildRecentMatchResult(
    homeScore: number,
    awayScore: number,
    isHome: boolean,
    opponentName: string
  ): RecentMatchResult {
    return {
      result: this.getResult(homeScore, awayScore, isHome),
      opponentName,
      goalsFor: isHome ? homeScore : awayScore,
      goalsAgainst: isHome ? awayScore : homeScore,
      isHome
    };
  }

  private updateLast5Array(last5: RecentMatchResult[], entry: RecentMatchResult): RecentMatchResult[] {
    const newLast5 = [entry, ...last5];
    if (newLast5.length > 5) {
      newLast5.pop();
    }
    return newLast5;
  }

  startNewSeason(): boolean {
    if (!this.canMutateLeagueState()) return false;

    const league = this.leagueState();
    if (!league) return false;
    if (!this.isSeasonComplete()) return false;
    if (this.isSimulatingWeekState() || this.isSimulatingSingleMatch()) return false;

    const nextSeasonYear = league.currentSeasonYear + 1;

    const seededTeams = league.teams.map(team => {
      const currentSnapshot = this.getTeamSnapshotForSeason(team, league.currentSeasonYear);
      const nextSnapshot = {
        seasonYear: nextSeasonYear,
        playerIds: [...currentSnapshot.playerIds],
        stats: createEmptyTeamStats()
      };

      const seededPlayers = resolveTeamPlayers(team).map(player => {
        const seededSeasonAttributes = this.generateNextSeasonAttributes(player, nextSeasonYear);

        const hasSeededAttributes = (player.seasonAttributes ?? []).some(attributes => attributes.seasonYear === nextSeasonYear);
        const nextCareerStatsExists = player.careerStats.some(stats => stats.seasonYear === nextSeasonYear);

        return {
          ...player,
          mood: 100,
          fatigue: 100,
          seasonAttributes: hasSeededAttributes
            ? (player.seasonAttributes ?? [])
            : withSortedUniqueSeasons([...(player.seasonAttributes ?? []), seededSeasonAttributes]),
          careerStats: nextCareerStatsExists
            ? player.careerStats
            : [...player.careerStats, createEmptyPlayerCareerStats(nextSeasonYear, team.id)].sort((left, right) => left.seasonYear - right.seasonYear)
        };
      });

      return this.withSyncedPlayerIds({
        ...team,
        players: seededPlayers,
        stats: nextSnapshot.stats,
        playerIds: [...nextSnapshot.playerIds],
        seasonSnapshots: withSortedUniqueSeasons([...(team.seasonSnapshots ?? []), nextSnapshot])
      });
    });

    const nextSeasonSchedule = this.generator.generateScheduleForSeason(seededTeams, nextSeasonYear);
    const retainedSchedule = this.pruneScheduleBySeasonBuckets(
      [...league.schedule, ...nextSeasonSchedule],
      GameService.MATCH_RETENTION_CAP,
      league.currentSeasonYear
    );

    const updatedLeague: League = {
      ...league,
      teams: this.dressBestPlayers(seededTeams),
      schedule: retainedSchedule,
      currentSeasonYear: nextSeasonYear,
      currentWeek: 1
    };

    this.leagueState.set(updatedLeague);
    this.persistLeague(updatedLeague);
    return true;
  }

  public generateNextSeasonAttributes(player: Player, nextSeasonYear: number): PlayerSeasonAttributes {
    // Read from the season immediately preceding the one being generated so that
    // progressions chain correctly (season N-1 → N → N+1 …).
    // Fall back to the latest available attrs when the exact prior year is absent
    // (e.g. first rollover, or a legacy player missing intermediate entries).
    const priorYear = nextSeasonYear - 1;
    const currentAttrs =
      getPlayerSeasonAttributesForYear(player, priorYear) ??
      this.getCurrentSeasonPlayerAttributes(player);
    const newAttrs: PlayerSeasonAttributes = JSON.parse(JSON.stringify(currentAttrs));
    newAttrs.seasonYear = nextSeasonYear;

    if (!player.progression) {
      return newAttrs; // Fallback for legacy players without progression data
    }

    const currentAge = computeAge(player.personal.birthday, seasonAnchorDate(nextSeasonYear));
    const phase = derivePhase(currentAge, player);
    const headroom = Math.max(0, player.progression.potential - currentAttrs.overall.value);

    // Clamp to [0,1]: a bad professionalism roll should reduce growth, not flip it negative and act as extra decay.
    const outcomeRoll = clamp(
      gaussianRandom({
        mean: player.progression.professionalism / 100,
        variance: 1 - (player.progression.temperament / 100)
      }),
      0, 1
    );

    // Base math resolves to small decimals (0.0 to 1.0); apply a multiplier to get meaningful stat points.
    const STAT_CHANGE_MULTIPLIER = 20;

    for (const group of ['physical', 'skill', 'goalkeeping', 'mental']) {
      const growthWeight = phaseGrowthWeight(group, phase);
      const decayWeight = phaseDecayWeight(group, phase);

      for (const key of getStatKeysForCategory(group)) {
        if (Math.random() < 0.60) {
          // growthThrottle: 1.0 (full speed) when headroom >= 15, tapering to 0 at potential.
          // This lets players grow freely when they have room, slowing only near their ceiling.
          const growthThrottle = Math.min(1, headroom / 15);
          const growth = outcomeRoll * growthWeight * growthThrottle * STAT_CHANGE_MULTIPLIER;
          // Decay is governed purely by phase — no headroom adjustment needed.
          const decay = decayWeight * Math.random() * STAT_CHANGE_MULTIPLIER;
          const delta = growth - decay;

          const statKey = key as StatKey;
          if (newAttrs[statKey] && typeof newAttrs[statKey] === 'object' && 'value' in newAttrs[statKey]) {
            newAttrs[statKey].value = clamp(currentAttrs[statKey].value + Math.round(delta), 1, 100);
          }
        }
      }
    }

    newAttrs.overall.value = calculateOverall(newAttrs, player.position);
    return newAttrs;
  }

  private pruneScheduleBySeasonBuckets(schedule: Match[], cap: number, fallbackSeasonYear: number): Match[] {
    if (schedule.length <= cap) {
      return schedule;
    }

    const countsBySeason = new Map<number, number>();
    schedule.forEach(match => {
      const seasonYear = match.seasonYear ?? fallbackSeasonYear;
      countsBySeason.set(seasonYear, (countsBySeason.get(seasonYear) ?? 0) + 1);
    });

    const orderedSeasonYears = [...countsBySeason.keys()].sort((left, right) => left - right);
    const prunedSeasonYears = new Set<number>();
    let remaining = schedule.length;

    for (const seasonYear of orderedSeasonYears) {
      if (remaining <= cap) {
        break;
      }

      remaining -= countsBySeason.get(seasonYear) ?? 0;
      prunedSeasonYears.add(seasonYear);
    }

    return schedule.filter(match => !prunedSeasonYears.has(match.seasonYear ?? fallbackSeasonYear));
  }

  private generateMatchCommentary(matchState: MatchState, homeTeam: Team, awayTeam: Team, style: CommentaryStyle | undefined): string[] {
    const commentary: string[] = [];
    const homePlayers = resolveTeamPlayers(homeTeam);
    const awayPlayers = resolveTeamPlayers(awayTeam);

    // Starting XI
    commentary.push(...this.commentaryService.generateStartingXICommentary(homeTeam, awayTeam, {
      homePlayers,
      awayPlayers
    }));

    // Key events
    matchState.events.forEach((event: PlayByPlayEvent) => {
      const eventCommentary = this.commentaryService.generateEventCommentary(
        event,
        homeTeam,
        awayTeam,
        style || CommentaryStyle.DETAILED,
        {
          homePlayers,
          awayPlayers
        }
      );
      commentary.push(`${event.time}': ${eventCommentary}`);
    });

    // Half-time
    commentary.push(this.commentaryService.generateHalfTimeCommentary(matchState.homeScore, matchState.awayScore, matchState.events));

    // Full-time
    commentary.push(this.commentaryService.generateFullTimeCommentary(matchState.homeScore, matchState.awayScore, matchState.events));

    return commentary;
  }

  getTeamForm(teamId: string): RecentMatchResult[] {
    const l = this.leagueState();
    if (!l) return [];

    const team = l.teams.find(t => t.id === teamId);
    if (!team) return [];
    return this.getTeamSnapshotForSeason(team, l.currentSeasonYear).stats.last5;
  }

  getTeamStatistics(teamId: string) {
    const l = this.leagueState();
    if (!l) return null;

    const team = l.teams.find(t => t.id === teamId);
    if (!team) return null;

    // Get all matches involving this team that have been played
    const playedMatches = l.schedule.filter(m => (m.homeTeamId === teamId || m.awayTeamId === teamId) && m.played);

    // Calculate advanced statistics
    const totalMatches = playedMatches.length;
    const wins = playedMatches.filter(m =>
      (m.homeTeamId === teamId && m.homeScore! > m.awayScore!) ||
      (m.awayTeamId === teamId && m.awayScore! > m.homeScore!)
    ).length;

    const draws = playedMatches.filter(m => m.homeScore === m.awayScore).length;
    const losses = totalMatches - wins - draws;

    const goalsFor = playedMatches.reduce((sum, m) =>
      sum + (m.homeTeamId === teamId ? m.homeScore! : m.awayScore!), 0
    );

    const goalsAgainst = playedMatches.reduce((sum, m) =>
      sum + (m.homeTeamId === teamId ? m.awayScore! : m.homeScore!), 0
    );

    return {
      team,
      matchesPlayed: totalMatches,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      points: wins * 3 + draws,
      winRate: totalMatches > 0 ? (wins / totalMatches) * 100 : 0
    };
  }
}
