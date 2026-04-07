import { Injectable, signal, computed, inject } from '@angular/core';
import { League, Match, Team, Player, Role, MatchEvent, MatchStatistics, MatchReport } from '../models/types';
import { GeneratorService } from './generator.service';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { CommentaryService } from './commentary.service';
import { StatisticsService } from './statistics.service';
import { PostMatchAnalysisService } from './post.match.analysis.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { PersistenceService } from './persistence.service';
import { normalizeTeamFormation } from '../models/team-migration';
import { normalizeTeamRoster, resolveTeamPlayers } from '../models/team-players';
import { SimulationConfig, MatchState, PlayByPlayEvent } from '../models/simulation.types';
import { MatchResult, CommentaryStyle, Position, EventImportance, EventType } from '../models/enums';

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private leagueState = signal<League | null>(null);
  private hydrationPromise: Promise<void> | null = null;
  private isHydrating = signal(true);

  public league = this.leagueState.asReadonly();
  
  public hasLeague = computed(() => this.leagueState() !== null);
  
  public standings = computed(() => {
    const l = this.leagueState();
    if (!l) return [];
    return [...l.teams].sort((a, b) => {
      if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points;
      const gdA = a.stats.goalsFor - a.stats.goalsAgainst;
      const gdB = b.stats.goalsFor - b.stats.goalsAgainst;
      if (gdB !== gdA) return gdB - gdA;
      return b.stats.goalsFor - a.stats.goalsFor;
    });
  });

  public currentWeekMatches = computed(() => {
    const l = this.leagueState();
    if (!l) return [];
    return l.schedule.filter(m => m.week === l.currentWeek);
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

  private persistLeagueMetadata(league: Pick<League, 'currentWeek' | 'userTeamId'>): void {
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
      void this.persistenceService.saveTeam(team);
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
    const { teams, schedule } = this.generator.generateLeague();
    const league: League = {
      teams: this.withSyncedPlayerIdsForTeams(teams),
      schedule,
      currentWeek: 1
    };

    this.leagueState.set(league);
    this.persistLeague(league);
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
    return this.leagueState()?.schedule.filter(m => m.week === week) || [];
  }

  advanceWeek() {
    const league = this.leagueState();
    if (!league) return;

    const updatedLeague: League = {
      ...league,
      currentWeek: league.currentWeek + 1
    };

    this.leagueState.set(updatedLeague);
    this.persistLeagueMetadata(updatedLeague);
  }

  simulateCurrentWeek(config?: Partial<SimulationConfig>) {
    const l = this.leagueState();
    if (!l) return;

    const matches = l.schedule.filter(m => m.week === l.currentWeek);

    matches.forEach(match => {
      if (match.played) return;

      const homeTeam = l.teams.find(t => t.id === match.homeTeamId);
      const awayTeam = l.teams.find(t => t.id === match.awayTeamId);

      if (!homeTeam || !awayTeam) return;

      // Use enhanced simulation with full features enabled
      const result = this.simulateMatchWithDetails(match, homeTeam, awayTeam, {
        enablePlayByPlay: true,
        enableSpatialTracking: true,
        enableTactics: true,
        enableFatigue: true,
        commentaryStyle: CommentaryStyle.DETAILED,
        simulationVariant: 'B',
        ...config
      });

      // The match result is already updated in the league state by simulateMatchWithDetails
      console.log(`Match ${match.id}: ${homeTeam.name} ${result.matchState.homeScore} - ${result.matchState.awayScore} ${awayTeam.name}`);
      console.log('Key Events:', result.matchState.events.length);
      console.log('Commentary Sample:', result.commentary.slice(0, 3));
    });

    // Advance to next week
    this.advanceWeek();
  }

  setUserTeam(teamId: string) {
    const l = this.leagueState();
    if (l) {
      const updatedLeague: League = { ...l, userTeamId: teamId };
      this.leagueState.set(updatedLeague);
      this.persistLeagueMetadata(updatedLeague);
    }
  }

  updatePlayerRole(playerId: string, newRole: Role) {
    const l = this.leagueState();
    if (!l) return;

    const updatedTeams = l.teams.map(team => {
      const teamPlayers = resolveTeamPlayers(team);
      const playerIndex = teamPlayers.findIndex(p => p.id === playerId);
      if (playerIndex !== -1) {
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
    const l = this.leagueState();
    if (!l) return;

    const updatedTeams = l.teams.map(team => {
      if (team.id !== teamId) return team;

      const teamPlayers = resolveTeamPlayers(team);

      const player = teamPlayers.find(p => p.id === playerId);
      if (!player) return team;

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

  clearFormationAssignment(teamId: string, slotId: string) {
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

  getFormationValidationErrors(team: Team): string[] {
    return this.fieldService.validateFormationAssignments(team, resolveTeamPlayers(team)).errors;
  }

  private formationLibrary = inject(FormationLibraryService);

  changeTeamFormation(teamId: string, formationId: string) {
    const l = this.leagueState();
    const schema = this.formationLibrary.getFormationSlots(formationId);
    if (!l || !schema) return;

    const updatedTeams = l.teams.map(team => {
      if (team.id !== teamId) return team;
      return this.withSyncedPlayerIds(
        normalizeTeamFormation({ ...team, selectedFormationId: formationId }, formationId, schema)
      );
    });

    const updatedLeague: League = { ...l, teams: updatedTeams };
    this.leagueState.set(updatedLeague);
    this.persistChangedTeams(l.teams, updatedLeague.teams);
  }

  swapPlayerRoles(playerId1: string, playerId2: string) {
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

      const players = resolveTeamPlayers(team).map(p => ({ ...p, role: Role.RESERVE }));

      const gks = players.filter(p => p.position === Position.GOALKEEPER).sort((a, b) => b.overall - a.overall);
      const defs = players.filter(p => p.position === Position.DEFENDER).sort((a, b) => b.overall - a.overall);
      const mids = players.filter(p => p.position === Position.MIDFIELDER).sort((a, b) => b.overall - a.overall);
      const fwds = players.filter(p => p.position === Position.FORWARD).sort((a, b) => b.overall - a.overall);

      if (gks.length > 0) gks[0].role = Role.STARTER;
      for (let i = 0; i < Math.min(4, defs.length); i++) defs[i].role = Role.STARTER;
      for (let i = 0; i < Math.min(4, mids.length); i++) mids[i].role = Role.STARTER;
      for (let i = 0; i < Math.min(2, fwds.length); i++) fwds[i].role = Role.STARTER;

      if (gks.length > 1) gks[1].role = Role.BENCH;
      for (let i = 4; i < Math.min(7, defs.length); i++) defs[i].role = Role.BENCH;
      for (let i = 4; i < Math.min(8, mids.length); i++) mids[i].role = Role.BENCH;
      for (let i = 2; i < Math.min(4, fwds.length); i++) fwds[i].role = Role.BENCH;

      const startersByPosition = {
        [Position.GOALKEEPER]: players.filter(p => p.role === Role.STARTER && p.position === Position.GOALKEEPER),
        [Position.DEFENDER]: players.filter(p => p.role === Role.STARTER && p.position === Position.DEFENDER),
        [Position.MIDFIELDER]: players.filter(p => p.role === Role.STARTER && p.position === Position.MIDFIELDER),
        [Position.FORWARD]: players.filter(p => p.role === Role.STARTER && p.position === Position.FORWARD)
      };

      const formationAssignments: Record<string, string> = {
        gk_1: startersByPosition[Position.GOALKEEPER][0]?.id ?? '',
        def_l: startersByPosition[Position.DEFENDER][0]?.id ?? '',
        def_lc: startersByPosition[Position.DEFENDER][1]?.id ?? '',
        def_rc: startersByPosition[Position.DEFENDER][2]?.id ?? '',
        def_r: startersByPosition[Position.DEFENDER][3]?.id ?? '',
        mid_l: startersByPosition[Position.MIDFIELDER][0]?.id ?? '',
        mid_lc: startersByPosition[Position.MIDFIELDER][1]?.id ?? '',
        mid_rc: startersByPosition[Position.MIDFIELDER][2]?.id ?? '',
        mid_r: startersByPosition[Position.MIDFIELDER][3]?.id ?? '',
        att_l: startersByPosition[Position.FORWARD][0]?.id ?? '',
        att_r: startersByPosition[Position.FORWARD][1]?.id ?? ''
      };

      return this.withSyncedPlayerIds({ ...team, players, formationAssignments });
    });
  }

  public calculateTeamOverall(team: Team): number {
    const starters = resolveTeamPlayers(team).filter(p => p.role === Role.STARTER);
    if (starters.length === 0) return 50;
    const sum = starters.reduce((acc, p) => acc + p.overall, 0);
    return Math.round(sum / starters.length);
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

  // Enhanced simulation methods
  private matchSimulationVariantBService = inject(MatchSimulationVariantBService);
  private commentaryService = inject(CommentaryService);
  private statisticsService = inject(StatisticsService);
  private postMatchAnalysisService = inject(PostMatchAnalysisService);
  private fieldService = inject(FieldService);

  simulateMatchWithDetails(match: Match, homeTeam: Team, awayTeam: Team, config?: Partial<SimulationConfig>) {
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

    const matchState = this.matchSimulationVariantBService.simulateMatch(match, homeTeam, awayTeam, simConfig);
    
    // Generate statistics
    const matchStats = this.statisticsService.generateMatchStatistics(matchState, homeTeam, awayTeam);
    
    // Generate post-match analysis
    const matchReport = this.postMatchAnalysisService.generateMatchReport(matchState, homeTeam, awayTeam);
    
    // Extract key events from match state
    const keyEvents = this.extractKeyEvents(matchState.events);
    
    // Update league state with results
    this.updateLeagueWithMatchResult(match, matchState, homeTeam, awayTeam, keyEvents, matchStats, matchReport);
    
    return {
      matchState,
      matchStats,
      matchReport,
      keyEvents,
      commentary: simConfig.skipCommentary ? [] : this.generateMatchCommentary(matchState, homeTeam, awayTeam, simConfig.commentaryStyle === CommentaryStyle.STATS_ONLY ? CommentaryStyle.DETAILED : simConfig.commentaryStyle)
    };
  }

  private updateLeagueWithMatchResult(match: Match, matchState: MatchState, homeTeam: Team, awayTeam: Team, keyEvents: MatchEvent[], matchStats: MatchStatistics, matchReport: MatchReport) {
    const l = this.leagueState();
    if (!l) return;

    // Update match in schedule
    const updatedSchedule = l.schedule.map(m => 
      m.id === match.id 
        ? { 
            ...m, 
            homeScore: matchState.homeScore, 
            awayScore: matchState.awayScore, 
            played: true,
            keyEvents,
            matchStats,
            matchReport
          }
        : m
    );

    // Update team stats
    const updatedTeams = l.teams.map(team => {
      if (team.id === homeTeam.id) {
        return {
          ...team,
          stats: {
            ...team.stats,
            played: team.stats.played + 1,
            goalsFor: team.stats.goalsFor + matchState.homeScore,
            goalsAgainst: team.stats.goalsAgainst + matchState.awayScore,
            won: team.stats.won + (matchState.homeScore > matchState.awayScore ? 1 : 0),
            drawn: team.stats.drawn + (matchState.homeScore === matchState.awayScore ? 1 : 0),
            lost: team.stats.lost + (matchState.homeScore < matchState.awayScore ? 1 : 0),
            points: team.stats.points + this.getPoints(matchState.homeScore, matchState.awayScore, true),
            last5: this.updateLast5Array(team.stats.last5, this.getResult(matchState.homeScore, matchState.awayScore, true))
          }
        };
      } else if (team.id === awayTeam.id) {
        return {
          ...team,
          stats: {
            ...team.stats,
            played: team.stats.played + 1,
            goalsFor: team.stats.goalsFor + matchState.awayScore,
            goalsAgainst: team.stats.goalsAgainst + matchState.homeScore,
            won: team.stats.won + (matchState.awayScore > matchState.homeScore ? 1 : 0),
            drawn: team.stats.drawn + (matchState.awayScore === matchState.homeScore ? 1 : 0),
            lost: team.stats.lost + (matchState.awayScore < matchState.homeScore ? 1 : 0),
            points: team.stats.points + this.getPoints(matchState.homeScore, matchState.awayScore, false),
            last5: this.updateLast5Array(team.stats.last5, this.getResult(matchState.homeScore, matchState.awayScore, false))
          }
        };
      }
      return team;
    });

    // Update player career stats
    this.updatePlayerCareerStats(matchState.events, homeTeam, awayTeam, matchState.homeScore, matchState.awayScore);

    // Persist updated league state. Week progression is managed externally
    // (e.g., by the schedule component) to avoid double-incrementing.
    const updatedLeague: League = {
      ...l,
      teams: updatedTeams,
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
      void this.persistenceService.saveMatchResult(updatedMatch, changedTeams);
    }
  }

  private updatePlayerCareerStats(events: PlayByPlayEvent[], homeTeam: Team, awayTeam: Team, homeScore: number, awayScore: number) {
    const l = this.leagueState();
    if (!l) return;

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
          scorer.careerStats.goals++;
        }
        return;
      }

      if (event.type === EventType.SAVE) {
        const keeperId = event.playerIds[1] ?? event.playerIds[0];
        const keeper = allPlayers.get(keeperId);
        if (keeper) {
          keeper.careerStats.saves++;
        }
        return;
      }

      const primaryPlayerId = event.playerIds[0];

      event.playerIds.forEach((playerId: string) => {
        const player = allPlayers.get(playerId);
        if (!player) return;

        // Update career stats based on event type
        switch (event.type) {
          case EventType.SHOT:
            player.careerStats.shots++;
            if (event.success) {
              player.careerStats.shotsOnTarget++;
            }
            break;
          case EventType.TACKLE:
            player.careerStats.tackles++;
            break;
          case EventType.INTERCEPTION:
            player.careerStats.interceptions++;
            break;
          case EventType.PASS:
            player.careerStats.passes++;
            break;
          case EventType.YELLOW_CARD:
            if (playerId !== primaryPlayerId) return;
            player.careerStats.yellowCards++;
            break;
          case EventType.RED_CARD:
            if (playerId !== primaryPlayerId) return;
            player.careerStats.redCards++;
            break;
        }
      });
    });

    // Update minutes played for all players who participated
    const allTeamPlayers = [...homePlayers, ...awayPlayers];
    allTeamPlayers.forEach(player => {
      if (player.role !== Role.RESERVE) {
        player.careerStats.minutesPlayed += 90; // Full match
      }
    });

    // Update matches played for all players who participated
    allTeamPlayers.forEach(player => {
      if (player.role !== Role.RESERVE) {
        player.careerStats.matchesPlayed++;
      }
    });

    // Update clean sheets for goalkeepers
    const homeGoalkeeper = homePlayers.find(p => p.id === homeTeam.formationAssignments['gk_1']);
    const awayGoalkeeper = awayPlayers.find(p => p.id === awayTeam.formationAssignments['gk_1']);

    if (homeGoalkeeper && awayScore === 0) {
      homeGoalkeeper.careerStats.cleanSheets++;
    }
    if (awayGoalkeeper && homeScore === 0) {
      awayGoalkeeper.careerStats.cleanSheets++;
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
        case EventType.SUBSTITUTION:
          importance = EventImportance.MEDIUM;
          icon = '🔄';
          description = `Substitution at ${event.time}'`;
          break;
      }

      if (importance !== EventImportance.LOW || event.type === EventType.GOAL || event.type === EventType.RED_CARD) {
        keyEvents.push({
          id: event.id,
          type: event.type,
          description,
          playerIds: event.playerIds,
          time: event.time,
          location: event.location,
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

  private updateLast5Array(last5: MatchResult[], result: MatchResult): MatchResult[] {
    const newLast5 = [result, ...last5];
    if (newLast5.length > 5) {
      newLast5.pop();
    }
    return newLast5;
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

  getTeamForm(teamId: string): MatchResult[] {
    const l = this.leagueState();
    if (!l) return [];
    
    const team = l.teams.find(t => t.id === teamId);
    return team?.stats.last5 || [];
  }

  getTeamStatistics(teamId: string) {
    const l = this.leagueState();
    if (!l) return null;
    
    const team = l.teams.find(t => t.id === teamId);
    if (!team) return null;
    
    // Get all matches involving this team
    const teamMatches = l.schedule.filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId);
    
    // Calculate advanced statistics
    const totalMatches = teamMatches.length;
    const wins = teamMatches.filter(m => 
      (m.homeTeamId === teamId && m.homeScore! > m.awayScore!) ||
      (m.awayTeamId === teamId && m.awayScore! > m.homeScore!)
    ).length;
    
    const draws = teamMatches.filter(m => m.homeScore === m.awayScore).length;
    const losses = totalMatches - wins - draws;
    
    const goalsFor = teamMatches.reduce((sum, m) => 
      sum + (m.homeTeamId === teamId ? m.homeScore! : m.awayScore!), 0
    );
    
    const goalsAgainst = teamMatches.reduce((sum, m) => 
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
