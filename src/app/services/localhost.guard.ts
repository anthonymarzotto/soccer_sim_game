import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LocalhostService } from './localhost.service';

/**
 * Functional version of the localhost guard for use in route configurations.
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
