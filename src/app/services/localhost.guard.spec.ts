import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { vi } from 'vitest';
import { localhostGuardFn } from './localhost.guard';
import { LocalhostService } from './localhost.service';

describe('LocalhostGuard', () => {
  function setup(isLocalhostValue: boolean) {
    TestBed.resetTestingModule();

    const localhostServiceSpy = {
      isLocalhost: vi.fn().mockReturnValue(isLocalhostValue)
    };

    const routerSpy = {
      navigate: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: LocalhostService, useValue: localhostServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });

    return {
      localhostServiceSpy,
      routerSpy
    };
  }

  describe('localhostGuardFn', () => {
    it('should return true if accessed from localhost', () => {
      const { routerSpy } = setup(true);

      const route = {} as ActivatedRouteSnapshot;
      const state = {} as RouterStateSnapshot;

      const result = TestBed.runInInjectionContext(() => localhostGuardFn(route, state));

      expect(result).toBe(true);
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('should return false and navigate to home if not accessed from localhost', () => {
      const { routerSpy } = setup(false);

      const route = {} as ActivatedRouteSnapshot;
      const state = {} as RouterStateSnapshot;

      const result = TestBed.runInInjectionContext(() => localhostGuardFn(route, state));

      expect(result).toBe(false);
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
    });
  });
});

