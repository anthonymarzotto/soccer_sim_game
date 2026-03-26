import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PersistenceService } from './persistence.service';
import { AppDbService } from './app-db.service';

describe('PersistenceService', () => {
  let service: PersistenceService;
  let appDbSpy: Pick<AppDbService, 'getState' | 'putState' | 'deleteState'>;

  beforeEach(() => {
    appDbSpy = {
      getState: vi.fn(),
      putState: vi.fn(),
      deleteState: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        PersistenceService,
        { provide: AppDbService, useValue: appDbSpy as AppDbService }
      ]
    });

    service = TestBed.inject(PersistenceService);
  });

  it('should load and save league using the league key', async () => {
    const league = { teams: [], schedule: [], currentWeek: 1 };
    vi.mocked(appDbSpy.getState).mockResolvedValue(league);

    const loaded = await service.loadLeague();
    await service.saveLeague(league);

    expect(appDbSpy.getState).toHaveBeenCalledWith('league-state');
    expect(loaded).toEqual(league);
    expect(appDbSpy.putState).toHaveBeenCalledWith('league-state', league);
  });

  it('should load and save settings using the settings key', async () => {
    const settings = { badgeStyle: 'shield' };
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

  it('should clear persisted league and selected week keys', async () => {
    await service.clearLeague();
    await service.clearSettings();
    await service.clearSelectedWeek();

    expect(appDbSpy.deleteState).toHaveBeenCalledWith('league-state');
    expect(appDbSpy.deleteState).toHaveBeenCalledWith('app-settings');
    expect(appDbSpy.deleteState).toHaveBeenCalledWith('schedule-selected-week');
  });
});
