import { TestBed } from '@angular/core/testing';
import { GeneratorService } from './generator.service';
import { FormationLibraryService } from './formation-library.service';
import { Role as RoleEnum, Position as PositionEnum } from '../models/enums';
import { calculatePlayerWageCost } from '../models/player-progression';

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

    it('should generate playerIds synchronized with team players', () => {
      const { teams } = service.generateLeague();

      teams.forEach(team => {
        const expectedPlayerIds = team.players.map(player => player.id);
        expect(team.playerIds).toEqual(expectedPlayerIds);
      });
    });

    it('should generate "Not Dressed" players with correct position distribution', () => {
      const { teams } = service.generateLeague();
      
      teams.forEach(team => {
        const reserves = team.players.filter(p => p.role === RoleEnum.RESERVE);
        expect(reserves.length).toBe(5);

        const gks = reserves.filter(p => p.position === PositionEnum.GOALKEEPER);
        const defs = reserves.filter(p => p.position === PositionEnum.DEFENDER);
        const mids = reserves.filter(p => p.position === PositionEnum.MIDFIELDER);
        const fwds = reserves.filter(p => p.position === PositionEnum.FORWARD);

        expect(gks.length).toBeLessThanOrEqual(1);
        expect(defs.length).toBeGreaterThanOrEqual(1);
        expect(mids.length).toBeGreaterThanOrEqual(1);
        expect(fwds.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Team Finances and Tiers', () => {
    it('should assign strictly required finances to every generated team', () => {
      const { teams } = service.generateLeague();
      
      expect(teams).toHaveLength(20);
      teams.forEach(team => {
        expect(team.finances).toBeDefined();
        expect(team.finances.tier).toBeGreaterThanOrEqual(1);
        expect(team.finances.tier).toBeLessThanOrEqual(5);
        expect(team.finances.transferBudget).toBeGreaterThan(0);
        expect(team.finances.wagePointsCap).toBeGreaterThan(0);
        expect(team.finances.wagePointsUsed).toBeGreaterThan(0);
      });
    });

    it('should distribute tiers exactly according to configuration (3 T1, 4 T2, 6 T3, 5 T4, 2 T5)', () => {
      const { teams } = service.generateLeague();
      
      const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      teams.forEach(team => {
        const tier = team.finances.tier as 1 | 2 | 3 | 4 | 5;
        tierCounts[tier]++;
      });

      expect(tierCounts[1]).toBe(3);
      expect(tierCounts[2]).toBe(4);
      expect(tierCounts[3]).toBe(6);
      expect(tierCounts[4]).toBe(5);
      expect(tierCounts[5]).toBe(2);
    });

    it('should assign correct fixed wage caps and transfer budgets per tier', () => {
      const { teams } = service.generateLeague();
      
      teams.forEach(team => {
        const f = team.finances;
        switch (f.tier) {
          case 1:
            expect(f.transferBudget).toBe(25000000);
            expect(f.wagePointsCap).toBe(56);
            break;
          case 2:
            expect(f.transferBudget).toBe(14000000);
            expect(f.wagePointsCap).toBe(42);
            break;
          case 3:
            expect(f.transferBudget).toBe(7000000);
            expect(f.wagePointsCap).toBe(29);
            break;
          case 4:
            expect(f.transferBudget).toBe(3500000);
            expect(f.wagePointsCap).toBe(21);
            break;
          case 5:
            expect(f.transferBudget).toBe(1500000);
            expect(f.wagePointsCap).toBe(17);
            break;
        }
      });
    });

    it('should sort generated teams by starter overall strength descending when assigning tiers', () => {
      const { teams } = service.generateLeague();
      
      // Calculate starter overall strength for each team
      const teamStrengths = teams.map(team => {
        const starters = team.players.filter(p => p.role === RoleEnum.STARTER);
        const sum = starters.reduce((acc, p) => acc + (p.seasonAttributes[0]?.overall?.value ?? 50), 0);
        return starters.length > 0 ? sum / starters.length : 50;
      });

      // Verify strengths are in descending order (strongest first)
      for (let i = 0; i < teamStrengths.length - 1; i++) {
        expect(teamStrengths[i]).toBeGreaterThanOrEqual(teamStrengths[i + 1]);
      }

      // Verify tier numbers are in ascending order (T1 -> T5) because stronger teams get lower tier numbers (T1)
      for (let i = 0; i < teams.length - 1; i++) {
        expect(teams[i].finances.tier).toBeLessThanOrEqual(teams[i + 1].finances.tier);
      }
    });

    it('should calculate initial wagePointsUsed dynamically as the sum of derived player wage costs', () => {
      const { teams, currentSeasonYear } = service.generateLeague();
      
      teams.forEach(team => {
        const computedWages = team.players.reduce((sum, p) => {
          return sum + calculatePlayerWageCost(p, currentSeasonYear);
        }, 0);

        expect(team.finances.wagePointsUsed).toBeCloseTo(computedWages, 2);
      });
    });
  });
});
