import { Injectable, signal, computed, inject, isDevMode } from '@angular/core';
import { League, Match, Team, Player, PlayerCareerStats, PlayerSeasonAttributes, Role, MatchEvent, MatchStatistics, MatchReport, PlayerStatistics, RecentMatchResult, StatKey, SeasonTransitionLog, SeasonTransitionEvent, TeamLineupSnapshot, TransferWindowPhase, TransferOffer } from '../models/types';
import { TransferService, SUMMER_WINDOW_START, SUMMER_WINDOW_END, WINTER_WINDOW_START, WINTER_WINDOW_END } from './transfer.service';
import { NormalizedDbService } from './normalized-db.service';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';
import { rankThreeStars } from '../models/match-stars';
import { computeAge, seasonAnchorDate } from '../models/player-age';
import { gaussianRandom, clamp, lerp } from '../utils/math';
import { derivePhase, phaseGrowthWeight, phaseDecayWeight, getStatKeysForCategory, calculateOverall, calculatePlayerWageCost, calculateMarketValue, calculateSquadTotalWageCost } from '../models/player-progression';
import { Phase } from '../models/enums';
import { GeneratorService } from './generator.service';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { CommentaryService } from './commentary.service';
import { StatisticsService } from './statistics.service';
import { PostMatchAnalysisService } from './post.match.analysis.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { PersistenceService } from './persistence.service';
import { DataSchemaVersionService } from './data-schema-version.service';
import { RngService } from './rng.service';
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
import { SimulationConfig, MatchState, PlayByPlayEvent, calculateFatigueModifier, scaleOverallWithFatigue } from '../models/simulation.types';
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

  public static readonly ASKING_PRICE_MULTIPLIER = 1.15;
  private static readonly CPU_TRANSFER_MAX_BUYS_SUMMER = 2;
  private static readonly CPU_TRANSFER_MAX_BUYS_WINTER = 1;
  private static readonly CPU_TRANSFER_WEEKLY_ACTIVITY_CHANCE = 0.40;
  private static readonly CPU_TRANSFER_MIN_ROSTER_SIZE = 15;

  private leagueState = signal<League | null>(null);
  private hydrationPromise: Promise<void> | null = null;
  private isHydrating = signal(true);
  private isSimulatingWeekState = signal(false);
  private singleMatchSimulationSessionCount = signal(0);
  private weekSimulationUnlockTimer: ReturnType<typeof setTimeout> | null = null;
  private seasonTransitionLogState = signal<SeasonTransitionLog | null>(null);
  public seasonTransitionLog = this.seasonTransitionLogState.asReadonly();

  public league = this.leagueState.asReadonly();
  private transferService = inject(TransferService);
  public transferWindowPhase = computed<TransferWindowPhase>(() => {
    const l = this.leagueState();
    return l ? this.transferService.getTransferWindowPhase(l.currentWeek) : 'closed';
  });
  public weeksRemainingInWindow = computed<number>(() => {
    const l = this.leagueState();
    return l ? this.transferService.getWeeksRemainingInWindow(l.currentWeek) : 0;
  });

  public unreadSeasonTransitionLog = computed(() => {
    const log = this.seasonTransitionLogState();
    return (log && !log.isRead) ? log : null;
  });
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

  private playerByIdCache = new WeakMap<Team, Player[]>();
  private teamArrayToMapCache = new WeakMap<Team[], Map<string, Team>>();

  private playerById = computed(() => {
    const l = this.leagueState();
    return new Map((l?.teams ?? []).flatMap(team => {
      let players = this.playerByIdCache.get(team);
      if (!players) {
        players = resolveTeamPlayers(team);
        this.playerByIdCache.set(team, players);
      }
      return players.map(player => [player.id, player] as const);
    }));
  });

  private withSyncedPlayerIds(team: Team): Team {
    return normalizeTeamRoster(team);
  }

  private withSyncedPlayerIdsForTeams(teams: Team[]): Team[] {
    return teams.map(team => this.withSyncedPlayerIds(team));
  }

  private generator = inject(GeneratorService);
  private persistenceService = inject(PersistenceService);
  private normalizedDb = inject(NormalizedDbService);
  private rng = inject(RngService);
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
      const [league, log] = await Promise.all([
        this.persistenceService.loadLeague(),
        this.persistenceService.loadSeasonTransitionLog()
      ]);
      if (league) {
        this.leagueState.set({
          ...league,
          teams: this.withSyncedPlayerIdsForTeams(league.teams)
        });

        if (log && log.seasonYear === league.currentSeasonYear - 1) {
          this.seasonTransitionLogState.set(log);
        } else if (log) {
          // Stale log from an older season, discard it
          void this.persistenceService.saveSeasonTransitionLog({ ...log, isRead: true });
        }
      }
    } catch (error) {
      console.error('Failed to load league:', error);
    } finally {
      this.isHydrating.set(false);
    }
  }

  markSeasonTransitionLogRead(): void {
    const log = this.seasonTransitionLogState();
    if (log && !log.isRead) {
      const updatedLog = { ...log, isRead: true };
      this.seasonTransitionLogState.set(updatedLog);
      void this.persistenceService.saveSeasonTransitionLog(updatedLog);
    }
  }

  dismissTeamTransitionEvents(teamId: string): void {
    const log = this.seasonTransitionLogState();
    if (!log || log.dismissedTeamIds.includes(teamId)) return;
    const dismissedTeamIds = [...log.dismissedTeamIds, teamId];
    const updatedLog = { ...log, dismissedTeamIds };
    this.seasonTransitionLogState.set(updatedLog);
    void this.persistenceService.saveSeasonTransitionLog(updatedLog);
  }

  private persistLeague(league: League): void {
    if (this.isHydrating()) {
      return;
    }

    void this.persistenceService.saveLeague(league).catch(error => {
      console.error('Failed to persist league:', error);
    });
  }

  private persistLeagueMetadata(league: Pick<League, 'currentWeek' | 'currentSeasonYear' | 'userTeamId' | 'transferListings' | 'transferOffers'>): void {
    if (this.isHydrating()) {
      return;
    }

    void this.persistenceService.saveLeagueMetadata(league);
  }

  private getChangedTeams(previousTeams: Team[], nextTeams: Team[]): Team[] {
    let previousById = this.teamArrayToMapCache.get(previousTeams);
    if (!previousById) {
      previousById = new Map<string, Team>();
      for (const team of previousTeams) {
        previousById.set(team.id, team);
      }
      this.teamArrayToMapCache.set(previousTeams, previousById);
    }

    const changedTeams: Team[] = [];
    for (const team of nextTeams) {
      if (previousById.get(team.id) !== team) {
        changedTeams.push(team);
      }
    }

    return changedTeams;
  }

  private persistChangedTeamsAndPlayers(previousTeams: Team[], nextTeams: Team[]): void {
    if (this.isHydrating()) {
      return;
    }

    const changedTeams = this.getChangedTeams(previousTeams, nextTeams);

    changedTeams.forEach(team => {
      void this.persistenceService.saveTeam(team, this.getCurrentLeagueSeasonYear());
    });
  }

  private persistChangedTeams(previousTeams: Team[], nextTeams: Team[]): void {
    if (this.isHydrating()) {
      return;
    }

    const changedTeams = this.getChangedTeams(previousTeams, nextTeams);

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
      currentSeasonYear,
      transferListings: [],
      transferOffers: []
    };

    league.transferListings = this.runCpuAutoListingForLeague(league);

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

  private generateCpuOfferForPlayer(player: Player, league: League): TransferOffer | null {
    const userTeamId = league.userTeamId;
    if (!userTeamId) return null;

    const currentSeasonYear = league.currentSeasonYear;
    const playerWage = calculatePlayerWageCost(player, currentSeasonYear);
    const playerOvr = this.getCurrentSeasonPlayerAttributes(player).overall.value;
    const playerValue = calculateMarketValue(player, currentSeasonYear);

    const candidates = league.teams.filter(team => {
      if (team.id === userTeamId) return false;

      const hasBudget = team.finances.transferBudget >= playerValue * 0.9;
      const hasWageHeadroom = (team.finances.wagePointsCap - team.finances.wagePointsUsed) >= playerWage;
      if (!hasBudget || !hasWageHeadroom) return false;

      const teamPosPlayers = team.players.filter(p => p.position === player.position);
      
      const lowestOvr = teamPosPlayers.length > 0 
        ? Math.min(...teamPosPlayers.map(p => this.getCurrentSeasonPlayerAttributes(p).overall.value))
        : 0;
      const isDirectImprovement = playerOvr > lowestOvr;

      const birthday = player.personal.birthday instanceof Date ? player.personal.birthday : new Date(player.personal.birthday);
      const age = computeAge(birthday, seasonAnchorDate(currentSeasonYear));
      const isYoung = age <= 21;
      
      let isProspectImprovement = false;
      if (isYoung) {
        const avgValue = teamPosPlayers.length > 0
          ? teamPosPlayers.reduce((sum, p) => sum + calculateMarketValue(p, currentSeasonYear), 0) / teamPosPlayers.length
          : 0;
        isProspectImprovement = playerValue > avgValue;
      }

      return isDirectImprovement || isProspectImprovement;
    });

    if (candidates.length > 0) {
      const buyerTeam = candidates[Math.floor(this.rng.random() * candidates.length)];
      
      const minBid = playerValue * 0.9;
      const maxBid = playerValue * 1.15;
      const bidFee = Math.round(minBid + this.rng.random() * (maxBid - minBid));

      const offerId = 'offer_' + Math.random().toString(36).substr(2, 9);
      return {
        id: offerId,
        buyerTeamId: buyerTeam.id,
        sellerTeamId: userTeamId,
        playerId: player.id,
        fee: bidFee,
        week: league.currentWeek,
        status: 'pending'
      };
    }

    return null;
  }

  advanceWeek() {
    if (!this.canMutateLeagueState()) {
      return;
    }

    const league = this.leagueState();
    if (!league) return;

    const previousPhase = this.transferService.getTransferWindowPhase(league.currentWeek);
    const nextWeek = league.currentWeek + 1;
    const nextPhase = this.transferService.getTransferWindowPhase(nextWeek);

    let transferListings = league.transferListings ?? [];
    let transferOffers = league.transferOffers ?? [];
    const userTeamId = league.userTeamId;
    let evaluatedCpuOfferPlayerIds: string[] = [];

    if (nextPhase === 'closed') {
      if (previousPhase !== 'closed') {
        transferListings = [];
      }
      transferOffers = transferOffers.map(o => o.status === 'pending' ? { ...o, status: 'expired' as const } : o);
      evaluatedCpuOfferPlayerIds = [];
    } else {
      // Re-evaluate listings weekly when transfer window is active
      const userListings = userTeamId
        ? transferListings.filter(playerId => {
          const player = this.getPlayer(playerId);
          return player && player.teamId === userTeamId;
        })
        : [];

      const newLeagueStateForAutoListing: League = {
        ...league,
        transferListings: userListings
      };
      transferListings = this.runCpuAutoListingForLeague(newLeagueStateForAutoListing);

      // Generate CPU offers on user's listed players
      if (userTeamId) {
        const userListedPlayers = userListings
          .map(pid => this.getPlayer(pid))
          .filter((p): p is Player => p !== undefined);

        for (const player of userListedPlayers) {
          evaluatedCpuOfferPlayerIds.push(player.id);
          const offer = this.generateCpuOfferForPlayer(player, league);
          if (offer) {
            transferOffers = [...transferOffers, offer];
          }
        }
      }
    }

    const updatedLeague: League = {
      ...league,
      currentWeek: nextWeek,
      teams: this.advanceWeekForPlayers(league.teams, league.currentSeasonYear, league.currentWeek),
      transferListings,
      transferOffers,
      evaluatedCpuOfferPlayerIds
    };

    this.leagueState.set(updatedLeague);
    this.persistChangedTeamsAndPlayers(league.teams, updatedLeague.teams);
    this.persistLeagueMetadata(updatedLeague);
  }

  private runCpuAutoListingForTeam(team: Team, currentSeasonYear: number): string[] {
    const teamListings: string[] = [];
    const players = resolveTeamPlayers(team);
    const gkList: Player[] = [];
    const defList: Player[] = [];
    const midList: Player[] = [];
    const fwdList: Player[] = [];

    for (const p of players) {
      if (p.position === Position.GOALKEEPER) gkList.push(p);
      else if (p.position === Position.DEFENDER) defList.push(p);
      else if (p.position === Position.MIDFIELDER) midList.push(p);
      else if (p.position === Position.FORWARD) fwdList.push(p);
    }

    const schema = this.formationLibrary.getFormationSlots(team.selectedFormationId);
    let gkStartersCount = 0;
    let defStartersCount = 0;
    let midStartersCount = 0;
    let fwdStartersCount = 0;

    if (schema) {
      for (const slot of schema) {
        if (slot.preferredPosition === Position.GOALKEEPER) gkStartersCount++;
        else if (slot.preferredPosition === Position.DEFENDER) defStartersCount++;
        else if (slot.preferredPosition === Position.MIDFIELDER) midStartersCount++;
        else if (slot.preferredPosition === Position.FORWARD) fwdStartersCount++;
      }
    } else {
      gkStartersCount = 1;
      defStartersCount = 4;
      midStartersCount = 4;
      fwdStartersCount = 2;
    }

    const worstWageRatioIds = new Set<string>();
    const topValueIds = new Set<string>();

    const playerWageRatios = players.map(p => {
      const wage = calculatePlayerWageCost(p, currentSeasonYear);
      const overall = getCurrentPlayerSeasonAttributes(p, currentSeasonYear).overall.value;
      const ratio = wage / overall;
      return { id: p.id, ratio };
    });
    playerWageRatios.sort((a, b) => b.ratio - a.ratio);
    const worstCount = Math.ceil(players.length * 0.2);
    for (const x of playerWageRatios.slice(0, worstCount)) {
      worstWageRatioIds.add(x.id);
    }

    const playerValues = players.map(p => {
      const val = calculateMarketValue(p, currentSeasonYear);
      return { id: p.id, val };
    });
    playerValues.sort((a, b) => b.val - a.val);
    const topValueCount = Math.ceil(players.length * 0.2);
    for (const x of playerValues.slice(0, topValueCount)) {
      topValueIds.add(x.id);
    }

    const processPosition = (posPlayers: Player[], posMin: number, posStartersCount: number) => {
      if (posPlayers.length <= posMin) {
        return;
      }

      const sorted = [...posPlayers].sort((a, b) => {
        const ovrA = getCurrentPlayerSeasonAttributes(a, currentSeasonYear).overall.value;
        const ovrB = getCurrentPlayerSeasonAttributes(b, currentSeasonYear).overall.value;
        return ovrB - ovrA;
      });

      const topPlayers = sorted.slice(0, posStartersCount);
      const hasInjuryInTop = topPlayers.some(p => !isPlayerEligible(p));

      const posCandidates: { player: Player; overall: number }[] = [];

      for (let i = 0; i < sorted.length; i++) {
        const p = sorted[i];

        if (i < posMin) {
          continue;
        }

        if (hasInjuryInTop && p.role === Role.STARTER && i >= posStartersCount) {
          continue;
        }

        const age = computeAge(p.personal.birthday, seasonAnchorDate(currentSeasonYear));
        const phase = derivePhase(age, p);
        const isDeclining = phase === Phase.Decline;
        const isWageInefficient = worstWageRatioIds.has(p.id);
        const isValuableYouth = age <= 21 && topValueIds.has(p.id);

        if (isDeclining || isWageInefficient || isValuableYouth) {
          const overall = getCurrentPlayerSeasonAttributes(p, currentSeasonYear).overall.value;
          posCandidates.push({ player: p, overall });
        }
      }

      posCandidates.sort((a, b) => a.overall - b.overall);

      const limit = posPlayers.length - posMin;
      const selected = posCandidates.slice(0, limit);

      for (const item of selected) {
        teamListings.push(item.player.id);
      }
    };

    processPosition(gkList, 1, gkStartersCount);
    processPosition(defList, 3, defStartersCount);
    processPosition(midList, 3, midStartersCount);
    processPosition(fwdList, 2, fwdStartersCount);

    return teamListings;
  }

  runCpuAutoListingForLeague(league: League): string[] {
    const nextListings: string[] = [];
    const currentSeasonYear = league.currentSeasonYear;
    const userTeamId = league.userTeamId;

    if (userTeamId && league.transferListings) {
      const userListings = league.transferListings.filter(playerId => {
        const player = this.getPlayer(playerId);
        return player && player.teamId === userTeamId;
      });
      nextListings.push(...userListings);
    }

    for (const team of league.teams) {
      if (userTeamId && team.id === userTeamId) {
        continue;
      }
      nextListings.push(...this.runCpuAutoListingForTeam(team, currentSeasonYear));
    }

    return nextListings;
  }

  addPlayerToTransferList(playerId: string) {
    if (!this.canMutateLeagueState()) {
      return;
    }
    const league = this.leagueState();
    if (!league) return;

    const player = this.getPlayer(playerId);
    if (!player || player.teamId !== league.userTeamId) {
      return;
    }

    if (league.transferListings?.includes(playerId)) {
      return;
    }

    const transferListings = [...(league.transferListings ?? []), playerId];
    const evaluated = league.evaluatedCpuOfferPlayerIds ?? [];
    let transferOffers = league.transferOffers ?? [];
    let nextEvaluated = evaluated;

    if (!evaluated.includes(player.id) && this.transferWindowPhase() !== 'closed') {
      nextEvaluated = [...evaluated, player.id];
      const offer = this.generateCpuOfferForPlayer(player, league);
      if (offer) {
        transferOffers = [...transferOffers, offer];
      }
    }

    const updatedLeague: League = {
      ...league,
      transferListings,
      transferOffers,
      evaluatedCpuOfferPlayerIds: nextEvaluated
    };

    this.leagueState.set(updatedLeague);
    this.persistLeagueMetadata(updatedLeague);
  }

  removePlayerFromTransferList(playerId: string) {
    if (!this.canMutateLeagueState()) {
      return;
    }
    const league = this.leagueState();
    if (!league) return;

    if (!league.transferListings?.includes(playerId)) {
      return;
    }

    const transferListings = (league.transferListings ?? []).filter(id => id !== playerId);
    const updatedLeague: League = {
      ...league,
      transferListings
    };

    this.leagueState.set(updatedLeague);
    this.persistLeagueMetadata(updatedLeague);
  }

  calculateAskingPrice(player: Player, currentSeasonYear: number): number {
    const marketValue = calculateMarketValue(player, currentSeasonYear);
    return Math.round(marketValue * GameService.ASKING_PRICE_MULTIPLIER);
  }

  submitTransferOffer(playerId: string, fee: number): { success: boolean; message: string; offer?: TransferOffer } {
    if (!this.canMutateLeagueState()) {
      return { success: false, message: 'Actions blocked due to version mismatch.' };
    }
    const league = this.leagueState();
    if (!league || !league.userTeamId) {
      return { success: false, message: 'No active league or user team.' };
    }

    if (this.transferWindowPhase() === 'closed') {
      return { success: false, message: 'Transfer window is closed.' };
    }

    const player = this.getPlayer(playerId);
    if (!player) {
      return { success: false, message: 'Player not found.' };
    }

    const buyerId = league.userTeamId;
    const sellerId = player.teamId;

    if (buyerId === sellerId) {
      return { success: false, message: 'Cannot buy your own player.' };
    }

    const buyer = this.getTeam(buyerId);
    const seller = this.getTeam(sellerId);
    if (!buyer || !seller) {
      return { success: false, message: 'Buyer or seller team not found.' };
    }

    if (buyer.finances.transferBudget < fee) {
      return { success: false, message: 'Insufficient transfer budget.' };
    }

    const playerWage = calculatePlayerWageCost(player, league.currentSeasonYear);
    const buyerWageHeadroom = buyer.finances.wagePointsCap - buyer.finances.wagePointsUsed;
    if (buyerWageHeadroom < playerWage) {
      return { success: false, message: `Insufficient wage points headroom. Player cost is ${playerWage} pts, but you only have ${buyerWageHeadroom.toFixed(1)} pts available.` };
    }

    const askingPrice = this.calculateAskingPrice(player, league.currentSeasonYear);

    if (fee < askingPrice) {
      const offerId = 'offer_' + Math.random().toString(36).substr(2, 9);
      const newOffer: TransferOffer = {
        id: offerId,
        buyerTeamId: buyerId,
        sellerTeamId: sellerId,
        playerId: playerId,
        fee: fee,
        week: league.currentWeek,
        status: 'rejected'
      };
      
      const updatedLeague: League = {
        ...league,
        transferOffers: [...(league.transferOffers ?? []), newOffer]
      };
      this.leagueState.set(updatedLeague);
      this.persistLeagueMetadata(updatedLeague);
      
      return { success: false, message: `Offer rejected. The club requires at least $${askingPrice.toLocaleString()} for this player.`, offer: newOffer };
    }

    const sellerPlayers = seller.players ?? [];
    const playersAtPosition = sellerPlayers.filter(p => p.position === player.position);
    
    let minLimit = 1;
    if (player.position === Position.GOALKEEPER) minLimit = 1;
    else if (player.position === Position.DEFENDER) minLimit = 3;
    else if (player.position === Position.MIDFIELDER) minLimit = 3;
    else if (player.position === Position.FORWARD) minLimit = 2;

    if (playersAtPosition.length <= minLimit) {
      const offerId = 'offer_' + Math.random().toString(36).substr(2, 9);
      const newOffer: TransferOffer = {
        id: offerId,
        buyerTeamId: buyerId,
        sellerTeamId: sellerId,
        playerId: playerId,
        fee: fee,
        week: league.currentWeek,
        status: 'rejected'
      };
      
      const updatedLeague: League = {
        ...league,
        transferOffers: [...(league.transferOffers ?? []), newOffer]
      };
      this.leagueState.set(updatedLeague);
      this.persistLeagueMetadata(updatedLeague);

      return { success: false, message: 'Offer rejected. The club cannot sell this player because they do not have enough depth at this position.', offer: newOffer };
    }

    const offerId = 'offer_' + Math.random().toString(36).substr(2, 9);
    const newOffer: TransferOffer = {
      id: offerId,
      buyerTeamId: buyerId,
      sellerTeamId: sellerId,
      playerId: playerId,
      fee: fee,
      week: league.currentWeek,
      status: 'accepted'
    };

    const tempLeague: League = {
      ...league,
      transferOffers: [...(league.transferOffers ?? []), newOffer]
    };
    this.leagueState.set(tempLeague);

    this.executeTransfer(buyerId, sellerId, playerId, fee, newOffer.id);
    return { success: true, message: 'Offer accepted! Player has been transferred to your team.', offer: newOffer };
  }

  acceptOffer(offerId: string) {
    if (!this.canMutateLeagueState()) return;
    const league = this.leagueState();
    if (!league) return;

    const offer = (league.transferOffers ?? []).find(o => o.id === offerId);
    if (!offer || offer.status !== 'pending') return;

    const buyer = this.getTeam(offer.buyerTeamId);
    const seller = this.getTeam(offer.sellerTeamId);
    const player = this.getPlayer(offer.playerId);
    if (!buyer || !seller || !player) return;

    if (buyer.finances.transferBudget < offer.fee) {
      this.expireOffer(offerId);
      return;
    }

    const playerWage = calculatePlayerWageCost(player, league.currentSeasonYear);
    const buyerWageHeadroom = buyer.finances.wagePointsCap - buyer.finances.wagePointsUsed;
    if (buyerWageHeadroom < playerWage) {
      this.expireOffer(offerId);
      return;
    }

    this.executeTransfer(offer.buyerTeamId, offer.sellerTeamId, offer.playerId, offer.fee, offerId);
  }

  rejectOffer(offerId: string) {
    if (!this.canMutateLeagueState()) return;
    const league = this.leagueState();
    if (!league) return;

    const updatedOffers = (league.transferOffers ?? []).map(offer => {
      if (offer.id === offerId && offer.status === 'pending') {
        return { ...offer, status: 'rejected' as const };
      }
      return offer;
    });

    const updatedLeague = {
      ...league,
      transferOffers: updatedOffers
    };

    this.leagueState.set(updatedLeague);
    this.persistLeagueMetadata(updatedLeague);
  }

  private expireOffer(offerId: string) {
    const league = this.leagueState();
    if (!league) return;

    const updatedOffers = (league.transferOffers ?? []).map(offer => {
      if (offer.id === offerId) {
        return { ...offer, status: 'expired' as const };
      }
      return offer;
    });

    const updatedLeague = {
      ...league,
      transferOffers: updatedOffers
    };

    this.leagueState.set(updatedLeague);
    this.persistLeagueMetadata(updatedLeague);
  }

  private executeTransfer(buyerId: string, sellerId: string, playerId: string, fee: number, triggerOfferId: string) {
    const league = this.leagueState();
    if (!league) return;

    const buyer = this.getTeam(buyerId);
    const seller = this.getTeam(sellerId);
    const player = this.getPlayer(playerId);

    if (!buyer || !seller || !player) {
      throw new Error('Buyer, seller, or player not found');
    }

    const currentSeasonYear = league.currentSeasonYear;

    const updatedPlayer: Player = {
      ...player,
      teamId: buyerId,
      role: Role.BENCH,
      transferHistory: [
        ...(player.transferHistory ?? []),
        {
          sellerTeamId: sellerId,
          buyerTeamId: buyerId,
          fee: fee,
          seasonYear: currentSeasonYear,
          week: league.currentWeek
        }
      ]
    };

    const updatedBuyerPlayers = [...buyer.players, updatedPlayer];
    const updatedSellerPlayers = seller.players.filter(p => p.id !== playerId);

    const updatedSellerAssignments = { ...seller.formationAssignments };
    for (const [slotId, slotPlayerId] of Object.entries(updatedSellerAssignments)) {
      if (slotPlayerId === playerId) {
        delete updatedSellerAssignments[slotId];
      }
    }

    const buyerWithNewPlayers = {
      ...buyer,
      players: updatedBuyerPlayers,
      finances: {
        ...buyer.finances,
        transferBudget: buyer.finances.transferBudget - fee,
        wagePointsUsed: 0
      }
    };
    const sellerWithNewPlayers = {
      ...seller,
      players: updatedSellerPlayers,
      formationAssignments: updatedSellerAssignments,
      finances: {
        ...seller.finances,
        transferBudget: seller.finances.transferBudget + fee,
        wagePointsUsed: 0
      }
    };

    const normalizedBuyer = normalizeTeamRoster(buyerWithNewPlayers);
    normalizedBuyer.finances.wagePointsUsed = Math.round(calculateSquadTotalWageCost(normalizedBuyer.players, currentSeasonYear) * 100) / 100;

    const normalizedSeller = normalizeTeamRoster(sellerWithNewPlayers);
    normalizedSeller.finances.wagePointsUsed = Math.round(calculateSquadTotalWageCost(normalizedSeller.players, currentSeasonYear) * 100) / 100;

    const transferListings = (league.transferListings ?? []).filter(id => id !== playerId);

    let updatedOffers = (league.transferOffers ?? []).map(offer => {
      if (offer.id === triggerOfferId) {
        return { ...offer, status: 'accepted' as const };
      }
      if (offer.playerId === playerId && offer.status === 'pending') {
        return { ...offer, status: 'expired' as const };
      }
      return offer;
    });

    const tempTeams = league.teams.map(t => {
      if (t.id === buyerId) return normalizedBuyer;
      if (t.id === sellerId) return normalizedSeller;
      return t;
    });
    const tempTeamsMap = new Map(tempTeams.map(t => [t.id, t]));

    updatedOffers = updatedOffers.map(offer => {
      if (offer.status !== 'pending') return offer;
      
      const offerBuyer = tempTeamsMap.get(offer.buyerTeamId);
      const offerPlayer = this.getPlayer(offer.playerId);
      if (!offerBuyer || !offerPlayer) return { ...offer, status: 'expired' as const };

      const offerPlayerWage = calculatePlayerWageCost(offerPlayer, currentSeasonYear);
      const offerBuyerWageHeadroom = offerBuyer.finances.wagePointsCap - offerBuyer.finances.wagePointsUsed;

      if (offerBuyer.finances.transferBudget < offer.fee || offerBuyerWageHeadroom < offerPlayerWage) {
        return { ...offer, status: 'expired' as const };
      }

      return offer;
    });

    const updatedTeams = league.teams.map(t => {
      if (t.id === buyerId) return normalizedBuyer;
      if (t.id === sellerId) return normalizedSeller;
      return t;
    });

    const updatedLeague: League = {
      ...league,
      teams: updatedTeams,
      transferListings,
      transferOffers: updatedOffers
    };

    this.leagueState.set(updatedLeague);

    void this.normalizedDb.saveTransfer(normalizedBuyer, normalizedSeller, updatedPlayer, currentSeasonYear, {
      currentWeek: updatedLeague.currentWeek,
      currentSeasonYear: updatedLeague.currentSeasonYear,
      userTeamId: updatedLeague.userTeamId,
      transferListings: updatedLeague.transferListings,
      transferOffers: updatedLeague.transferOffers
    });
  }

  private updateListingsForTeams(buyerId: string, sellerId: string, currentSeasonYear: number) {
    const league = this.leagueState();
    if (!league) return;

    const userTeamId = league.userTeamId;
    const currentListings = league.transferListings ?? [];
    
    // Filter out any player belonging to either buyer or seller
    const listingsWithoutTeams = currentListings.filter(pid => {
      const p = this.getPlayer(pid);
      return p && p.teamId !== buyerId && p.teamId !== sellerId;
    });

    const buyerTeam = this.getTeam(buyerId);
    const sellerTeam = this.getTeam(sellerId);

    const newBuyerListings = (buyerTeam && buyerTeam.id !== userTeamId) ? this.runCpuAutoListingForTeam(buyerTeam, currentSeasonYear) : [];
    const newSellerListings = (sellerTeam && sellerTeam.id !== userTeamId) ? this.runCpuAutoListingForTeam(sellerTeam, currentSeasonYear) : [];

    const updatedLeague = {
      ...league,
      transferListings: [...listingsWithoutTeams, ...newBuyerListings, ...newSellerListings]
    };

    this.leagueState.set(updatedLeague);
    this.persistLeagueMetadata(updatedLeague);
  }

  private runCpuToCpuTransferPass() {
    const league = this.leagueState();
    if (!league) return;

    const phase = this.transferWindowPhase();
    if (phase === 'closed') return;

    const currentSeasonYear = league.currentSeasonYear;
    const userTeamId = league.userTeamId;

    // Define limits
    const maxBuys = phase === 'summer' ? GameService.CPU_TRANSFER_MAX_BUYS_SUMMER : GameService.CPU_TRANSFER_MAX_BUYS_WINTER;

    // Helper: count transactions in the current window for each CPU team
    const getTransactionCounts = () => {
      const buyCounts = new Map<string, number>();
      for (const team of league.teams) {
        buyCounts.set(team.id, 0);
      }

      const windowStart = phase === 'summer' ? SUMMER_WINDOW_START : WINTER_WINDOW_START;
      const windowEnd = phase === 'summer' ? SUMMER_WINDOW_END : WINTER_WINDOW_END;

      for (const team of league.teams) {
        for (const player of team.players) {
          if (player.transferHistory) {
            for (const record of player.transferHistory) {
              if (
                record.seasonYear === currentSeasonYear &&
                record.week >= windowStart &&
                record.week <= windowEnd
              ) {
                buyCounts.set(record.buyerTeamId, (buyCounts.get(record.buyerTeamId) ?? 0) + 1);
              }
            }
          }
        }
      }
      return buyCounts;
    };

    const buyCounts = getTransactionCounts();

    // Shuffled CPU teams
    const cpuTeams = league.teams.filter(t => t.id !== userTeamId);
    // Shuffle using this.rng.random()
    for (let i = cpuTeams.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.random() * (i + 1));
      [cpuTeams[i], cpuTeams[j]] = [cpuTeams[j], cpuTeams[i]];
    }

    // Weakness evaluation helper
    const getPositionWeakness = (team: Team, position: Position): {
      score: number;
      depth: number;
      requiredStarters: number;
      averageOverall: number;
    } => {
      const posPlayers = team.players.filter(p => p.position === position);
      const schema = this.formationLibrary.getFormationSlots(team.selectedFormationId);

      let requiredStarters = 0;
      if (schema) {
        for (const slot of schema) {
          if (slot.preferredPosition === position) {
            requiredStarters++;
          }
        }
      } else {
        if (position === Position.GOALKEEPER) requiredStarters = 1;
        else if (position === Position.DEFENDER) requiredStarters = 4;
        else if (position === Position.MIDFIELDER) requiredStarters = 4;
        else if (position === Position.FORWARD) requiredStarters = 2;
      }

      const depth = posPlayers.length;
      let depthScore = 0;

      if (depth < requiredStarters) {
        depthScore = (requiredStarters - depth) * 50;
      } else if (depth === requiredStarters) {
        depthScore = 20;
      } else if (depth === requiredStarters + 1) {
        depthScore = 5;
      }

      const sortedPosPlayers = [...posPlayers].sort((a, b) => {
        const ovrA = this.getCurrentSeasonPlayerAttributes(a).overall.value;
        const ovrB = this.getCurrentSeasonPlayerAttributes(b).overall.value;
        return ovrB - ovrA;
      });

      const topStarters = sortedPosPlayers.slice(0, requiredStarters);
      const sumOverall = topStarters.reduce(
        (sum, p) => sum + this.getCurrentSeasonPlayerAttributes(p).overall.value,
        0
      );
      const averageOverall = requiredStarters > 0 ? (topStarters.length > 0 ? sumOverall / topStarters.length : 0) : 0;

      const allPlayersSorted = [...team.players].sort((a, b) => {
        const ovrA = this.getCurrentSeasonPlayerAttributes(a).overall.value;
        const ovrB = this.getCurrentSeasonPlayerAttributes(b).overall.value;
        return ovrB - ovrA;
      });
      const top11 = allPlayersSorted.slice(0, 11);
      const sumTop11 = top11.reduce(
        (sum, p) => sum + this.getCurrentSeasonPlayerAttributes(p).overall.value,
        0
      );
      const teamTop11Average = top11.length > 0 ? sumTop11 / top11.length : 0;

      const qualityDiff = teamTop11Average - averageOverall;
      let qualityScore = 0;
      if (qualityDiff > 0) {
        qualityScore = qualityDiff * 4;
      }

      return {
        score: depthScore + qualityScore,
        depth,
        requiredStarters,
        averageOverall
      };
    };

    for (const buyerTeam of cpuTeams) {
      // 1. Weekly activity chance check
      if (this.rng.random() >= GameService.CPU_TRANSFER_WEEKLY_ACTIVITY_CHANCE) {
        continue;
      }

      // 2. Buy cap check
      const currentBuys = buyCounts.get(buyerTeam.id) ?? 0;
      if (currentBuys >= maxBuys) {
        continue;
      }

      // 3. Compute weaknesses
      const positions = [Position.GOALKEEPER, Position.DEFENDER, Position.MIDFIELDER, Position.FORWARD];
      const weaknesses = positions.map(pos => {
        const evaluation = getPositionWeakness(buyerTeam, pos);
        return { position: pos, ...evaluation };
      });

      // Sort by weakness score descending
      weaknesses.sort((a, b) => b.score - a.score);

      let transferExecutedForTeam = false;

      for (const w of weaknesses) {
        if (w.score <= 0) {
          continue; // No weakness at this position
        }

        // Fetch candidate listed players
        const listings = this.leagueState()?.transferListings ?? [];
        const candidates: Player[] = [];

        for (const pid of listings) {
          const player = this.getPlayer(pid);
          if (
            player &&
            player.position === w.position &&
            player.teamId !== buyerTeam.id &&
            player.teamId !== userTeamId &&
            isPlayerEligible(player)
          ) {
            candidates.push(player);
          }
        }

        // Filter valid candidates
        const validCandidates: { player: Player; askingPrice: number; overall: number }[] = [];

        for (const player of candidates) {
          const seller = this.getTeam(player.teamId);
          if (!seller) continue;

          // 1. Safety roster size floor
          if (seller.players.length <= GameService.CPU_TRANSFER_MIN_ROSTER_SIZE) {
            continue;
          }

          // 2. Live position depth check
          const sellerPlayersAtPosition = seller.players.filter(p => p.position === player.position);
          let minLimit = 1;
          if (player.position === Position.GOALKEEPER) minLimit = 1;
          else if (player.position === Position.DEFENDER) minLimit = 3;
          else if (player.position === Position.MIDFIELDER) minLimit = 3;
          else if (player.position === Position.FORWARD) minLimit = 2;

          if (sellerPlayersAtPosition.length <= minLimit) {
            continue;
          }

          // 3. Budget and wage headroom checks
          const askingPrice = this.calculateAskingPrice(player, currentSeasonYear);
          if (buyerTeam.finances.transferBudget < askingPrice) {
            continue;
          }

          const playerWage = calculatePlayerWageCost(player, currentSeasonYear);
          const buyerWageHeadroom = buyerTeam.finances.wagePointsCap - buyerTeam.finances.wagePointsUsed;
          if (buyerWageHeadroom < playerWage) {
            continue;
          }

          // 4. Quality checks
          const playerOvr = this.getCurrentSeasonPlayerAttributes(player).overall.value;
          const playerValue = calculateMarketValue(player, currentSeasonYear);
          
          // OVR floor: lowest OVR player at position
          const buyerPosPlayers = buyerTeam.players.filter(p => p.position === player.position);
          const lowestOvr = buyerPosPlayers.length > 0
            ? Math.min(...buyerPosPlayers.map(p => this.getCurrentSeasonPlayerAttributes(p).overall.value))
            : 0;

          // Average market value for prospect checking
          const avgValue = buyerPosPlayers.length > 0
            ? buyerPosPlayers.reduce((sum, p) => sum + calculateMarketValue(p, currentSeasonYear), 0) / buyerPosPlayers.length
            : 0;

          const birthday = player.personal.birthday instanceof Date ? player.personal.birthday : new Date(player.personal.birthday);
          const age = computeAge(birthday, seasonAnchorDate(currentSeasonYear));
          
          const isDepthNecessity = w.depth < w.requiredStarters;
          const isDirectQualityImprovement = playerOvr > lowestOvr;
          const isProspectImprovement = (age <= 21) && (playerValue > avgValue);

          if (isDepthNecessity || isDirectQualityImprovement || isProspectImprovement) {
            validCandidates.push({ player, askingPrice, overall: playerOvr });
          }
        }

        if (validCandidates.length > 0) {
          // Sort valid candidates by overall rating descending
          validCandidates.sort((a, b) => b.overall - a.overall);
          const selectedCandidate = validCandidates[0];

          const offerId = 'offer_' + Math.random().toString(36).substr(2, 9);
          const newOffer: TransferOffer = {
            id: offerId,
            buyerTeamId: buyerTeam.id,
            sellerTeamId: selectedCandidate.player.teamId,
            playerId: selectedCandidate.player.id,
            fee: selectedCandidate.askingPrice,
            week: league.currentWeek,
            status: 'accepted'
          };

          // Re-fetch current state to ensure thread-safety with signals
          const freshLeague = this.leagueState()!;
          const tempLeague: League = {
            ...freshLeague,
            transferOffers: [...(freshLeague.transferOffers ?? []), newOffer]
          };
          this.leagueState.set(tempLeague);

          this.executeTransfer(
            buyerTeam.id,
            selectedCandidate.player.teamId,
            selectedCandidate.player.id,
            selectedCandidate.askingPrice,
            newOffer.id
          );

          // Update listings for buyer and seller teams
          this.updateListingsForTeams(buyerTeam.id, selectedCandidate.player.teamId, currentSeasonYear);

          // Increment buy count in map
          buyCounts.set(buyerTeam.id, currentBuys + 1);

          transferExecutedForTeam = true;
          break; // Move to the next buyer team
        }
      }

      if (transferExecutedForTeam) {
        // Break out of weaknesses, already did a transfer
      }
    }
  }

  /**
   * Performs weekly state updates for all players in the league.
   * 1. Fatigue Recovery: Recovers fatigue based on the player's 'fitness' attribute (Base 15 + 0.25 * fitness).
   * 2. Injury Progression: Decrements `weeksRemaining` on every player's active injury once the player
   *    has completed at least one full future match week on the sideline.
   *    Resolved injuries (weeksRemaining hits 0) remain in `player.injuries` as historical records.
   */
  private advanceWeekForPlayers(teams: Team[], currentSeasonYear: number, currentWeek: number): Team[] {
    return teams.map(team => this.advanceWeekForTeam(team, currentSeasonYear, currentWeek));
  }

  private advanceWeekForTeam(team: Team, currentSeasonYear: number, currentWeek: number): Team {
    if (!team.players) return team;
    let teamMutated = false;
    const players = team.players.map(player => {
      const updatedPlayer = this.advanceWeekForPlayer(player, currentSeasonYear, currentWeek);
      if (updatedPlayer !== player) {
        teamMutated = true;
      }
      return updatedPlayer;
    });
    return teamMutated ? { ...team, players } : team;
  }

  private advanceWeekForPlayer(player: Player, currentSeasonYear: number, currentWeek: number): Player {
    let playerMutated = false;

    let nextFatigue = player.fatigue ?? 0;
    if (nextFatigue > 0) {
      const fitness = this.getCurrentSeasonPlayerAttributes(player).fitness.value;
      const recovery = 15 + (fitness * 0.25);
      nextFatigue = Math.max(0, Math.round(nextFatigue - recovery));
      if (nextFatigue !== (player.fatigue ?? 0)) {
        playerMutated = true;
      }
    }

    let updatedInjuries = player.injuries;
    if (player.injuries && player.injuries.length > 0) {
      updatedInjuries = player.injuries.map(record => {
        if (record.weeksRemaining <= 0) return record;
        if (record.sustainedInSeason === currentSeasonYear && record.sustainedInWeek >= currentWeek) {
          return record;
        }

        playerMutated = true;
        return { ...record, weeksRemaining: record.weeksRemaining - 1 };
      });
    }

    if (!playerMutated) {
      return player;
    }
    return { ...player, injuries: updatedInjuries, fatigue: nextFatigue };
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

  private applyPostMatchFatigue(teams: Team[], matchState: MatchState): Team[] {
    if (!matchState.fatigueTimeline || matchState.fatigueTimeline.length === 0) return teams;
    const finalFatigueSnapshot = matchState.fatigueTimeline[matchState.fatigueTimeline.length - 1];
    if (!finalFatigueSnapshot) return teams;

    const fatigueByPlayerId = new Map<string, number>();
    for (const p of finalFatigueSnapshot.players) {
      fatigueByPlayerId.set(p.playerId, p.fatigue);
    }

    if (fatigueByPlayerId.size === 0) return teams;

    return teams.map(team => {
      if (!team.players) return team;
      let teamMutated = false;
      const players = team.players.map(player => {
        const nextFatigue = fatigueByPlayerId.get(player.id);
        if (nextFatigue === undefined || nextFatigue === player.fatigue) return player;
        teamMutated = true;
        return { ...player, fatigue: nextFatigue };
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
        this.runCpuToCpuTransferPass();

        const league = this.leagueState()!;
        const matches = league.schedule.filter(
          m => m.week === league.currentWeek && m.seasonYear === league.currentSeasonYear && !m.played
        );

        matches.forEach(match => {
          const homeTeam = this.teamById().get(match.homeTeamId);
          const awayTeam = this.teamById().get(match.awayTeamId);
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
      this.runCpuToCpuTransferPass();

      const freshLeague = this.leagueState()!;
      const matches = freshLeague.schedule.filter(m => m.week === freshLeague.currentWeek && m.seasonYear === freshLeague.currentSeasonYear);

      matches.forEach(match => {
        if (match.played) return;

        const homeTeam = this.teamById().get(match.homeTeamId);
        const awayTeam = this.teamById().get(match.awayTeamId);

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
      const transferListings = (l.transferListings ?? []).filter(playerId => {
        const player = this.getPlayer(playerId);
        return player && player.teamId !== teamId;
      });

      const updatedLeague: League = { ...l, userTeamId: teamId, transferListings };
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

    let updatedTeam: typeof l.teams[0] | null = null;
    let teamIndex = -1;

    for (let i = 0; i < l.teams.length; i++) {
      const team = l.teams[i];
      if (team.playerIds.includes(playerId)) {
        teamIndex = i;
        const teamPlayers = resolveTeamPlayers(team);
        const playerIndex = teamPlayers.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
          if (!this.canAssignPlayerToRole(teamPlayers[playerIndex], newRole)) {
            return;
          }
          const updatedPlayers = [...teamPlayers];
          updatedPlayers[playerIndex] = { ...updatedPlayers[playerIndex], role: newRole };
          updatedTeam = this.withSyncedPlayerIds({ ...team, players: updatedPlayers });
        }
        break;
      }
    }

    if (!updatedTeam) return;

    const updatedTeams = [...l.teams];
    updatedTeams[teamIndex] = updatedTeam;

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

    const teamIndex = l.teams.findIndex(t => t.id === teamId);
    if (teamIndex === -1) return;

    const team = l.teams[teamIndex];
    const teamPlayers = resolveTeamPlayers(team);
    const playerIndex = teamPlayers.findIndex(p => p.id === playerId);

    if (playerIndex === -1) return;
    const player = teamPlayers[playerIndex];
    if (!isPlayerEligible(player)) return;

    const updatedPlayers = [...teamPlayers];
    updatedPlayers[playerIndex] = { ...player, role: Role.STARTER };

    const nextAssignments = { ...team.formationAssignments };
    for (const [key, id] of Object.entries(nextAssignments)) {
      if (id === playerId) {
        nextAssignments[key] = '';
        break;
      }
    }
    nextAssignments[slotId] = playerId;

    const updatedTeam = this.syncStarterRolesWithAssignments({
      ...team,
      players: updatedPlayers,
      formationAssignments: nextAssignments
    });

    const updatedTeams = [...l.teams];
    updatedTeams[teamIndex] = updatedTeam;

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

    const teamIndex = l.teams.findIndex(t => t.id === teamId);
    if (teamIndex === -1) return;

    const team = l.teams[teamIndex];
    const teamPlayers = resolveTeamPlayers(team);
    const playerIndex = teamPlayers.findIndex(p => p.id === playerId);

    if (playerIndex === -1) return;
    const player = teamPlayers[playerIndex];
    if (!this.canAssignPlayerToRole(player, Role.BENCH)) return;

    const updatedPlayers = [...teamPlayers];
    updatedPlayers[playerIndex] = { ...player, role: Role.BENCH };

    const updatedAssignments = { ...team.formationAssignments };
    for (const slotKey of Object.keys(updatedAssignments)) {
      if (updatedAssignments[slotKey] === playerId) {
        updatedAssignments[slotKey] = '';
      }
    }

    const updatedTeam = {
      ...team,
      players: updatedPlayers,
      formationAssignments: updatedAssignments
    };

    const updatedTeams = [...l.teams];
    updatedTeams[teamIndex] = updatedTeam;

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
      return this.syncStarterRolesWithAssignments({
        ...team,
        formationAssignments: {
          ...team.formationAssignments,
          [slotId]: ''
        }
      });
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

    let updatedTeam: typeof l.teams[0] | null = null;
    let teamIndex = -1;

    for (let i = 0; i < l.teams.length; i++) {
      const team = l.teams[i];
      if (team.playerIds.includes(playerId1) && team.playerIds.includes(playerId2)) {
        teamIndex = i;
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
            return;
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

          updatedTeam = {
            ...team,
            players: updatedPlayers,
            formationAssignments: updatedAssignments
          };
        }
        break;
      }
    }

    if (!updatedTeam) return;

    const updatedTeams = [...l.teams];
    updatedTeams[teamIndex] = updatedTeam;

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

  private dressBestPlayers(teams: Team[], seasonYear?: number): Team[] {
    const userTeamId = this.leagueState()?.userTeamId;
    return teams.map(team => {
      if (team.id === userTeamId) return team; // Skip optimizing the user's team
      return this.dressTeamLineup(team, seasonYear);
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
  private calculatePlayerOverall(resolvedSeasonYear: number, player: Player): number {
    const baseOverall = getCurrentPlayerSeasonAttributes(player, resolvedSeasonYear).overall.value;
    const fatigue = player.fatigue ?? 0;
    return scaleOverallWithFatigue(baseOverall, calculateFatigueModifier(fatigue));
  }

  private dressTeamLineup(team: Team, seasonYear?: number): Team {
    const predefinedFormations = this.formationLibrary.listPredefinedFormations();
    const fallbackFormationId = this.formationLibrary.getDefaultFormationId();

    const teamPlayers = resolveTeamPlayers(team);
    if (teamPlayers.length === 0) return team;

    const players = teamPlayers.map(p => ({ ...p, role: Role.RESERVE }));
    const resolvedSeasonYear = seasonYear ?? this.getCurrentLeagueSeasonYear();

    const overallOf = this.calculatePlayerOverall.bind(this, resolvedSeasonYear);

    const byPosition = this.groupAndSortEligiblePlayers(players, isPlayerEligible, overallOf);

    const { bestFormationId, formationAssignments } = this.evaluateAndSelectFormation(
      predefinedFormations,
      fallbackFormationId,
      byPosition,
      overallOf
    );

    this.assignPlayerRoles(players, formationAssignments, byPosition, isPlayerEligible, overallOf);

    return this.withSyncedPlayerIds({ ...team, selectedFormationId: bestFormationId, players, formationAssignments });
  }


  private groupAndSortEligiblePlayers(
    players: Player[],
    eligible: (p: Player) => boolean,
    overallOf: (p: Player) => number
  ): Map<Position, Player[]> {
    const gk: { p: Player; o: number }[] = [];
    const def: { p: Player; o: number }[] = [];
    const mid: { p: Player; o: number }[] = [];
    const fwd: { p: Player; o: number }[] = [];

    for (const p of players) {
      if (eligible(p)) {
        const o = overallOf(p);
        if (p.position === Position.GOALKEEPER) gk.push({ p, o });
        else if (p.position === Position.DEFENDER) def.push({ p, o });
        else if (p.position === Position.MIDFIELDER) mid.push({ p, o });
        else if (p.position === Position.FORWARD) fwd.push({ p, o });
      }
    }

    const sortFn = (a: { o: number }, b: { o: number }) => b.o - a.o;

    return new Map<Position, Player[]>([
      [Position.GOALKEEPER, gk.sort(sortFn).map(x => x.p)],
      [Position.DEFENDER, def.sort(sortFn).map(x => x.p)],
      [Position.MIDFIELDER, mid.sort(sortFn).map(x => x.p)],
      [Position.FORWARD, fwd.sort(sortFn).map(x => x.p)],
    ]);
  }

  private evaluateAndSelectFormation(
    predefinedFormations: { id: string, slots: { preferredPosition: Position, slotId: string }[] }[],
    fallbackFormationId: string,
    byPosition: Map<Position, Player[]>,
    overallOf: (p: Player) => number
  ): { bestFormationId: string; formationAssignments: Record<string, string> } {
    let bestScore = -1;
    let bestFormationId = fallbackFormationId;
    let bestSlotAssignments: Record<string, string> | null = null;

    for (const formation of predefinedFormations) {
      const slotsByPos = new Map<Position, string[]>();
      for (const slot of formation.slots) {
        const ids = slotsByPos.get(slot.preferredPosition) ?? [];
        ids.push(slot.slotId);
        slotsByPos.set(slot.preferredPosition, ids);
      }

      const viable = [...slotsByPos].every(([pos, slotIds]) => (byPosition.get(pos)?.length ?? 0) >= slotIds.length);
      if (!viable) continue;

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

    return { bestFormationId, formationAssignments };
  }

  private assignPlayerRoles(
    players: Player[],
    formationAssignments: Record<string, string>,
    byPosition: Map<Position, Player[]>,
    eligible: (p: Player) => boolean,
    overallOf: (p: Player) => number
  ): void {
    const starterIds = new Set(Object.values(formationAssignments).filter(id => id !== ''));
    for (const player of players) {
      if (starterIds.has(player.id)) player.role = Role.STARTER;
    }

    const benchGks = (byPosition.get(Position.GOALKEEPER) ?? []).filter(p => !starterIds.has(p.id));
    const benchDefs = (byPosition.get(Position.DEFENDER) ?? []).filter(p => !starterIds.has(p.id));
    const benchMids = (byPosition.get(Position.MIDFIELDER) ?? []).filter(p => !starterIds.has(p.id));
    const benchFwds = (byPosition.get(Position.FORWARD) ?? []).filter(p => !starterIds.has(p.id));

    if (benchGks.length > 0) benchGks[0].role = Role.BENCH;
    for (let i = 0; i < Math.min(2, benchDefs.length); i++) benchDefs[i].role = Role.BENCH;
    for (let i = 0; i < Math.min(4, benchMids.length); i++) benchMids[i].role = Role.BENCH;
    for (let i = 0; i < Math.min(2, benchFwds.length); i++) benchFwds[i].role = Role.BENCH;

    const MAX_BENCH_SIZE = 9;

    let benchedCount = 0;
    const remainingEligible: Player[] = [];

    for (const p of players) {
      if (p.role === Role.BENCH) {
        benchedCount++;
      } else if (!starterIds.has(p.id) && eligible(p)) {
        remainingEligible.push(p);
      }
    }

    const openSpots = MAX_BENCH_SIZE - benchedCount;
    if (openSpots > 0) {
      remainingEligible.sort((a, b) => overallOf(b) - overallOf(a));
      for (let i = 0; i < Math.min(openSpots, remainingEligible.length); i++) {
        remainingEligible[i].role = Role.BENCH;
      }
    }
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
      gamesStarted: 0,
      gamesSubbed: 0,
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
      aggregated.gamesStarted += (season.gamesStarted ?? season.matchesPlayed);
      aggregated.gamesSubbed += (season.gamesSubbed ?? 0);
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

  public getTeamLineupSnapshot(team: Team): TeamLineupSnapshot {
    const playerRoles: Record<string, Role> = {};
    const players = resolveTeamPlayers(team);
    for (const player of players) {
      playerRoles[player.id] = player.role;
    }
    return {
      teamId: team.id,
      selectedFormationId: team.selectedFormationId,
      formationAssignments: { ...team.formationAssignments },
      playerRoles
    };
  }

  public previewDressedTeam(teamId: string): Team | null {
    const team = this.getTeam(teamId);
    if (!team) return null;
    const userTeamId = this.leagueState()?.userTeamId;
    if (team.id === userTeamId) return team;
    return this.dressTeamLineup(team);
  }

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

    const homeLineup = this.getTeamLineupSnapshot(preparedHomeTeam);
    const awayLineup = this.getTeamLineupSnapshot(preparedAwayTeam);

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
    this.updateLeagueWithMatchResult(
      match,
      matchState,
      preparedHomeTeam,
      preparedAwayTeam,
      keyEvents,
      matchStats,
      matchReport,
      homeLineup,
      awayLineup,
      endedByForfeit
    );

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
    homeLineup: TeamLineupSnapshot,
    awayLineup: TeamLineupSnapshot,
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
          matchReport,
          homeLineup,
          awayLineup
        }
        : m
    );

    const currentSeasonYear = l.currentSeasonYear;

    // Update team stats
    const updatedTeams = l.teams.map(team => {
      if (team.id === homeTeam.id) {
        return this.getUpdatedTeamWithMatchStats(team, matchState, currentSeasonYear, true, awayTeam.name);
      } else if (team.id === awayTeam.id) {
        return this.getUpdatedTeamWithMatchStats(team, matchState, currentSeasonYear, false, homeTeam.name);
      }
      return team;
    });

    if (!skipPlayerCareerStats) {
      this.updatePlayerCareerStats(matchState, homeTeam, awayTeam, matchReport.homePlayerStats, matchReport.awayPlayerStats);
    }

    // Persist injuries sustained during the match onto the team rosters.
    const teamsWithInjuries = this.applyPostMatchInjuries(updatedTeams, matchState, l.currentSeasonYear, l.currentWeek);

    // Apply accrued fatigue from the match
    const teamsWithFatigue = this.applyPostMatchFatigue(teamsWithInjuries, matchState);

    const finalizedTeams = this.dressBestPlayers(teamsWithFatigue);

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

  private getUpdatedTeamWithMatchStats(
    team: Team,
    matchState: MatchState,
    currentSeasonYear: number,
    isHome: boolean,
    opponentName: string
  ): Team {
    const snapshot = this.getTeamSnapshotForSeason(team, currentSeasonYear);
    const goalsFor = isHome ? matchState.homeScore : matchState.awayScore;
    const goalsAgainst = isHome ? matchState.awayScore : matchState.homeScore;

    const nextStats = {
      ...snapshot.stats,
      played: snapshot.stats.played + 1,
      goalsFor: snapshot.stats.goalsFor + goalsFor,
      goalsAgainst: snapshot.stats.goalsAgainst + goalsAgainst,
      won: snapshot.stats.won + (goalsFor > goalsAgainst ? 1 : 0),
      drawn: snapshot.stats.drawn + (goalsFor === goalsAgainst ? 1 : 0),
      lost: snapshot.stats.lost + (goalsFor < goalsAgainst ? 1 : 0),
      points: snapshot.stats.points + this.getPoints(matchState.homeScore, matchState.awayScore, isHome),
      last5: this.updateLast5Array(snapshot.stats.last5, this.buildRecentMatchResult(matchState.homeScore, matchState.awayScore, isHome, opponentName))
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

  private updatePlayerStatsForEvent(stats: PlayerCareerStats, event: { type: EventType }, playerId: string, primaryPlayerId: string, player: Player) {
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
  }

  private updatePlayerCareerStats(matchState: MatchState, homeTeam: Team, awayTeam: Team, homePlayerStats: PlayerStatistics[], awayPlayerStats: PlayerStatistics[]) {
    const l = this.leagueState();
    if (!l) return;

    const { events, homeScore, awayScore } = matchState;
    const homePlayers = resolveTeamPlayers(homeTeam);
    const awayPlayers = resolveTeamPlayers(awayTeam);

    const allTeamPlayers = [...homePlayers, ...awayPlayers];
    const allPlayers = new Map<string, Player>();
    for (const player of allTeamPlayers) {
      allPlayers.set(player.id, player);
    }

    const statsCache = new Map<string, PlayerCareerStats>();
    const getStats = (player: Player) => {
      let stats = statsCache.get(player.id);
      if (!stats) {
        stats = this.getOrCreateCurrentSeasonStats(player, player.teamId);
        statsCache.set(player.id, stats);
      }
      return stats;
    };

    this.processEventBasedStats(events, allPlayers, getStats);
    this.updateParticipationStats(events, allTeamPlayers, getStats);
    this.updateCleanSheets(homeTeam, awayTeam, homePlayers, awayPlayers, homeScore, awayScore, getStats);
    this.updateAssistsAndRatings(homePlayerStats, awayPlayerStats, allTeamPlayers, getStats);
    this.updateStarNominations(homePlayerStats, awayPlayerStats, homeScore, awayScore, homeTeam.id, awayTeam.id, allTeamPlayers, getStats);
  }

  private processEventBasedStats(
    events: PlayByPlayEvent[],
    allPlayers: Map<string, Player>,
    getStats: (player: Player) => PlayerCareerStats
  ): void {
    for (const event of events) {
      if (event.type === EventType.GOAL) {
        const scorer = allPlayers.get(event.playerIds[0]);
        if (scorer) {
          const stats = getStats(scorer);
          stats.shots++;
          stats.shotsOnTarget++;
          stats.goals++;
        }
        continue;
      }

      if (event.type === EventType.SAVE) {
        const shooter = allPlayers.get(event.playerIds[0]);
        if (shooter) {
          const stats = getStats(shooter);
          stats.shots++;
          stats.shotsOnTarget++;
        }
        const keeperId = event.playerIds[1] ?? event.playerIds[0];
        const keeper = allPlayers.get(keeperId);
        if (keeper) {
          const stats = getStats(keeper);
          stats.saves++;
        }
        continue;
      }

      if (event.type === EventType.MISS) {
        const shooter = allPlayers.get(event.playerIds[0]);
        if (shooter) {
          const stats = getStats(shooter);
          stats.shots++;
        }
        continue;
      }

      const primaryPlayerId = event.playerIds[0];

      for (const playerId of event.playerIds) {
        const player = allPlayers.get(playerId);
        if (!player) continue;

        const stats = getStats(player);
        this.updatePlayerStatsForEvent(stats, event, playerId, primaryPlayerId, player);
      }
    }
  }

  private updateParticipationStats(
    events: PlayByPlayEvent[],
    allTeamPlayers: Player[],
    getStats: (player: Player) => PlayerCareerStats
  ): void {
    const matchLength = 90;
    const substitutionsAndDismissals = events
      .filter(e => e.type === EventType.SUBSTITUTION || e.type === EventType.RED_CARD || e.type === EventType.INJURY)
      .sort((left, right) => left.time - right.time);
    const minutesOnPitch = new Map<string, number>();
    const activeSince = new Map<string, number | null>();

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

    for (const [playerId, startedAt] of activeSince.entries()) {
      if (typeof startedAt !== 'number') {
        continue;
      }

      minutesOnPitch.set(playerId, (minutesOnPitch.get(playerId) ?? 0) + (matchLength - startedAt));
    }

    // Update minutes played and matches played for players with any pitch time
    for (const player of allTeamPlayers) {
      const minutes = minutesOnPitch.get(player.id) ?? 0;
      if (minutes > 0) {
        const stats = getStats(player);
        stats.minutesPlayed += minutes;

        if (stats.gamesStarted === undefined) {
          stats.gamesStarted = stats.matchesPlayed;
        }
        if (stats.gamesSubbed === undefined) {
          stats.gamesSubbed = 0;
        }
        stats.matchesPlayed++;
        if (player.role === Role.STARTER) {
          stats.gamesStarted++;
        } else {
          stats.gamesSubbed++;
        }
      }
    }
  }

  private updateCleanSheets(
    homeTeam: Team,
    awayTeam: Team,
    homePlayers: Player[],
    awayPlayers: Player[],
    homeScore: number,
    awayScore: number,
    getStats: (player: Player) => PlayerCareerStats
  ): void {
    const homeGoalkeeper = homePlayers.find(p => p.id === homeTeam.formationAssignments['gk_1']);
    const awayGoalkeeper = awayPlayers.find(p => p.id === awayTeam.formationAssignments['gk_1']);

    if (homeGoalkeeper && awayScore === 0) {
      const stats = getStats(homeGoalkeeper);
      stats.cleanSheets++;
    }
    if (awayGoalkeeper && homeScore === 0) {
      const stats = getStats(awayGoalkeeper);
      stats.cleanSheets++;
    }
  }

  private updateAssistsAndRatings(
    homePlayerStats: PlayerStatistics[],
    awayPlayerStats: PlayerStatistics[],
    allTeamPlayers: Player[],
    getStats: (player: Player) => PlayerCareerStats
  ): void {
    const allMatchStats = [...homePlayerStats, ...awayPlayerStats];
    for (const ps of allMatchStats) {
      const player = allTeamPlayers.find(p => p.id === ps.playerId);
      if (!player) continue;
      const stats = getStats(player);
      stats.assists += ps.assists;
      if (ps.rating !== 0) {
        stats.totalMatchRating += ps.rating;
      }
    }
  }

  private updateStarNominations(
    homePlayerStats: PlayerStatistics[],
    awayPlayerStats: PlayerStatistics[],
    homeScore: number,
    awayScore: number,
    homeTeamId: string,
    awayTeamId: string,
    allTeamPlayers: Player[],
    getStats: (player: Player) => PlayerCareerStats
  ): void {
    const winningTeamId = homeScore > awayScore
      ? homeTeamId
      : awayScore > homeScore
        ? awayTeamId
        : null;
    const stars = rankThreeStars(homePlayerStats, awayPlayerStats, winningTeamId, homeTeamId, awayTeamId);

    for (const star of stars) {
      const player = allTeamPlayers.find(p => p.id === star.stats.playerId);
      if (!player) continue;
      const stats = getStats(player);
      if (star.rank === 1) stats.starNominations.first++;
      else if (star.rank === 2) stats.starNominations.second++;
      else stats.starNominations.third++;
    }
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

  private assessRetirements(
    teams: Team[],
    currentSeasonYear: number,
    nextSeasonYear: number,
    userTeamId: string | undefined
  ): { updatedTeams: Team[], transitionLog: SeasonTransitionLog } {
    const logEvents: SeasonTransitionEvent[] = [];
    const updatedTeams = teams.map(team => {
      const players = resolveTeamPlayers(team);
      const updatedPlayers: Player[] = [];
      let teamHasRetirements = false;

      for (const player of players) {
        if (!player.progression) {
          throw new Error(`Player ${player.id} is missing progression data. Cannot assess retirement.`);
        }

        const age = computeAge(player.personal.birthday, seasonAnchorDate(nextSeasonYear));
        const phase = derivePhase(age, player);

        let retire = false;
        let peakOverall = 0;
        let currentOverall = 0;

        if (phase === Phase.Junior || phase === Phase.Peak) {
          retire = false;
        } else if (age >= 45) {
          retire = true;
        } else {
          // SENIOR or DECLINE phase
          let baseRate = 0;
          if (phase === Phase.Senior) {
            baseRate = lerp(0.01, 0.06, 1 - (player.progression.professionalism / 100));
          } else if (phase === Phase.Decline) {
            const yearsIntoDecline = age - player.progression.seniorEndAge;
            const declineWindowLength = Math.max(1, 45 - player.progression.seniorEndAge);
            const t = yearsIntoDecline / declineWindowLength;
            const professionalismDampener = lerp(1.2, 0.8, player.progression.professionalism / 100);
            baseRate = clamp(t * 0.75 * professionalismDampener, 0, 0.75);
          }

          // Injury modifier
          let recentSevereCount = 0;
          for (const inj of (player.injuries || [])) {
            if (inj.sustainedInSeason < currentSeasonYear - 2) {
              continue;
            }

            const severity = getInjuryDefinition(inj.definitionId)?.severity;
            if (severity === 'Serious' || severity === 'Severe') {
              recentSevereCount++;
            }
          }
          const isStillInjured = getActiveInjury(player) !== null;
          const injuryMultiplier = clamp(1.0 + (recentSevereCount * 0.3) + (isStillInjured ? 0.2 : 0), 1.0, 2.0);

          // Overall decline bonus
          for (const attrs of (player.seasonAttributes || [])) {
            if (attrs.overall.value > peakOverall) peakOverall = attrs.overall.value;
            if (attrs.seasonYear === currentSeasonYear) currentOverall = attrs.overall.value;
          }
          const declineMagnitude = peakOverall - currentOverall;
          let overallDeclineBonus = 0;
          if (declineMagnitude >= 25) overallDeclineBonus = 0.20;
          else if (declineMagnitude >= 15) overallDeclineBonus = 0.12;
          else if (declineMagnitude >= 5) overallDeclineBonus = 0.05;

          // Mood/professionalism bonus
          let moodBonus = 0;
          if (player.progression.professionalism <= 70 && player.mood < 50) {
            moodBonus = ((50 - player.mood) / 50) * 0.10;
          }

          // Career ceiling modifier
          let careerCeilingBonus = 0;
          if (phase === Phase.Decline) {
            if (peakOverall < 55) careerCeilingBonus = 0.15;
            else if (peakOverall <= 64) careerCeilingBonus = 0.08;
          }

          const rawChance = (baseRate * injuryMultiplier) + overallDeclineBonus + moodBonus + careerCeilingBonus;
          let dampened = rawChance;
          if (currentOverall >= 70) dampened *= 0.5;
          else if (currentOverall >= 65) dampened *= 0.7;

          const finalChance = clamp(dampened, 0, 0.90);
          retire = this.rng.random() < finalChance;
        }

        if (retire) {
          teamHasRetirements = true;
          const isUserTeam = team.id === userTeamId;
          const replacementAge = 16 + Math.floor(this.rng.random() * 3); // 16 to 18 inclusive
          // Age scaling is handled inside generatePlayer — passing age < 19
          // automatically reduces stat ceilings while preserving high potential.
          const replacement = this.generator.generatePlayer(
            team.id,
            player.position,
            Role.RESERVE,
            1.0,
            nextSeasonYear,
            replacementAge
          );

          updatedPlayers.push(replacement);

          // Build event — emit for every retirement so team-details and news page have full data
          logEvents.push({
            category: 'retirement',
            headline: `${player.name} Retires`,
            detail: `${player.name} (${age}) has announced their retirement. ${replacement.name} has been signed as a prospect.`,
            teamId: team.id,
            playerIds: [player.id, replacement.id],
            isUserTeam
          });
        } else {
          updatedPlayers.push(player);
        }
      }

      if (!teamHasRetirements) {
        return team;
      }

      const updatedTeam = this.withSyncedPlayerIds({
        ...team,
        players: updatedPlayers
      });

      // We must update the last season snapshot (which is for nextSeasonYear)
      // to reflect the new playerIds.
      if (updatedTeam.seasonSnapshots && updatedTeam.seasonSnapshots.length > 0) {
        const snapshots = [...updatedTeam.seasonSnapshots];
        const lastIndex = snapshots.length - 1;
        if (snapshots[lastIndex].seasonYear === nextSeasonYear) {
          snapshots[lastIndex] = {
            ...snapshots[lastIndex],
            playerIds: updatedTeam.playerIds
          };
          updatedTeam.seasonSnapshots = snapshots;
        }
      }

      // We also need to clear formationAssignments for any replaced player
      // or just re-validate later, but it's safer to clear here.
      const currentPlayersSet = new Set(updatedTeam.playerIds);
      const newFormationAssignments = { ...updatedTeam.formationAssignments };
      for (const [slotId, playerId] of Object.entries(newFormationAssignments)) {
        if (!currentPlayersSet.has(playerId as string)) {
          newFormationAssignments[slotId] = '';
        }
      }
      updatedTeam.formationAssignments = newFormationAssignments;

      return updatedTeam;
    });

    return {
      updatedTeams,
      transitionLog: {
        seasonYear: currentSeasonYear,
        events: logEvents,
        isRead: false,
        dismissedTeamIds: []
      }
    };
  }

  startNewSeason(): boolean {
    if (!this.canMutateLeagueState()) return false;

    const league = this.leagueState();
    if (!league) return false;
    if (!this.isSeasonComplete()) return false;
    if (this.isSimulatingWeekState() || this.isSimulatingSingleMatch()) return false;

    const nextSeasonYear = league.currentSeasonYear + 1;

    // Step 1: Prep teams with next season's snapshots
    const teamsWithNextSnapshot = league.teams.map(team => {
      const currentSnapshot = this.getTeamSnapshotForSeason(team, league.currentSeasonYear);
      const nextSnapshot = {
        seasonYear: nextSeasonYear,
        playerIds: [...currentSnapshot.playerIds],
        stats: createEmptyTeamStats()
      };

      return this.withSyncedPlayerIds({
        ...team,
        stats: nextSnapshot.stats,
        playerIds: [...nextSnapshot.playerIds],
        seasonSnapshots: withSortedUniqueSeasons([...(team.seasonSnapshots ?? []), nextSnapshot])
      });
    });

    // Step 2: Assess Retirements
    const { updatedTeams: teamsAfterRetirements, transitionLog } = this.assessRetirements(
      teamsWithNextSnapshot,
      league.currentSeasonYear,
      nextSeasonYear,
      league.userTeamId
    );

    // Step 3: Seed next season attributes and career stats
    const seededTeams = teamsAfterRetirements.map(team => {
      const seededPlayers = resolveTeamPlayers(team).map(player => {
        const hasSeededAttributes = (player.seasonAttributes ?? []).some(attributes => attributes.seasonYear === nextSeasonYear);
        const seededSeasonAttributes = hasSeededAttributes ? null : this.generateNextSeasonAttributes(player, nextSeasonYear);

        const nextCareerStatsExists = player.careerStats.some(stats => stats.seasonYear === nextSeasonYear);

        return {
          ...player,
          mood: 100,
          fatigue: 0,
          seasonAttributes: hasSeededAttributes
            ? (player.seasonAttributes ?? [])
            : withSortedUniqueSeasons([...(player.seasonAttributes ?? []), seededSeasonAttributes!]),
          careerStats: nextCareerStatsExists
            ? player.careerStats
            : [...player.careerStats, createEmptyPlayerCareerStats(nextSeasonYear, team.id)].sort((left, right) => left.seasonYear - right.seasonYear)
        };
      });

      return this.withSyncedPlayerIds({
        ...team,
        players: seededPlayers
      });
    });

    this.seasonTransitionLogState.set(transitionLog);
    void this.persistenceService.saveSeasonTransitionLog(transitionLog);

    const nextSeasonSchedule = this.generator.generateScheduleForSeason(seededTeams, nextSeasonYear);
    const retainedSchedule = this.pruneScheduleBySeasonBuckets(
      [...league.schedule, ...nextSeasonSchedule],
      GameService.MATCH_RETENTION_CAP,
      league.currentSeasonYear
    );

    const updatedLeague: League = {
      ...league,
      teams: this.dressBestPlayers(seededTeams, nextSeasonYear),
      schedule: retainedSchedule,
      currentSeasonYear: nextSeasonYear,
      currentWeek: 1,
      transferListings: [],
      transferOffers: []
    };

    updatedLeague.transferListings = this.runCpuAutoListingForLeague(updatedLeague);

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
      throw new Error(`Player ${player.id} is missing progression data. Cannot generate attributes.`);
    }

    const currentAge = computeAge(player.personal.birthday, seasonAnchorDate(nextSeasonYear));
    const phase = derivePhase(currentAge, player);
    const headroom = Math.max(0, player.progression.potential - currentAttrs.overall.value);

    // Clamp to [-0.5,1]: a bad professionalism/temperament roll can flip growth negative, simulating a bust or severe regression.
    const outcomeRoll = clamp(
      gaussianRandom({
        mean: player.progression.professionalism / 100,
        variance: 1 - (player.progression.temperament / 100)
      }),
      -0.5, 1
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
