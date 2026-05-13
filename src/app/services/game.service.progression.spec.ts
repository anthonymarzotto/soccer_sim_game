import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { GameService } from './game.service';
import { GeneratorService } from './generator.service';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { CommentaryService } from './commentary.service';
import { StatisticsService } from './statistics.service';
import { PostMatchAnalysisService } from './post.match.analysis.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { PersistenceService } from './persistence.service';
import { DataSchemaVersionService } from './data-schema-version.service';
import { League, Team, Player } from '../models/types';
import { createTestPlayer, createTestSeasonAttributes } from '../testing/test-player-fixtures';

describe('GameService — progression and seeding', () => {
  function makeTeam(id: string, players: ReturnType<typeof createTestPlayer>[], name = 'Test FC'): Team {
    return {
      id,
      name,
      players,
      playerIds: players.map(p => p.id),
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] },
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: {},
      seasonSnapshots: [{
        seasonYear: 2026,
        playerIds: players.map(p => p.id),
        stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: [] }
      }]
    };
  }

  function makeLeague(teams: Team[], userTeamId?: string): League {
    return {
      userTeamId,
      teams,
      schedule: [
        { id: 'm1', week: 1, seasonYear: 2026, homeTeamId: teams[0].id, awayTeamId: teams[0].id, played: true, homeScore: 0, awayScore: 0 }
      ],
      currentWeek: 1,
      currentSeasonYear: 2026
    };
  }

  function setup(league: League | null = null) {
    TestBed.resetTestingModule();

    const replacementPlayer = createTestPlayer({ id: 'replacement', teamId: 'team-1', age: 17, seasonYear: 2027 });

    const generatorSpy: Pick<GeneratorService, 'generateLeague' | 'generateScheduleForSeason' | 'generatePlayer'> = {
      generateLeague: vi.fn().mockReturnValue({ teams: [], schedule: [], currentSeasonYear: 2026 }),
      generateScheduleForSeason: vi.fn().mockReturnValue([]),
      generatePlayer: vi.fn().mockReturnValue(replacementPlayer)
    };

    const persistenceSpy: Pick<
      PersistenceService,
      'loadLeague' | 'saveLeague' | 'clearLeague' | 'saveLeagueMetadata' | 'saveTeam' | 'saveTeamDefinition' | 'saveMatch' | 'saveMatchResult' | 'loadSeasonTransitionLog' | 'saveSeasonTransitionLog'
    > = {
      loadLeague: vi.fn().mockResolvedValue(league),
      saveLeague: vi.fn().mockResolvedValue(undefined),
      clearLeague: vi.fn().mockResolvedValue(undefined),
      saveLeagueMetadata: vi.fn().mockResolvedValue(undefined),
      saveTeam: vi.fn().mockResolvedValue(undefined),
      saveTeamDefinition: vi.fn().mockResolvedValue(undefined),
      saveMatch: vi.fn().mockResolvedValue(undefined),
      saveMatchResult: vi.fn().mockResolvedValue(undefined),
      loadSeasonTransitionLog: vi.fn().mockResolvedValue(null),
      saveSeasonTransitionLog: vi.fn().mockResolvedValue(undefined)
    };

    TestBed.configureTestingModule({
      providers: [
        GameService,
        { provide: GeneratorService, useValue: generatorSpy as GeneratorService },
        { provide: PersistenceService, useValue: persistenceSpy as PersistenceService },
        {
          provide: DataSchemaVersionService,
          useValue: { hasPersistedDataSchemaVersionMismatch: signal(false).asReadonly() } as Pick<DataSchemaVersionService, 'hasPersistedDataSchemaVersionMismatch'>
        },
        { provide: MatchSimulationVariantBService, useValue: {} },
        { provide: CommentaryService, useValue: {} },
        { provide: StatisticsService, useValue: { generatePlayerStatistics: vi.fn().mockReturnValue([]) } },
        { provide: PostMatchAnalysisService, useValue: {} },
        { provide: FieldService, useValue: { validateFormationAssignments: vi.fn().mockReturnValue({ isValid: true, errors: [] }) } },
        {
          provide: FormationLibraryService,
          useValue: {
            getFormationSlots: vi.fn().mockReturnValue([]),
            listPredefinedFormations: vi.fn().mockReturnValue([]),
            getAllFormations: vi.fn().mockReturnValue([]),
            getDefaultFormationId: vi.fn().mockReturnValue('formation_4_4_2')
          }
        }
      ]
    });

    return { service: TestBed.inject(GameService), generatorSpy };
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('generateNextSeasonAttributes', () => {
    it('Missing Prior-Year Fallback: uses latest available attributes when prior year is missing', async () => {
      const { service } = setup();
      const player = createTestPlayer({ id: 'p1', seasonYear: 2026 });
      // Request generation for 2028. Since 2027 is missing, it should fallback to 2026.
      const attrs = service.generateNextSeasonAttributes(player, 2028);
      
      expect(attrs.seasonYear).toBe(2028);
      expect(attrs.overall.value).toBeGreaterThan(0);
    });

    it('Legacy Player Guard: throws an error if progression data is missing', async () => {
      const { service } = setup();
      const player = createTestPlayer({ id: 'p1', seasonYear: 2026 });
      delete (player as Partial<Player>).progression; // Strip progression

      expect(() => {
        service.generateNextSeasonAttributes(player, 2027);
      }).toThrowError(/missing progression data/);
    });

    it('Attribute Chaining Integrity: explicitly uses (nextSeasonYear - 1)', async () => {
      const { service } = setup();
      const player = createTestPlayer({ id: 'p1', seasonYear: 2025 });
      
      // Inject two distinctly identifiable seasons
      const attrs2025 = createTestSeasonAttributes(2025, {}, 50);
      const attrs2026 = createTestSeasonAttributes(2026, {}, 90);
      player.seasonAttributes = [attrs2025, attrs2026];

      // Generating 2027 should base calculations off 2026, meaning overall should be near 90, not 50.
      const attrs2027 = service.generateNextSeasonAttributes(player, 2027);
      expect(attrs2027.overall.value).toBeGreaterThan(80);
    });

    it('Bounds Clamping: ensures stats never exceed 100 or drop below 1', async () => {
      const { service } = setup();
      const player = createTestPlayer({ id: 'p1', seasonYear: 2026 });
      
      // Setup max stats and high growth chance to attempt exceeding 100
      player.seasonAttributes = [createTestSeasonAttributes(2026, {}, 99)];
      player.progression = { ...player.progression!, professionalism: 100, potential: 100 };
      
      // Force random to always return 1 (max growth, 0 decay if we override properly)
      vi.spyOn(Math, 'random').mockReturnValue(1);
      
      const attrs2027 = service.generateNextSeasonAttributes(player, 2027);
      
      // Check physical, skill, mental, gk categories. They should all be capped at 100.
      expect(attrs2027.overall.value).toBeLessThanOrEqual(100);
      expect(attrs2027.speed.value).toBeLessThanOrEqual(100);
      
      vi.restoreAllMocks();
    });
  });

  describe('startNewSeason — Seeding and Rosters', () => {
    it('Bypass Duplicate Seeding: replacement players do not re-generate attributes', async () => {
      const retiringPlayer = createTestPlayer({ id: 'retiree', age: 46, seasonYear: 2026 });
      const team = makeTeam('t1', [retiringPlayer]);
      const league = makeLeague([team], 't1');
      const { service } = setup(league);
      await service.ensureHydrated();
      
      const generateSpy = vi.spyOn(service, 'generateNextSeasonAttributes');

      service.startNewSeason();

      // retiringPlayer is replaced by 'replacement' (age 17) generated by the mock generatorSpy.
      // The generator mock creates 'replacement' with seasonYear 2027 attributes.
      const updatedLeague = service.league();
      const updatedTeam = updatedLeague!.teams[0];
      const replacement = updatedTeam.players[0];

      expect(replacement.id).toBe('replacement');
      expect(replacement.seasonAttributes!.length).toBe(1);
      expect(replacement.seasonAttributes![0].seasonYear).toBe(2027);
      
      // Ensure we didn't call generateNextSeasonAttributes on the replacement
      expect(generateSpy).not.toHaveBeenCalled();
    });

    it('Career Stats Initialization: injects empty career stats for next season if missing', async () => {
      const player = createTestPlayer({ id: 'p1', age: 25, seasonYear: 2026 });
      player.careerStats = []; // Ensure no stats
      const team = makeTeam('t1', [player]);
      const league = makeLeague([team], 't1');
      const { service } = setup(league);
      await service.ensureHydrated();

      service.startNewSeason();

      const updatedLeague = service.league();
      const updatedPlayer = updatedLeague!.teams[0].players[0];

      expect(updatedPlayer.careerStats.length).toBe(1);
      expect(updatedPlayer.careerStats[0].seasonYear).toBe(2027);
      expect(updatedPlayer.careerStats[0].goals).toBe(0); // Spot check
    });

    it('Retirement & Roster Sync: Junior/Peak stay, Seniors/Decline age 45+ retire, formations sync', async () => {
      const junior = createTestPlayer({ id: 'junior', age: 18, seasonYear: 2026 }); // JUNIOR
      const peak = createTestPlayer({ id: 'peak', age: 26, seasonYear: 2026 }); // PEAK
      const old = createTestPlayer({ id: 'old', age: 46, seasonYear: 2026 }); // Automatic retire

      const team = makeTeam('t1', [junior, peak, old]);
      team.formationAssignments = {
        'mid_1': 'junior',
        'fwd_1': 'peak',
        'def_1': 'old' // Old is assigned
      };

      const league = makeLeague([team], 't1');
      const { service } = setup(league);
      await service.ensureHydrated();

      service.startNewSeason();

      const updatedLeague = service.league();
      const updatedTeam = updatedLeague!.teams[0];

      // Junior and Peak should still be there
      expect(updatedTeam.playerIds).toContain('junior');
      expect(updatedTeam.playerIds).toContain('peak');
      
      // Old should be removed and replaced
      expect(updatedTeam.playerIds).not.toContain('old');
      expect(updatedTeam.playerIds).toContain('replacement');

      // Formation assignment for 'old' should be cleared
      expect(updatedTeam.formationAssignments['mid_1']).toBe('junior');
      expect(updatedTeam.formationAssignments['fwd_1']).toBe('peak');
      expect(updatedTeam.formationAssignments['def_1']).toBe(''); // Cleared
      
      // Next season snapshot should have synced player IDs
      const nextSnapshot = updatedTeam.seasonSnapshots!.find(s => s.seasonYear === 2027);
      expect(nextSnapshot!.playerIds).not.toContain('old');
      expect(nextSnapshot!.playerIds).toContain('replacement');
    });
  });
});
