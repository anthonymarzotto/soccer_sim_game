import {Routes} from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { StandingsComponent } from './pages/standings/standings';
import { TeamDetailsComponent } from './pages/team-details/team-details';
import { PlayerProfileComponent } from './pages/player-profile/player-profile';
import { ScheduleComponent } from './pages/schedule/schedule';
import { TestKeyEventsComponent } from './pages/test-key-events/test-key-events';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'standings', component: StandingsComponent },
  { path: 'team/:id', component: TeamDetailsComponent },
  { path: 'player/:id', component: PlayerProfileComponent },
  { path: 'schedule', component: ScheduleComponent },
  { path: 'test-key-events', component: TestKeyEventsComponent },
  { path: '**', redirectTo: '' }
];
