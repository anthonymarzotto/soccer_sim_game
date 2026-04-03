import {Router, Routes} from '@angular/router';
import {inject} from '@angular/core';
import { HomeComponent } from './pages/home/home';
import { StandingsComponent } from './pages/standings/standings';
import { TeamDetailsComponent } from './pages/team-details/team-details';
import { PlayerProfileComponent } from './pages/player-profile/player-profile';
import { ScheduleComponent } from './pages/schedule/schedule';
import { SettingsComponent } from './pages/settings/settings';
import { WatchGameComponent } from './pages/watch-game/watch-game';
import { SimulationDebugComponent } from './pages/simulation-debug/simulation-debug';
import { ChangelogComponent } from './pages/changelog/changelog';
import { GameService } from './services/game.service';

const redirectToUserTeam = () => {
  const gameService = inject(GameService);
  const router = inject(Router);
  const league = gameService.league();
  
  if (league?.userTeamId) {
    return router.createUrlTree(['/team', league.userTeamId]);
  }
  return router.createUrlTree(['/']);
};

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'standings', component: StandingsComponent },
  { path: 'team', canActivate: [redirectToUserTeam], children: [] },
  { path: 'team/:id', component: TeamDetailsComponent },
  { path: 'player/:id', component: PlayerProfileComponent },
  { path: 'schedule', component: ScheduleComponent },
  { path: 'watch/:id', component: WatchGameComponent },
  { path: 'debug/simulation', component: SimulationDebugComponent },
  { path: 'settings', component: SettingsComponent },
  { path: 'changelog', component: ChangelogComponent },
  { path: '**', redirectTo: '' }
];
