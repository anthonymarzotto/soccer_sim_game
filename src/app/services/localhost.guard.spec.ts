import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { vi } from 'vitest';
import { LocalhostGuard, localhostGuardFn } from './localhost.guard';
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
        LocalhostGuard,
        { provide: LocalhostService, useValue: localhostServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    });

    return {
      localhostServiceSpy,
      routerSpy
    };
  }

  describe('LocalhostGuard class', () => {
    it('should return true if accessed from localhost', () => {
      const { routerSpy } = setup(true);
      const guard = TestBed.inject(LocalhostGuard);

      const route = {} as ActivatedRouteSnapshot;
      const state = {} as RouterStateSnapshot;

      // Need to cast as the return type can be Observable, Promise, or boolean
      const result = guard.canActivate(route, state);

      expect(result).toBe(true);
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('should return false and navigate to home if not accessed from localhost', () => {
      const { routerSpy } = setup(false);
      const guard = TestBed.inject(LocalhostGuard);

      const route = {} as ActivatedRouteSnapshot;
      const state = {} as RouterStateSnapshot;

      const result = guard.canActivate(route, state);

      expect(result).toBe(false);
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/']);
    });
  });

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
