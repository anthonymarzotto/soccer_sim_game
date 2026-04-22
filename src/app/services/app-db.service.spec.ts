import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

const appStateGetMock = vi.fn();
const appStatePutMock = vi.fn();
const appStateDeleteMock = vi.fn();

import { AppDbService } from './app-db.service';

describe('AppDbService', () => {
  interface AppDbServiceTestAccess {
    initializeDb: () => Promise<unknown>;
  }

  function createMockDb() {
    return {
      appState: {
        get: appStateGetMock,
        put: appStatePutMock,
        delete: appStateDeleteMock
      }
    } as unknown;
  }

  function spyOnInitializeDb(service: AppDbService) {
    return vi
      .spyOn(service as unknown as AppDbServiceTestAccess, 'initializeDb')
      .mockResolvedValue(createMockDb());
  }

  function setup(platformId: 'browser' | 'server') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AppDbService,
        { provide: PLATFORM_ID, useValue: platformId }
      ]
    });

    return TestBed.inject(AppDbService);
  }

  function setIndexedDbAvailable(available: boolean) {
    if (available) {
      vi.stubGlobal('indexedDB', {});
      return;
    }

    vi.stubGlobal('indexedDB', undefined);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    appStateGetMock.mockResolvedValue(null);
    appStatePutMock.mockResolvedValue(undefined);
    appStateDeleteMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('returns null and no-ops when running on server', async () => {
    setIndexedDbAvailable(true);
    const service = setup('server');

    const result = await service.getState('league-state');
    await service.putState('league-state', { week: 1 });
    await service.deleteState('league-state');

    expect(result).toBeNull();
    expect(appStateGetMock).not.toHaveBeenCalled();
    expect(appStatePutMock).not.toHaveBeenCalled();
    expect(appStateDeleteMock).not.toHaveBeenCalled();
  });

  it('returns null and no-ops when indexedDB is unavailable in browser', async () => {
    setIndexedDbAvailable(false);
    const service = setup('browser');

    const result = await service.getState('league-state');
    await service.putState('league-state', { week: 1 });
    await service.deleteState('league-state');

    expect(result).toBeNull();
    expect(appStateGetMock).not.toHaveBeenCalled();
    expect(appStatePutMock).not.toHaveBeenCalled();
    expect(appStateDeleteMock).not.toHaveBeenCalled();
  });

  it('opens Dexie only once and caches the db instance', async () => {
    const service = setup('browser');
    const initializeDbSpy = spyOnInitializeDb(service);

    appStateGetMock.mockResolvedValue({ key: 'k1', value: 'v1', updatedAt: 1 });

    const firstResult = await service.getState<string>('k1');
    const secondResult = await service.getState<string>('k1');

    expect(firstResult).toBe('v1');
    expect(secondResult).toBe('v1');
    expect(initializeDbSpy).toHaveBeenCalledTimes(1);
    expect(appStateGetMock).toHaveBeenCalledTimes(2);
  });

  it('uses Dexie appState get/put/delete APIs in browser', async () => {
    const service = setup('browser');
    const initializeDbSpy = spyOnInitializeDb(service);

    appStateGetMock.mockResolvedValue({ key: 'settings', value: { badgeStyle: 'shield' }, updatedAt: 123 });

    const value = await service.getState<{ badgeStyle: string }>('settings');
    await service.putState('settings', { badgeStyle: 'jersey' });
    await service.deleteState('settings');

    expect(value).toEqual({ badgeStyle: 'shield' });
    expect(initializeDbSpy).toHaveBeenCalledTimes(1);
    expect(appStateGetMock).toHaveBeenCalledWith('settings');
    expect(appStatePutMock).toHaveBeenCalledTimes(1);

    const putArg = appStatePutMock.mock.calls[0][0] as {
      key: string;
      value: { badgeStyle: string };
      updatedAt: number;
    };

    expect(putArg.key).toBe('settings');
    expect(putArg.value).toEqual({ badgeStyle: 'jersey' });
    expect(typeof putArg.updatedAt).toBe('number');
    expect(appStateDeleteMock).toHaveBeenCalledWith('settings');
  });
});
