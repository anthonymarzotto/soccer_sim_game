import {ChangeDetectionStrategy, Component, inject, OnInit, DestroyRef, effect} from '@angular/core';
import {RouterOutlet, Router, NavigationEnd} from '@angular/router';
import {Title} from '@angular/platform-browser';
import {NavigationComponent} from './components/navigation/navigation';
import {APP_TITLE} from './constants';
import {GameService} from './services/game.service';
import {ScheduleStateService} from './services/schedule-state.service';
import {filter} from 'rxjs/operators';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, NavigationComponent],
  templateUrl: './app.html',
})
export class App implements OnInit {
  private router = inject(Router);
  private titleService = inject(Title);
  private gameService = inject(GameService);
  private scheduleStateService = inject(ScheduleStateService);
  private destroyRef = inject(DestroyRef);

  constructor() {
    // Update the title whenever selectedWeek changes while on the schedule route,
    // so prev/next week navigation is reflected without a full page navigation.
    effect(() => {
      const week = this.scheduleStateService.selectedWeek();
      if (this.router.url.startsWith('/schedule')) {
        this.titleService.setTitle(`${APP_TITLE} - Schedule - Week ${week}`);
      }
    });
  }

  ngOnInit() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        const pageTitle = this.getPageTitle(this.router.url);
        this.titleService.setTitle(`${APP_TITLE} - ${pageTitle}`);
      });
  }

  private getPageTitle(url: string): string {
    const segments = url.split('/').filter(segment => segment);
    const path = segments[0] || '';
    const id = segments[1];

    const pageNames: Record<string, string> = {
      '': 'Home',
      'home': 'Home',
      'standings': 'Standings',
      'schedule': 'Schedule',
      'debug': 'Simulation Debug',
      'settings': 'Settings',
    };

    // Handle team route
    if (path === 'team' && id) {
      const team = this.gameService.getTeam(id);
      return team ? team.name : 'Team Details';
    }

    // Handle player route
    if (path === 'player' && id) {
      const player = this.gameService.getPlayer(id);
      if (player) {
        const team = this.gameService.getTeam(player.teamId);
        const teamName = team ? team.name : '';
        return teamName ? `${player.name} - ${teamName}` : player.name;
      }
      return 'Player Profile';
    }

    // Handle schedule route with week
    if (path === 'schedule') {
      const week = this.scheduleStateService.selectedWeek();
      return `Schedule - Week ${week}`;
    }

    return pageNames[path] || path.charAt(0).toUpperCase() + path.slice(1);
  }
}
