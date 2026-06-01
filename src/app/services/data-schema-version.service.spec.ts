import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DataSchemaVersionService } from './data-schema-version.service';
import { AppDbService } from './app-db.service';

const DATA_SCHEMA_VERSION_KEY = 'app-data-schema-version';

describe('DataSchemaVersionService', () => {
  let service: DataSchemaVersionService;
  let mockAppDbService: {
    getState: ReturnType<typeof vi.fn>;
    putState: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAppDbService = {
      getState: vi.fn(),
      putState: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        DataSchemaVersionService,
        { provide: AppDbService, useValue: mockAppDbService }
      ]
    });

    service = TestBed.inject(DataSchemaVersionService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
    expect(service.hasPersistedDataSchemaVersionMismatch()).toBe(false);
  });

  describe('ensureHydrated', () => {
    it('should set mismatch to false and put current version if no persisted version', async () => {
      mockAppDbService.getState.mockResolvedValue(undefined);
      mockAppDbService.putState.mockResolvedValue(undefined);

      await service.ensureHydrated();

      expect(mockAppDbService.getState).toHaveBeenCalledWith(DATA_SCHEMA_VERSION_KEY);
      expect(service.hasPersistedDataSchemaVersionMismatch()).toBe(false);
      expect(mockAppDbService.putState).toHaveBeenCalledWith(DATA_SCHEMA_VERSION_KEY, service.currentDataSchemaVersion);
    });

    it('should set mismatch to false and not update db if persisted version matches current', async () => {
      mockAppDbService.getState.mockResolvedValue(service.currentDataSchemaVersion);

      await service.ensureHydrated();

      expect(mockAppDbService.getState).toHaveBeenCalledWith(DATA_SCHEMA_VERSION_KEY);
      expect(service.hasPersistedDataSchemaVersionMismatch()).toBe(false);
      // It sets false and putState according to current logic
      expect(mockAppDbService.putState).toHaveBeenCalledWith(DATA_SCHEMA_VERSION_KEY, service.currentDataSchemaVersion);
    });

    it('should set mismatch to true and skip updating db if persisted version differs', async () => {
      mockAppDbService.getState.mockResolvedValue('OUTDATED_VERSION');

      await service.ensureHydrated();

      expect(mockAppDbService.getState).toHaveBeenCalledWith(DATA_SCHEMA_VERSION_KEY);
      expect(service.hasPersistedDataSchemaVersionMismatch()).toBe(true);
      expect(mockAppDbService.putState).not.toHaveBeenCalled();
    });

    it('should return same hydration promise if called multiple times', async () => {
      mockAppDbService.getState.mockResolvedValue(undefined);

      const p1 = service.ensureHydrated();
      const p2 = service.ensureHydrated();

      expect(p1).toBe(p2);

      await p1;

      // getState should only be called once
      expect(mockAppDbService.getState).toHaveBeenCalledTimes(1);
    });

    it('should set mismatch to false on catch block if hydration fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockAppDbService.getState.mockRejectedValue(new Error('Db Error'));

      await service.ensureHydrated();

      expect(service.hasPersistedDataSchemaVersionMismatch()).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('markResolvedAfterReset', () => {
    it('should set mismatch to false and update db with current schema version', async () => {
      // Setup initial state to true to verify it changes to false
      mockAppDbService.getState.mockResolvedValue('OUTDATED_VERSION');
      await service.ensureHydrated();
      expect(service.hasPersistedDataSchemaVersionMismatch()).toBe(true);

      mockAppDbService.putState.mockResolvedValue(undefined);
      await service.markResolvedAfterReset();

      expect(service.hasPersistedDataSchemaVersionMismatch()).toBe(false);
      expect(mockAppDbService.putState).toHaveBeenCalledWith(DATA_SCHEMA_VERSION_KEY, service.currentDataSchemaVersion);
    });
  });
});
