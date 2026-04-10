import { TestBed } from '@angular/core/testing';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { Team, Player } from '../models/types';
import { Role, Position as PositionEnum, FieldZone } from '../models/enums';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';

describe('FieldService - Schema-Driven Formation Logic', () => {
  let fieldService: FieldService;
  let formationLibrary: FormationLibraryService;
  let mockTeam: Team;
  let mockPlayers: Player[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FieldService, FormationLibraryService]
    });

    fieldService = TestBed.inject(FieldService);
    formationLibrary = TestBed.inject(FormationLibraryService);

    // Create mock players
    mockPlayers = [
      createMockPlayer('p1', 'Keeper', PositionEnum.GOALKEEPER, Role.STARTER),
      createMockPlayer('p2', 'LeftBack', PositionEnum.DEFENDER, Role.STARTER),
      createMockPlayer('p3', 'LCB', PositionEnum.DEFENDER, Role.STARTER),
      createMockPlayer('p4', 'RCB', PositionEnum.DEFENDER, Role.STARTER),
      createMockPlayer('p5', 'RightBack', PositionEnum.DEFENDER, Role.STARTER),
      createMockPlayer('p6', 'LeftMid', PositionEnum.MIDFIELDER, Role.STARTER),
      createMockPlayer('p7', 'LCM', PositionEnum.MIDFIELDER, Role.STARTER),
      createMockPlayer('p8', 'RCM', PositionEnum.MIDFIELDER, Role.STARTER),
      createMockPlayer('p9', 'RightMid', PositionEnum.MIDFIELDER, Role.STARTER),
      createMockPlayer('p10', 'LeftStriker', PositionEnum.FORWARD, Role.STARTER),
      createMockPlayer('p11', 'RightStriker', PositionEnum.FORWARD, Role.STARTER),
      createMockPlayer('p12', 'BenchPlayer', PositionEnum.MIDFIELDER, Role.BENCH)
    ];

    // Create mock team with 4-4-2 formation
    mockTeam = createMockTeam('team_1', mockPlayers);
  });

  describe('Formation Slots', () => {
    it('should return 11 slots for 4-4-2 formation', () => {
      const slots = fieldService.getFormationSlots(mockTeam);
      expect(slots.length).toBe(11);
    });

    it('should return slots with correct properties', () => {
      const slots = fieldService.getFormationSlots(mockTeam);
      expect(slots[0].slotId).toBe('gk_1');
      expect(slots[0].position).toBe(PositionEnum.GOALKEEPER);
      expect(slots[0].label).toBe('Goalkeeper');
    });

    it('should return empty array for invalid formation ID', () => {
      const team = { ...mockTeam, selectedFormationId: 'invalid' };
      const slots = fieldService.getFormationSlots(team);
      expect(slots.length).toBe(0);
    });
  });

  describe('Formation Validation', () => {
    it('should validate correctly formed assignment', () => {
      const { isValid, errors } = fieldService.validateFormationAssignments(mockTeam);
      expect(isValid).toBe(true);
      expect(errors.length).toBe(0);
    });

    it('should reject missing starter assignment', () => {
      const team = {
        ...mockTeam,
        formationAssignments: {
          ...mockTeam.formationAssignments,
          gk_1: '' // Missing goalkeeper
        }
      };

      const { isValid, errors } = fieldService.validateFormationAssignments(team);
      expect(isValid).toBe(false);
      expect(errors.some(e => e.includes('Missing'))).toBe(true);
    });

    it('should reject non-starter in formation', () => {
      const team = {
        ...mockTeam,
        formationAssignments: {
          ...mockTeam.formationAssignments,
          def_l: 'p12' // Bench player
        }
      };

      const { isValid, errors } = fieldService.validateFormationAssignments(team);
      expect(isValid).toBe(false);
      expect(errors.some(e => e.includes('Starter'))).toBe(true);
    });

    it('should reject non-goalkeeper in goalkeeper slot', () => {
      const team = {
        ...mockTeam,
        formationAssignments: {
          ...mockTeam.formationAssignments,
          gk_1: 'p2' // Defender instead of goalkeeper
        }
      };

      const { isValid, errors } = fieldService.validateFormationAssignments(team);
      expect(isValid).toBe(false);
      expect(errors.some(e => e.includes('goalkeeper'))).toBe(true);
    });

    it('should reject duplicate player assignments', () => {
      const team = {
        ...mockTeam,
        formationAssignments: {
          ...mockTeam.formationAssignments,
          def_l: 'p1', // Duplicate goalkeeper
          gk_1: 'p1'
        }
      };

      const { isValid, errors } = fieldService.validateFormationAssignments(team);
      expect(isValid).toBe(false);
      expect(errors.some(e => e.includes('multiple'))).toBe(true);
    });

    it('should reject if assignment references non-existent formation', () => {
      const team = {
        ...mockTeam,
        selectedFormationId: 'nonexistent'
      };

      const { isValid, errors } = fieldService.validateFormationAssignments(team);
      expect(isValid).toBe(false);
      expect(errors.some(e => e.includes('not found'))).toBe(true);
    });
  });

  describe('Team Formation', () => {
    it('should build team formation with assigned players', () => {
      const formation = fieldService.assignPlayersToFormation(mockTeam);
      expect(formation).toBeDefined();
      expect(formation?.positions.length).toBe(11);
      expect(formation?.name).toBe('Classic 4-4-2');
    });

    it('should return null for invalid formation ID', () => {
      const team = { ...mockTeam, selectedFormationId: 'invalid' };
      const formation = fieldService.assignPlayersToFormation(team);
      expect(formation).toBeNull();
    });

    it('should include player IDs in formation positions', () => {
      const formation = fieldService.assignPlayersToFormation(mockTeam);
      const gkPosition = formation?.positions.find(p => p.slotId === 'gk_1');
      expect(gkPosition?.playerId).toBe('p1');
    });
  });

  describe('Tactical Setup', () => {
    it('should calculate team tactics for valid team', () => {
      const tactics = fieldService.calculateTeamTactics(mockTeam);
      expect(tactics).toBeDefined();
      expect(tactics.teamId).toBe('team_1');
      expect(tactics.formation).toBeDefined();
    });

    it('should include playing style and mentality', () => {
      const tactics = fieldService.calculateTeamTactics(mockTeam);
      expect(tactics.playingStyle).toBeDefined();
      expect(tactics.mentality).toBeDefined();
      expect(tactics.pressingIntensity).toBeGreaterThanOrEqual(0);
      expect(tactics.defensiveLine).toBeGreaterThanOrEqual(0);
      expect(tactics.tempo).toBeGreaterThanOrEqual(0);
    });

    it('should fallback to default formation when selected formation is invalid', () => {
      const team = { ...mockTeam, selectedFormationId: 'invalid_formation_id' };

      const tactics = fieldService.calculateTeamTactics(team);

      expect(tactics.formation).toBeDefined();
      expect(tactics.formation.name).toBe('Classic 4-4-2');
      expect(tactics.formation.positions.length).toBe(11);
    });

    it('should return safe empty formation when selected and default formations are unavailable', () => {
      const originalAssignPlayersToFormation = fieldService.assignPlayersToFormation.bind(fieldService);
      (fieldService as FieldService & { assignPlayersToFormation: (team: Team) => null }).assignPlayersToFormation = () => null;

      const tactics = fieldService.calculateTeamTactics(mockTeam);

      expect(tactics.formation).toBeDefined();
      expect(tactics.formation.name).toBe('Unavailable Formation');
      expect(tactics.formation.positions.length).toBe(0);

      (fieldService as FieldService & { assignPlayersToFormation: (team: Team) => ReturnType<FieldService['assignPlayersToFormation']> }).assignPlayersToFormation = originalAssignPlayersToFormation;
    });

    it('should return safe defaults when team roster resolves to empty', () => {
      const emptyTeam = {
        ...mockTeam,
        players: [],
        playerIds: []
      };

      const tactics = fieldService.calculateTeamTactics(emptyTeam);

      expect(tactics.playingStyle).toBeDefined();
      expect(tactics.mentality).toBeDefined();
      expect(tactics.pressingIntensity).toBe(50);
      expect(tactics.defensiveLine).toBe(50);
      expect(tactics.tempo).toBe(50);
      expect(Number.isFinite(tactics.pressingIntensity)).toBe(true);
      expect(Number.isFinite(tactics.tempo)).toBe(true);
    });
  });

  describe('Formation Availability', () => {
    it('should return available formations', () => {
      const formations = fieldService.getAvailableFormations();
      expect(formations.length).toBeGreaterThanOrEqual(1);
      expect(formations.includes('formation_4_4_2')).toBe(true);
    });

    it('should include user-defined formations', () => {
      const base442 = formationLibrary.getFormationById('formation_4_4_2')!;
      formationLibrary.registerUserFormation({
        id: 'user_test_field',
        name: 'Test User Formation',
        shortCode: 'TST',
        isUserDefined: true,
        createdAt: Date.now(),
        slots: base442.slots
      });

      const formations = fieldService.getAvailableFormations();
      expect(formations.includes('user_test_field')).toBe(true);
    });
  });

  describe('Field Utility Methods', () => {
    it('should correctly determine zone from Y coordinate', () => {
      const defensiveZone = fieldService.getZoneFromY(25);
      const midfieldZone = fieldService.getZoneFromY(50);
      const attackZone = fieldService.getZoneFromY(75);

      expect(defensiveZone).toBe(FieldZone.DEFENSE);
      expect(midfieldZone).toBe(FieldZone.MIDFIELD);
      expect(attackZone).toBe(FieldZone.ATTACK);
    });

    it('should calculate realistic field distance', () => {
      const coord1 = { x: 50, y: 10 };
      const coord2 = { x: 50, y: 90 };
      const distance = fieldService.getDistance(coord1, coord2);

      // Y difference of 80 units ≈ 84m on field (105m * 0.8)
      expect(distance).toBeGreaterThan(80);
      expect(distance).toBeLessThan(90);
    });

    it('should detect coordinates in penalty area', () => {
      const inPenalty = { x: 50, y: 90 };
      const outPenalty = { x: 50, y: 50 };

      expect(fieldService.isInPenaltyArea(inPenalty)).toBe(true);
      expect(fieldService.isInPenaltyArea(outPenalty)).toBe(false);
    });

    it('should detect coordinates in six-yard box', () => {
      const inBox = { x: 50, y: 97 };
      const outBox = { x: 50, y: 90 };

      expect(fieldService.isInSixYardBox(inBox)).toBe(true);
      expect(fieldService.isInSixYardBox(outBox)).toBe(false);
    });
  });

  /* Helper functions */
  function createMockPlayer(
    id: string,
    name: string,
    position: PositionEnum,
    role: Role
  ): Player {
    return {
      id,
      name,
      teamId: 'team_1',
      position,
      role,
      personal: { height: 185, weight: 82, age: 28, nationality: 'English' },
      physical: { speed: 75, strength: 80, endurance: 78 },
      mental: { flair: 70, vision: 75, determination: 80 },
      skills: {
        tackling: 75,
        shooting: 70,
        heading: 72,
        longPassing: 75,
        shortPassing: 80,
        goalkeeping: 85
      },
      hidden: { luck: 50, injuryRate: 5 },
      overall: 78,
      careerStats: {
        ...createEmptyPlayerCareerStats(),
        matchesPlayed: 50,
        goals: 5,
        assists: 3,
        yellowCards: 2,
        shots: 40,
        shotsOnTarget: 20,
        tackles: 100,
        interceptions: 50,
        passes: 500,
        minutesPlayed: 4500
      }
    };
  }

  function createMockTeam(id: string, players: Player[]): Team {
    return {
      id,
      name: 'Mock Team',
      players,
      playerIds: players.map(player => player.id),
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: {
        gk_1: 'p1',
        def_l: 'p2',
        def_lc: 'p3',
        def_rc: 'p4',
        def_r: 'p5',
        mid_l: 'p6',
        mid_lc: 'p7',
        mid_rc: 'p8',
        mid_r: 'p9',
        att_l: 'p10',
        att_r: 'p11'
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
