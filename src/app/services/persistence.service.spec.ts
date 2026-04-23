import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { PersistenceService } from './persistence.service';
import { AppDbService } from './app-db.service';
import { NormalizedDbService } from './normalized-db.service';
import { DataSchemaVersionService } from './data-schema-version.service';
import { MatchResult, Position, Role } from '../models/enums';
import { Match, Team } from '../models/types';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';
import { createTestPlayer } from '../testing/test-player-fixtures';

describe('PersistenceService', () => {
  let service: PersistenceService;
  let appDbSpy: Pick<AppDbService, 'getState' | 'putState' | 'deleteState'>;

  function createTeam(id: string): Team {
    return {
      id,
      name: `Team ${id}`,
      players: [
        (() => {
          const p = createTestPlayer({
            id: `${id}-p1`,
            name: `Player ${id}`,
            teamId: id,
            position: Position.GOALKEEPER,
            role: Role.STARTER,
            age: 29, height: 190, weight: 84, nationality: 'ENG',
            seasonYear: 2026,
            stats: { speed: 50, strength: 80, endurance: 75, flair: 40, vision: 70, determination: 80, tackling: 20, shooting: 15, heading: 35, longPassing: 55, shortPassing: 62, goalkeeping: 88, luck: 50, injuryRate: 8, overall: 78 }
          });
          p.careerStats = [createEmptyPlayerCareerStats(2026, id)];
          return p;
        })()
      ],
      playerIds: [`${id}-p1`],
      stats: {
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        last5: [MatchResult.DRAW]
      },
      selectedFormationId: 'formation_4_4_2',
      formationAssignments: { gk_1: `${id}-p1` }
    };
  }

  function createMatch(): Match {
    return {
      id: 'match-1',
      week: 1,
      homeTeamId: 'team-1',
      awayTeamId: 'team-2',
      played: true,
      homeScore: 1,
      awayScore: 0
    };
  }

  let normalizedDbSpy: Pick<
    NormalizedDbService,
    'loadLeague' | 'saveLeague' | 'clearLeagueData' | 'saveLeagueMetadata' | 'saveTeamFromLeague' | 'saveTeamDefinitionFromLeague' | 'saveMatch' | 'saveMatchResultFromLeague'
  >;
  let dataSchemaVersionSpy: Pick<DataSchemaVersionService, 'ensureHydrated' | 'hasPersistedDataSchemaVersionMismatch'>;
  let hasSchemaMismatch: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    appDbSpy = {
      getState: vi.fn(),
      putState: vi.fn(),
      deleteState: vi.fn()
    };

    normalizedDbSpy = {
      loadLeague: vi.fn(),
      saveLeague: vi.fn(),
      clearLeagueData: vi.fn(),
      saveLeagueMetadata: vi.fn(),
      saveTeamFromLeague: vi.fn(),
      saveTeamDefinitionFromLeague: vi.fn(),
      saveMatch: vi.fn(),
      saveMatchResultFromLeague: vi.fn()
    };

    hasSchemaMismatch = signal(false);

    dataSchemaVersionSpy = {
      ensureHydrated: vi.fn().mockResolvedValue(undefined),
      hasPersistedDataSchemaVersionMismatch: hasSchemaMismatch.asReadonly()
    };

    TestBed.configureTestingModule({
      providers: [
        PersistenceService,
        { provide: AppDbService, useValue: appDbSpy as AppDbService },
        { provide: NormalizedDbService, useValue: normalizedDbSpy as NormalizedDbService },
        { provide: DataSchemaVersionService, useValue: dataSchemaVersionSpy as DataSchemaVersionService }
      ]
    });

    service = TestBed.inject(PersistenceService);
  });

  it('should load and save league using normalized persistence', async () => {
    const league = { teams: [], schedule: [], currentWeek: 1, currentSeasonYear: 2026 };
    vi.mocked(normalizedDbSpy.loadLeague).mockResolvedValue(league);

    const loaded = await service.loadLeague();
    await service.saveLeague(league);

    expect(normalizedDbSpy.loadLeague).toHaveBeenCalledTimes(1);
    expect(loaded).toEqual(league);
    expect(normalizedDbSpy.saveLeague).toHaveBeenCalledWith(league);
  });

  it('should load and save settings using the settings key', async () => {
    const settings = { version: '0.1.0-alpha.data.1', badgeStyle: 'shield' };
    vi.mocked(appDbSpy.getState).mockResolvedValue(settings);

    const loaded = await service.loadSettings();
    await service.saveSettings(settings);

    expect(appDbSpy.getState).toHaveBeenCalledWith('app-settings');
    expect(loaded).toEqual(settings);
    expect(appDbSpy.putState).toHaveBeenCalledWith('app-settings', settings);
  });

  it('should load and save selected week using the week key', async () => {
    vi.mocked(appDbSpy.getState).mockResolvedValue(7);

    const loaded = await service.loadSelectedWeek();
    await service.saveSelectedWeek(5);

    expect(appDbSpy.getState).toHaveBeenCalledWith('schedule-selected-week');
    expect(loaded).toBe(7);
    expect(appDbSpy.putState).toHaveBeenCalledWith('schedule-selected-week', 5);
  });

  it('should clear normalized league data and key-value app state entries', async () => {
    await service.clearLeague();
    await service.clearSettings();
    await service.clearSelectedWeek();

    expect(normalizedDbSpy.clearLeagueData).toHaveBeenCalledTimes(1);
    expect(appDbSpy.deleteState).toHaveBeenCalledWith('app-settings');
    expect(appDbSpy.deleteState).toHaveBeenCalledWith('schedule-selected-week');
  });

  it('should queue normalized writes in order', async () => {
    let releaseFirstWrite: (() => void) | undefined;
    vi.mocked(normalizedDbSpy.saveTeamFromLeague)
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            releaseFirstWrite = resolve;
          })
      )
      .mockResolvedValueOnce(undefined);

    const firstWrite = service.saveTeam(createTeam('team-1'));
    const secondWrite = service.saveTeam(createTeam('team-2'));

    for (let attempt = 0; attempt < 10 && !releaseFirstWrite; attempt += 1) {
      await Promise.resolve();
    }

    expect(releaseFirstWrite).toBeDefined();
    expect(normalizedDbSpy.saveTeamFromLeague).toHaveBeenCalledTimes(1);
    expect(normalizedDbSpy.saveTeamFromLeague).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'team-1' }));

    releaseFirstWrite?.();
    await firstWrite;
    await secondWrite;

    expect(normalizedDbSpy.saveTeamFromLeague).toHaveBeenCalledTimes(2);
    expect(normalizedDbSpy.saveTeamFromLeague).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'team-2' }));
  });

  it('should delegate atomic match-result saves to normalized persistence', async () => {
    const match = createMatch();
    const teams = [createTeam('team-1'), createTeam('team-2')];

    await service.saveMatchResult(match, teams);

    expect(normalizedDbSpy.saveMatchResultFromLeague).toHaveBeenCalledWith(match, teams);
  });

  it('should block mutating writes when persisted schema version mismatches', async () => {
    hasSchemaMismatch.set(true);

    await service.saveSettings({ version: '0.1.0-alpha.data.1', badgeStyle: 'shield' });
    await service.saveSelectedWeek(4);
    await service.saveLeague({ teams: [], schedule: [], currentWeek: 1, currentSeasonYear: 2026 });

    expect(dataSchemaVersionSpy.ensureHydrated).toHaveBeenCalled();
    expect(appDbSpy.putState).not.toHaveBeenCalled();
    expect(normalizedDbSpy.saveLeague).not.toHaveBeenCalled();
  });
});
