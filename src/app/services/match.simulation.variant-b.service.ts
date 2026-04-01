import { Injectable, inject } from '@angular/core';
import { Match, Team } from '../models/types';
import { MatchState, SimulationConfig } from '../models/simulation.types';
import { MatchSimulationService } from './match.simulation.service';

@Injectable({
  providedIn: 'root'
})
export class MatchSimulationVariantBService {
  private baselineSimulation = inject(MatchSimulationService);

  simulateMatch(match: Match, homeTeam: Team, awayTeam: Team, config: SimulationConfig): MatchState {
    // Variant B starts as a parity scaffold and will diverge during tuning iterations.
    return this.baselineSimulation.simulateMatch(match, homeTeam, awayTeam, config);
  }
}
