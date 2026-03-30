import { TestBed } from '@angular/core/testing';
import { MatchSimulationService } from './match.simulation.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { CommentaryService } from './commentary.service';
import { Team, Player } from '../models/types';
import { MatchState, SimulationConfig, TacticalSetup, PlayerFatigue } from '../models/simulation.types';
import { Role, Position as PositionEnum, FieldZone, EventType, CommentaryStyle, MatchPhase } from '../models/enums';
import { resolveTeamPlayers } from '../models/team-players';

interface MatchSimulationServicePrivateApi {
  getGoalkeeperForTeam(team: Team): Player | undefined;
  calculateTeamTactics(homeTeam: Team, awayTeam: Team): { home: TacticalSetup; away: TacticalSetup };
  initializeFatigue(homeTeam: Team, awayTeam: Team): { home: PlayerFatigue[]; away: PlayerFatigue[] };
  getLastSimulationRosterResolveCount(): number;
  calculateShotSuccess: (
    shooter: Player,
    goalkeeper: Player | undefined,
    tactics: TacticalSetup,
    fatigue: PlayerFatigue[],
    location: { x: number; y: number }
  ) => { goal: boolean; onTarget: boolean };
  handleShot(
    state: MatchState,
    action: { type: EventType; player: Player },
    homeTeam: Team,
    awayTeam: Team,
    tactics: { home: TacticalSetup; away: TacticalSetup },
    fatigue: { home: PlayerFatigue[]; away: PlayerFatigue[] },
    minute: number,
    config: SimulationConfig
  ): void;
}

