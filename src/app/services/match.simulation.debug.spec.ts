/* eslint-disable @typescript-eslint/no-explicit-any */
import { TestBed } from '@angular/core/testing';
import { MatchSimulationVariantBService } from './match.simulation.variant-b.service';
import { FieldService } from './field.service';
import { FormationLibraryService } from './formation-library.service';
import { CommentaryService } from './commentary.service';
import { StatisticsService } from './statistics.service';
import { SimulationConfig, PlayByPlayEvent } from '../models/simulation.types';
import { Team, Player } from '../models/types';
import { CommentaryStyle, EventType } from '../models/enums';
import * as fs from 'fs';
import * as path from 'path';

describe('Match Simulation Debug Spec', () => {
  let simulationB: MatchSimulationVariantBService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MatchSimulationVariantBService,
        FieldService,
        FormationLibraryService,
        CommentaryService,
        StatisticsService
      ]
    });
    simulationB = TestBed.inject(MatchSimulationVariantBService);
  });

  it('should simulate the specific match from the export and log all interceptions', () => {
    const exportsDir = 'C:\\Repos\\soccer_sim_game\\exports';
    const files = fs.readdirSync(exportsDir)
      .filter(f => f.startsWith('soccer-sim-full-export') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.log('No export files found!');
      return;
    }

    const exportPath = path.join(exportsDir, files[0]);
    console.log(`Loading export file: ${exportPath}`);
    const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));

    const targetMatchId = 'bff17d65-cfd2-43fd-8a2c-10b97aa5b76b';
    const match = data.matches.find((m: any) => m.id === targetMatchId);

    if (!match) {
      console.log(`Target match ${targetMatchId} not found in export!`);
      return;
    }

    const homeTeamRaw = data.teams.find((t: any) => t.id === match.homeTeamId);
    const awayTeamRaw = data.teams.find((t: any) => t.id === match.awayTeamId);

    const targetSeasonYear = match.seasonYear || 2026;
    const hydrateAttributes = (p: any) => {
      const seasonAttributes = p.seasonAttributes.map((attrs: any) => {
        const built: any = { seasonYear: attrs.seasonYear };
        for (const key of Object.keys(attrs.values)) {
          built[key] = { value: attrs.values[key], baseline: attrs.values[key] };
        }
        return built;
      });

      if (!seasonAttributes.some((attrs: any) => attrs.seasonYear === targetSeasonYear)) {
        const firstAttrs = p.seasonAttributes[0];
        if (firstAttrs) {
          const built: any = { seasonYear: targetSeasonYear };
          for (const key of Object.keys(firstAttrs.values)) {
            built[key] = { value: firstAttrs.values[key], baseline: firstAttrs.values[key] };
          }
          seasonAttributes.push(built);
        }
      }

      return { ...p, seasonAttributes };
    };

    const homePlayers = data.players.filter((p: any) => p.teamId === homeTeamRaw.id || p.teamId === `team-${homeTeamRaw.id}`)
      .map(hydrateAttributes);
    const awayPlayers = data.players.filter((p: any) => p.teamId === awayTeamRaw.id || p.teamId === `team-${awayTeamRaw.id}`)
      .map(hydrateAttributes);

    const homeTeam: Team = {
      ...homeTeamRaw,
      selectedFormationId: match.homeLineup.selectedFormationId,
      formationAssignments: match.homeLineup.formationAssignments,
      players: homePlayers
    };
    const awayTeam: Team = {
      ...awayTeamRaw,
      selectedFormationId: match.awayLineup.selectedFormationId,
      formationAssignments: match.awayLineup.formationAssignments,
      players: awayPlayers
    };

    const config: SimulationConfig = {
      enablePlayByPlay: true,
      disableInjuries: true,
      enableSpatialTracking: true,
      enableTactics: true,
      enableFatigue: true,
      commentaryStyle: CommentaryStyle.DETAILED,
      simulationVariant: 'B',
      seed: match.id
    };

    console.log(`Running simulation with seed: ${config.seed}`);

    // Let's spy on findPassTarget by backing up the original and replacing it with a logging version
    const originalFindPassTarget = (simulationB as any).findPassTarget;
    (simulationB as any).findPassTarget = function(
      passer: Player,
      teamPlayers: Player[],
      tactics: any,
      currentLocation: any,
      currentTeam: any,
      passIntent: any
    ) {
      const res = originalFindPassTarget.call(this, passer, teamPlayers, tactics, currentLocation, currentTeam, passIntent);
      if (passIntent === 'RECYCLE' && res && res.position === 'ST') {
        console.log(`\n--- [RECYCLE PASS TO ST DETECTED] ---`);
        console.log(`Passer: ${passer.name} (${passer.position}), Loc: (${currentLocation.x.toFixed(1)}, ${currentLocation.y.toFixed(1)}), Chosen Target: ${res.name} (${res.position})`);
        
        // Log all candidates and their scores
        const scored = teamPlayers
          .filter(p => p.id !== passer.id && p.role === 'Starter')
          .map(target => {
            const r = (this as any).scorePassTarget(target, passer, tactics, currentLocation, currentTeam, passIntent);
            return { name: target.name, pos: target.position, score: r.score, distance: r.distance };
          })
          .sort((a, b) => b.score - a.score);
          
        scored.forEach(c => {
          console.log(`  Candidate: ${c.name.padEnd(20)} [${c.pos.padEnd(3)}]  Score: ${c.score.toFixed(1)}  Distance: ${c.distance.toFixed(1)}`);
        });
      }
      return res;
    };



    const state = simulationB.simulateMatch(match, homeTeam, awayTeam, config);

    (simulationB as any).findPassTarget = originalFindPassTarget;

    const philipId = '14b7ccae-ddf2-4021-b919-a42879b0201d';
    const allPlayers = [...homePlayers, ...awayPlayers];


    console.log('\n=== ALL INTERCEPTION EVENTS IN MATCH ===');
    state.events.forEach((event: PlayByPlayEvent) => {
      if (event.type === EventType.INTERCEPTION) {
        const winnerId = event.playerIds[0];
        const loserId = event.playerIds[1];
        const winner = allPlayers.find(p => p.id === winnerId);
        const loser = allPlayers.find(p => p.id === loserId);
        const isPhilip = winnerId === philipId || loserId === philipId;
        const marker = isPhilip ? '*** PHILIP ***' : '';
        console.log(`[Min ${event.time}'] ${marker} Winner: ${winner?.name} (${winner?.position}), Loser: ${loser?.name} (${loser?.position}), Loc: (${event.location.x.toFixed(1)}, ${event.location.y.toFixed(1)}), Intent: ${event.additionalData?.passIntent}, Fail: ${event.additionalData?.passFailure}`);
      }
    });

    console.log('\n=== ALL INCOMPLETE PASSES IN MATCH ===');
    state.events.forEach((event: PlayByPlayEvent) => {
      if (event.type === EventType.PASS && !event.success) {
        const passerId = event.playerIds[0];
        const receiverId = event.playerIds[1];
        const passer = allPlayers.find(p => p.id === passerId);
        const receiver = allPlayers.find(p => p.id === receiverId);
        const isPhilip = passerId === philipId || receiverId === philipId;
        const marker = isPhilip ? '*** PHILIP ***' : '';
        console.log(`[Min ${event.time}'] ${marker} Passer: ${passer?.name} (${passer?.position}), Target: ${receiver?.name} (${receiver?.position}), Loc: (${event.location.x.toFixed(1)}, ${event.location.y.toFixed(1)}), Intent: ${event.additionalData?.passIntent}, Fail: ${event.additionalData?.passFailure}`);
      }
    });

    console.log('\n=== PHILIP TURNER SPECIFIC STATS IN SIMULATED MATCH ===');
    const philipStats = state.events.reduce((acc, event) => {
      if (event.playerIds.includes(philipId)) {
        acc.push(`[Min ${event.time}'] Event: ${event.type}, Players: ${event.playerIds.map(id => allPlayers.find(pl => pl.id === id)?.name || id).join(', ')}, Loc: (${event.location.x.toFixed(1)}, ${event.location.y.toFixed(1)})`);
      }
      return acc;
    }, [] as string[]);
    philipStats.forEach(s => console.log(s));
  });
});

