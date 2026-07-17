import { TestBed } from '@angular/core/testing';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { CommentaryService } from './commentary.service';
import { StatisticsService } from './statistics.service';
import { GeneratorService } from './generator.service';
import { CommentaryStyle, Position } from '../models/enums';
import { Team } from '../models/types';
import { SimulationConfig } from '../models/simulation.types';

describe('Event Attribution Analysis (Diagnostic)', () => {
  let simulationB: MatchSimulationVariantBService;
  let generator: GeneratorService;
  let statsService: StatisticsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MatchSimulationVariantBService,
        FieldService,
        FormationLibraryService,
        CommentaryService,
        StatisticsService,
        GeneratorService
      ]
    });

    simulationB = TestBed.inject(MatchSimulationVariantBService);
    generator = TestBed.inject(GeneratorService);
    statsService = TestBed.inject(StatisticsService);
  });

  it('ANALYZE: calculate position-specific event rates per 90 minutes', () => {
    const { teams, schedule } = generator.generateLeague();
    const teamMap = new Map<string, Team>();
    teams.forEach(t => teamMap.set(t.id, t));

    // Stats accumulator per position
    const positionStats = new Map<Position, {
      minutesPlayed: number;
      passes: number;
      passesSuccessful: number;
      shots: number;
      shotsOnTarget: number;
      goals: number;
      assists: number;
      tackles: number;
      tacklesSuccessful: number;
      interceptions: number;
      saves: number;
      fouls: number;
      foulsSuffered: number;
      aerialDuelsWon: number;
      aerialDuelsLost: number;
    }>();

    const getAccumulator = (pos: Position) => {
      if (!positionStats.has(pos)) {
        positionStats.set(pos, {
          minutesPlayed: 0,
          passes: 0,
          passesSuccessful: 0,
          shots: 0,
          shotsOnTarget: 0,
          goals: 0,
          assists: 0,
          tackles: 0,
          tacklesSuccessful: 0,
          interceptions: 0,
          saves: 0,
          fouls: 0,
          foulsSuffered: 0,
          aerialDuelsWon: 0,
          aerialDuelsLost: 0,
        });
      }
      return positionStats.get(pos)!;
    };

    // Simulate 180 matches (a whole season's worth)
    const matchesToSimulate = schedule.slice(0, 180);
    const config: SimulationConfig = {
      enablePlayByPlay: true,
      disableInjuries: true,
      enableSpatialTracking: true,
      enableTactics: true,
      enableFatigue: true,
      commentaryStyle: CommentaryStyle.STATS_ONLY,
      simulationVariant: 'B',
      seed: 'stats-analysis-seed'
    };

    matchesToSimulate.forEach(match => {
      const homeTeam = teamMap.get(match.homeTeamId)!;
      const awayTeam = teamMap.get(match.awayTeamId)!;

      const state = simulationB.simulateMatch(match, homeTeam, awayTeam, config);

      const homePlayerStats = statsService.generatePlayerStatistics(state, homeTeam, homeTeam.players);
      const awayPlayerStats = statsService.generatePlayerStatistics(state, awayTeam, awayTeam.players);

      [...homePlayerStats, ...awayPlayerStats].forEach(s => {
        const acc = getAccumulator(s.position);
        acc.minutesPlayed += s.minutesPlayed || 0;
        acc.passes += s.passes || 0;
        acc.passesSuccessful += s.passesSuccessful || 0;
        acc.shots += s.shots || 0;
        acc.shotsOnTarget += s.shotsOnTarget || 0;
        acc.goals += s.goals || 0;
        acc.assists += s.assists || 0;
        acc.tackles += s.tackles || 0;
        acc.tacklesSuccessful += s.tacklesSuccessful || 0;
        acc.interceptions += s.interceptions || 0;
        acc.saves += s.saves || 0;
        acc.fouls += s.fouls || 0;
        acc.foulsSuffered += s.foulsSuffered || 0;
        acc.aerialDuelsWon += s.aerialDuelsWon || 0;
        acc.aerialDuelsLost += s.aerialDuelsLost || 0;
      });
    });

    // Print analysis results
    console.log('\n=============================================================');
    console.log('POSITION EVENT RATES PER 90 MINUTES (Based on 180 Simulated Matches)');
    console.log('=============================================================');
    console.log('| Position | Min Played | Goals | Assists | Pass Acc % | Passes | Tackles | Intercepts | Saves | Fouls |');
    console.log('|----------|------------|-------|---------|------------|--------|---------|------------|-------|-------|');

    Array.from(positionStats.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([pos, data]) => {
      const p90 = (val: number) => ((val / data.minutesPlayed) * 90).toFixed(2);
      const passPct = data.passes > 0 ? ((data.passesSuccessful / data.passes) * 100).toFixed(1) + '%' : '0.0%';
      console.log(`| ${pos.padEnd(8)} | ${data.minutesPlayed.toString().padEnd(10)} | ${p90(data.goals).padEnd(5)} | ${p90(data.assists).padEnd(7)} | ${passPct.padEnd(10)} | ${p90(data.passes).padEnd(6)} | ${p90(data.tackles).padEnd(7)} | ${p90(data.interceptions).padEnd(10)} | ${p90(data.saves).padEnd(5)} | ${p90(data.fouls).padEnd(5)} |`);
    });
    console.log('=============================================================\n');
  }, 60000);
});