describe('MatchSimulationService - Schema-Driven Simulation', () => {
  let simulationService: MatchSimulationService;
  let fieldService: FieldService;
  let formationLibrary: FormationLibraryService;
  let privateApi: MatchSimulationServicePrivateApi;
  let mockTeam442: Team;
  let mockPlayers: Player[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MatchSimulationService, FieldService, FormationLibraryService, CommentaryService]
    });

    simulationService = TestBed.inject(MatchSimulationService);
    fieldService = TestBed.inject(FieldService);
    formationLibrary = TestBed.inject(FormationLibraryService);
    privateApi = simulationService as unknown as MatchSimulationServicePrivateApi;

    // Create mock players
    mockPlayers = [
      createMockPlayer('gk1', 'Keeper', PositionEnum.GOALKEEPER, Role.STARTER, 90),
      createMockPlayer('def1', 'Defender1', PositionEnum.DEFENDER, Role.STARTER, 75),
      createMockPlayer('def2', 'Defender2', PositionEnum.DEFENDER, Role.STARTER, 75),
      createMockPlayer('def3', 'Defender3', PositionEnum.DEFENDER, Role.STARTER, 75),
      createMockPlayer('def4', 'Defender4', PositionEnum.DEFENDER, Role.STARTER, 75),
      createMockPlayer('mid1', 'Midfielder1', PositionEnum.MIDFIELDER, Role.STARTER, 78),
      createMockPlayer('mid2', 'Midfielder2', PositionEnum.MIDFIELDER, Role.STARTER, 78),
      createMockPlayer('mid3', 'Midfielder3', PositionEnum.MIDFIELDER, Role.STARTER, 78),
      createMockPlayer('mid4', 'Midfielder4', PositionEnum.MIDFIELDER, Role.STARTER, 78),
      createMockPlayer('fwd1', 'Forward1', PositionEnum.FORWARD, Role.STARTER, 80),
      createMockPlayer('fwd2', 'Forward2', PositionEnum.FORWARD, Role.STARTER, 80),
      createMockPlayer('bench1', 'BenchPlayer', PositionEnum.GOALKEEPER, Role.BENCH, 70)
    ];

    // Create mock team with 4-4-2 formation
    mockTeam442 = createMockTeam('team_442', mockPlayers, 'formation_4_4_2');
  });

  describe('Goalkeeper Resolution from Formation Schema', () => {
    it('should find goalkeeper from 4-4-2 formation schema', () => {
      // Access private method through typed test adapter
      const goalkeeper = privateApi.getGoalkeeperForTeam(mockTeam442);
      expect(goalkeeper).toBeDefined();
      expect(goalkeeper?.id).toBe('gk1');
      expect(goalkeeper?.position).toBe(PositionEnum.GOALKEEPER);
    });

    it('should return undefined if goalkeeper slot is unassigned', () => {
      const team = {
        ...mockTeam442,
        formationAssignments: {
          ...mockTeam442.formationAssignments,
          gk_1: '' // Empty goalkeeper assignment
        }
      };

      const goalkeeper = privateApi.getGoalkeeperForTeam(team);
      expect(goalkeeper).toBeUndefined();
    });

    it('should fallback to first starter goalkeeper if formation invalid', () => {
      const team = {
        ...mockTeam442,
        selectedFormationId: 'invalid_formation'
      };

      const goalkeeper = privateApi.getGoalkeeperForTeam(team);
      expect(goalkeeper).toBeDefined();
      expect(goalkeeper?.position).toBe(PositionEnum.GOALKEEPER);
      expect(goalkeeper?.role).toBe(Role.STARTER);
    });

    it('should fallback to first starter goalkeeper if slot not found', () => {
      // Create a formation schema without a goalkeeper slot (shouldn't happen in practice)
      const customSchema = formationLibrary.getFormationById('formation_4_4_2')!;
      formationLibrary.registerUserFormation({
        id: 'user_no_gk_slot',
        name: 'No GK Slot',
        shortCode: 'NGK',
        isUserDefined: true,
        createdAt: Date.now(),
        slots: customSchema.slots.map(s => ({
          ...s,
          preferredPosition: PositionEnum.MIDFIELDER // All midfielders
        }))
      });

      const team = {
        ...mockTeam442,
        selectedFormationId: 'user_no_gk_slot'
      };

      const goalkeeper = privateApi.getGoalkeeperForTeam(team);
      expect(goalkeeper).toBeDefined();
      expect(goalkeeper?.position).toBe(PositionEnum.GOALKEEPER);
    });

    it('should pass opponent assigned goalkeeper into shot calculation during handleShot', () => {
      const homeTeam = { ...mockTeam442 };
      const awayPlayers = mockPlayers.map(p => ({
        ...p,
        id: `away_${p.id}`,
        name: `Away ${p.name}`
      }));
      const awayTeam = {
        ...createMockTeam('team_away', awayPlayers, 'formation_4_4_2'),
        formationAssignments: {
          gk_1: 'away_gk1',
          def_l: 'away_def1',
          def_lc: 'away_def2',
          def_rc: 'away_def3',
          def_r: 'away_def4',
          mid_l: 'away_mid1',
          mid_lc: 'away_mid2',
          mid_rc: 'away_mid3',
          mid_r: 'away_mid4',
          att_l: 'away_fwd1',
          att_r: 'away_fwd2'
        }
      };

      const shooter = resolveTeamPlayers(homeTeam).find(p => p.id === 'fwd1')!;
      const state = createShotTestState(homeTeam.id, shooter.id);

      const tactics = privateApi.calculateTeamTactics(homeTeam, awayTeam);
      const fatigue = privateApi.initializeFatigue(homeTeam, awayTeam);
      const config = createSimulationConfig();

      let capturedGoalkeeper: Player | undefined;
      const originalCalculateShotSuccess = privateApi.calculateShotSuccess;
      privateApi.calculateShotSuccess = (_shooter: Player, goalkeeper: Player | undefined) => {
        capturedGoalkeeper = goalkeeper;
        return { goal: false, onTarget: true };
      };

      privateApi.handleShot(
        state,
        { type: EventType.SHOT, player: shooter },
        homeTeam,
        awayTeam,
        tactics,
        fatigue,
        12,
        config
      );

      expect(capturedGoalkeeper).toBeDefined();
      expect(capturedGoalkeeper?.id).toBe('away_gk1');

      const saveEvent = state.events[state.events.length - 1];
      expect(saveEvent.type).toBe(EventType.SAVE);
      expect(saveEvent.playerIds).toContain(shooter.id);
      expect(saveEvent.playerIds).toContain('away_gk1');

      privateApi.calculateShotSuccess = originalCalculateShotSuccess;
    });

    it('should pass undefined goalkeeper to shot calculation when goalkeeper slot is unassigned', () => {
      const homeTeam = { ...mockTeam442 };
      const awayTeam = {
        ...mockTeam442,
        id: 'team_away_unassigned',
        formationAssignments: {
          ...mockTeam442.formationAssignments,
          gk_1: ''
        }
      };

      const shooter = resolveTeamPlayers(homeTeam).find(p => p.id === 'fwd1')!;
      const state = createShotTestState(homeTeam.id, shooter.id);

      const tactics = privateApi.calculateTeamTactics(homeTeam, awayTeam);
      const fatigue = privateApi.initializeFatigue(homeTeam, awayTeam);
      const config = createSimulationConfig();

      let capturedGoalkeeper: Player | undefined;
      const originalCalculateShotSuccess = privateApi.calculateShotSuccess;
      privateApi.calculateShotSuccess = (_shooter: Player, goalkeeper: Player | undefined) => {
        capturedGoalkeeper = goalkeeper;
        return { goal: false, onTarget: true };
      };

      privateApi.handleShot(
        state,
        { type: EventType.SHOT, player: shooter },
        homeTeam,
        awayTeam,
        tactics,
        fatigue,
        13,
        config
      );

      expect(capturedGoalkeeper).toBeUndefined();

      const saveEvent = state.events[state.events.length - 1];
      expect(saveEvent.type).toBe(EventType.SAVE);
      expect(saveEvent.playerIds).toEqual([shooter.id]);

      privateApi.calculateShotSuccess = originalCalculateShotSuccess;
    });
  });

  describe('Field Utility Access', () => {
    it('should access field zone determination', () => {
      const defensiveZone = fieldService.getZoneFromY(25);
      const midfieldZone = fieldService.getZoneFromY(50);
      const attackZone = fieldService.getZoneFromY(75);

      expect(defensiveZone).toBe(FieldZone.DEFENSE);
      expect(midfieldZone).toBe(FieldZone.MIDFIELD);
      expect(attackZone).toBe(FieldZone.ATTACK);
    });

    it('should calculate distances correctly', () => {
      const coord1 = { x: 50, y: 50 };
      const coord2 = { x: 50, y: 100 };
      const distance = fieldService.getDistance(coord1, coord2);

      expect(distance).toBeGreaterThan(50);
    });

    it('should check penalty area correctly', () => {
      expect(fieldService.isInPenaltyArea({ x: 50, y: 90 })).toBe(true);
      expect(fieldService.isInPenaltyArea({ x: 50, y: 50 })).toBe(false);
    });
  });

  describe('Complete Formation Workflows', () => {
    it('should validate and execute simulation with 4-4-2', () => {
      const validation = fieldService.validateFormationAssignments(mockTeam442);
      expect(validation.isValid).toBe(true);

      // Try to access goalkeeper
      const gk = privateApi.getGoalkeeperForTeam(mockTeam442);
      expect(gk).toBeDefined();

      // Get tactics
      const tactics = fieldService.calculateTeamTactics(mockTeam442);
      expect(tactics).toBeDefined();
    });

    it('should handle team with incomplete formation gracefully', () => {
      const incompleteTeam = {
        ...mockTeam442,
        formationAssignments: {
          gk_1: 'gk1'
          // Missing other slots
        }
      };

      const validation = fieldService.validateFormationAssignments(incompleteTeam);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should work with user-defined formations', () => {
      const base442 = formationLibrary.getFormationById('formation_4_4_2')!;
      formationLibrary.registerUserFormation({
        id: 'user_test_sim',
        name: 'Test Simulation Formation',
        shortCode: 'TST',
        isUserDefined: true,
        createdAt: Date.now(),
        slots: base442.slots
      });

      const userFormationTeam = {
        ...mockTeam442,
        selectedFormationId: 'user_test_sim'
      };

      const validation = fieldService.validateFormationAssignments(userFormationTeam);
      expect(validation.isValid).toBe(true);

      const gk = privateApi.getGoalkeeperForTeam(userFormationTeam);
      expect(gk).toBeDefined();
    });
  });

  describe('Multi-Formation Consistency', () => {
    it('should consistently resolve goalkeeper across multiple formation switches', () => {
      // Start with 4-4-2
      const gk442 = privateApi.getGoalkeeperForTeam(mockTeam442);
      expect(gk442?.id).toBe('gk1');

      // Create a custom formation with same slots
      const base442 = formationLibrary.getFormationById('formation_4_4_2')!;
      formationLibrary.registerUserFormation({
        id: 'user_copy_442',
        name: 'Copy of 4-4-2',
        shortCode: 'CP1',
        isUserDefined: true,
        createdAt: Date.now(),
        slots: base442.slots
      });

      // Switch team to custom formation
      const customTeam = {
        ...mockTeam442,
        selectedFormationId: 'user_copy_442'
      };

      const gkCustom = privateApi.getGoalkeeperForTeam(customTeam);
      expect(gkCustom?.id).toBe('gk1');

      // Both should be the same
      expect(gk442?.id).toBe(gkCustom?.id);
    });

    it('should validate assignments correctly for multiple formations', () => {
      const base442 = formationLibrary.getFormationById('formation_4_4_2')!;
      formationLibrary.registerUserFormation({
        id: 'user_multi_test',
        name: 'Multi Test',
        shortCode: 'MLT',
        isUserDefined: true,
        createdAt: Date.now(),
        slots: base442.slots
      });

      // Validate with original formation
      const val1 = fieldService.validateFormationAssignments(mockTeam442);
      expect(val1.isValid).toBe(true);

      // Validate with new formation (but keep same assignments)
      const team2 = {
        ...mockTeam442,
        selectedFormationId: 'user_multi_test'
      };
      const val2 = fieldService.validateFormationAssignments(team2);
      expect(val2.isValid).toBe(true);

      // Both should be valid with same assignments
      expect(val1.isValid).toBe(val2.isValid);
    });
  });

  describe('Simulation Performance Guardrails', () => {
    it('should avoid repeatedly resolving team players during a full match simulation', () => {
      const awayPlayers = mockPlayers.map(p => ({
        ...p,
        id: `away_${p.id}`,
        teamId: 'team_away_perf'
      }));
      const awayTeam = {
        ...createMockTeam('team_away_perf', awayPlayers, 'formation_4_4_2'),
        formationAssignments: {
          gk_1: 'away_gk1',
          def_l: 'away_def1',
          def_lc: 'away_def2',
          def_rc: 'away_def3',
          def_r: 'away_def4',
          mid_l: 'away_mid1',
          mid_lc: 'away_mid2',
          mid_rc: 'away_mid3',
          mid_r: 'away_mid4',
          att_l: 'away_fwd1',
          att_r: 'away_fwd2'
        }
      };

      const match = {
        id: 'perf_match_1',
        week: 1,
        homeTeamId: mockTeam442.id,
        awayTeamId: awayTeam.id,
        played: false
      };

      simulationService.simulateMatch(match, mockTeam442, awayTeam);

      // Full match simulation should resolve both team rosters once up front,
      // then reuse cached arrays across minute/action helpers.
      expect(privateApi.getLastSimulationRosterResolveCount()).toBeLessThanOrEqual(2);
    });
  });

  /* Helper functions */
  function createShotTestState(teamId: string, shooterId: string): MatchState {
    return {
      ballPossession: {
        teamId,
        playerWithBall: shooterId,
        location: { x: 50, y: 85 },
        phase: MatchPhase.ATTACKING,
        passes: 0,
        timeElapsed: 0
      },
      events: [],
      currentMinute: 1,
      homeScore: 0,
      awayScore: 0,
      homeShots: 0,
      awayShots: 0,
      homeShotsOnTarget: 0,
      awayShotsOnTarget: 0,
      homePossession: 50,
      awayPossession: 50,
      homeCorners: 0,
      awayCorners: 0,
      homeFouls: 0,
      awayFouls: 0,
      homeYellowCards: 0,
      awayYellowCards: 0,
      homeRedCards: 0,
      awayRedCards: 0
    };
  }

  function createSimulationConfig(): SimulationConfig {
    return {
      enablePlayByPlay: true,
      enableSpatialTracking: true,
      enableTactics: true,
      enableFatigue: true,
      commentaryStyle: CommentaryStyle.DETAILED
    };
  }

  function createMockPlayer(
    id: string,
    name: string,
    position: PositionEnum,
    role: Role,
    skill: number
  ): Player {
    return {
      id,
      name,
      teamId: 'team_442',
      position,
      role,
      personal: { height: 185, weight: 82, age: 28, nationality: 'English' },
      physical: { speed: skill, strength: skill, endurance: skill },
      mental: { flair: skill, vision: skill, determination: skill },
      skills: {
        tackling: skill,
        shooting: skill,
        heading: skill,
        longPassing: skill,
        shortPassing: skill,
        goalkeeping: skill
      },
      hidden: { luck: 50, injuryRate: 5 },
      overall: skill,
      careerStats: {
        matchesPlayed: 50,
        goals: 5,
        assists: 3,
        yellowCards: 2,
        redCards: 0,
        shots: 40,
        shotsOnTarget: 20,
        tackles: 100,
        interceptions: 50,
        passes: 500,
        saves: 0,
        cleanSheets: 0,
        minutesPlayed: 4500
      }
    };
  }

  function createMockTeam(id: string, players: Player[], formationId: string): Team {
    return {
      id,
      name: 'Mock Team',
      players,
      playerIds: players.map(player => player.id),
      selectedFormationId: formationId,
      formationAssignments: {
        gk_1: 'gk1',
        def_l: 'def1',
        def_lc: 'def2',
        def_rc: 'def3',
        def_r: 'def4',
        mid_l: 'mid1',
        mid_lc: 'mid2',
        mid_rc: 'mid3',
        mid_r: 'mid4',
        att_l: 'fwd1',
        att_r: 'fwd2'
      },
      stats: {
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        last5: []
      }
    };
  }
});
