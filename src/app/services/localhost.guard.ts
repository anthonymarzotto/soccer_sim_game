import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LocalhostService } from './localhost.service';

/**
 * Functional route guard that only allows access from localhost.
 * Redirects to home page if accessed from a non-localhost origin.
 */
export const localhostGuardFn: CanActivateFn = (_route, _state) => {
  const localhostService = inject(LocalhostService);
  const router = inject(Router);

  if (localhostService.isLocalhost()) {
    return true;
  }

  router.navigate(['/']);
  return false;
};

