import { TestBed } from '@angular/core/testing';
import { GeneratorService } from './generator.service';
import { FormationLibraryService } from './formation-library.service';

describe('GeneratorService', () => {
  let service: GeneratorService;
  let formationLibrary: FormationLibraryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GeneratorService, FormationLibraryService]
    });

    service = TestBed.inject(GeneratorService);
    formationLibrary = TestBed.inject(FormationLibraryService);
  });

  describe('Team Formation Defaults', () => {
    it('should assign default formation ID to every generated team', () => {
      const { teams } = service.generateLeague();
      const defaultFormationId = formationLibrary.getDefaultFormationId();

      expect(teams.length).toBeGreaterThan(0);
      teams.forEach(team => {
        expect(team.selectedFormationId).toBe(defaultFormationId);
      });
    });

    it('should assign a selected formation ID that exists in the formation library', () => {
      const { teams } = service.generateLeague();

      teams.forEach(team => {
        expect(team.selectedFormationId).toBeTruthy();

        const schema = formationLibrary.getFormationById(team.selectedFormationId);
        expect(schema).toBeDefined();
      });
    });

    it('should use FormationLibraryService default dynamically (not hardcoded)', () => {
      const originalGetDefault = formationLibrary.getDefaultFormationId;
      formationLibrary.getDefaultFormationId = () => 'test_dynamic_default';

      const { teams } = service.generateLeague();

      teams.forEach(team => {
        expect(team.selectedFormationId).toBe('test_dynamic_default');
      });

      formationLibrary.getDefaultFormationId = originalGetDefault;
    });
  });
});
