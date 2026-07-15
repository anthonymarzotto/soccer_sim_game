import {Router, Routes} from '@angular/router';
import {inject} from '@angular/core';
import { HomeComponent } from './pages/home/home';
import { StandingsComponent } from './pages/standings/standings';
import { LeagueFinancesComponent } from './pages/league-finances/league-finances';
import { TeamDetailsComponent } from './pages/team-details/team-details';
import { TeamScheduleComponent } from './pages/team-schedule/team-schedule';
import { PlayerProfileComponent } from './pages/player-profile/player-profile';
import { PlayerGameLogComponent } from './pages/player-game-log/player-game-log';
import { PlayerStatsComponent } from './pages/player-stats/player-stats';
import { TeamStatsComponent } from './pages/team-stats/team-stats';
import { PlayerAttributesComponent } from './pages/player-attributes/player-attributes';
import { ScheduleComponent } from './pages/schedule/schedule';
import { SettingsComponent } from './pages/settings/settings';
import { WatchGameComponent } from './pages/watch-game/watch-game';
import { SimulationDebugComponent } from './pages/simulation-debug/simulation-debug';
import { TickDebugComponent } from './pages/tick-debug/tick-debug';
import { DesignDocsComponent } from './pages/design-docs/design-docs';
import { ChangelogComponent } from './pages/changelog/changelog';
import { DebugPlayerProfileComponent } from './pages/debug-player-profile/debug-player-profile';
import { NewsComponent } from './pages/news/news';
import { TransferMarketComponent } from './pages/transfer-market/transfer-market';
import { GameService } from './services/game.service';
import { localhostGuardFn } from './services/localhost.guard';

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
  { path: 'finances', component: LeagueFinancesComponent },
  { path: 'transfer-market', component: TransferMarketComponent },
  { path: 'player-stats', component: PlayerStatsComponent },
  { path: 'team-stats', component: TeamStatsComponent },
  { path: 'player-attributes', component: PlayerAttributesComponent },
  { path: 'team', canActivate: [redirectToUserTeam], children: [] },
  { path: 'team/:id', component: TeamDetailsComponent },
  { path: 'team/:id/schedule', component: TeamScheduleComponent },
  { path: 'player/:id', component: PlayerProfileComponent },
  { path: 'player/:id/game-log', component: PlayerGameLogComponent },
  { path: 'schedule', component: ScheduleComponent },
  { path: 'watch/:id', component: WatchGameComponent },
  { path: 'debug/simulation', canActivate: [localhostGuardFn], component: SimulationDebugComponent },
  { path: 'debug/tick', canActivate: [localhostGuardFn], component: TickDebugComponent },
  { path: 'debug/player-progression', canActivate: [localhostGuardFn], component: DebugPlayerProfileComponent },
  { path: 'design-docs', canActivate: [localhostGuardFn], component: DesignDocsComponent },
  { path: 'settings', component: SettingsComponent },
  { path: 'changelog', component: ChangelogComponent },
  { path: 'news', component: NewsComponent },
  { path: '**', redirectTo: '' }
];
