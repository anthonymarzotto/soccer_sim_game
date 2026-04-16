import { Injectable, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { LocalhostService } from './localhost.service';

/**
 * Route guard that only allows access from localhost.
 * Redirects to home page if accessed from a non-localhost origin.
 */
@Injectable({ providedIn: 'root' })
export class LocalhostGuard {
  private localhostService = inject(LocalhostService);
  private router = inject(Router);

  canActivate: CanActivateFn = () => {
    if (this.localhostService.isLocalhost()) {
      return true;
    }
    // Redirect to home page
    this.router.navigate(['/']);
    return false;
  };
}

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
