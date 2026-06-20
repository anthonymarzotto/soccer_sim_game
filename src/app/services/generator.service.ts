import { Injectable, inject } from '@angular/core';
import { Player, Team, Match, Position, Role, PlayerSeasonAttributes, StatKey } from '../models/types';
import { Role as RoleEnum, Position as PositionEnum } from '../models/enums';
import { FormationLibraryService } from './formation-library.service';
import { RngService } from './rng.service';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';
import { createEmptyTeamStats } from '../models/season-history';
import { buildStat } from '../models/stat-definitions';
import { birthdayForAge } from '../models/player-age';
import { calculateOverall, calculateSquadTotalWageCost, calculatePlayerWageCost, calculateMarketValue } from '../models/player-progression';
import { clamp } from '../utils/math';

@Injectable({
  providedIn: 'root'
})
export class GeneratorService {
  private formationLibrary = inject(FormationLibraryService);
  private rng = inject(RngService);

  private firstNames = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Christopher', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian', 'George', 'Edward', 'Ronald', 'Timothy', 'Jason', 'Jeffrey', 'Ryan', 'Jacob', 'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott', 'Brandon', 'Benjamin', 'Samuel', 'Gregory', 'Frank', 'Alexander', 'Raymond', 'Patrick', 'Jack', 'Dennis', 'Jerry', 'Tyler', 'Aaron', 'Jose', 'Adam', 'Henry', 'Nathan', 'Douglas', 'Zachary', 'Peter', 'Kyle', 'Walter', 'Ethan', 'Jeremy', 'Harold', 'Keith', 'Christian', 'Roger', 'Noah', 'Gerald', 'Carl', 'Terry', 'Sean', 'Austin', 'Arthur', 'Lawrence', 'Jesse', 'Dylan', 'Bryan', 'Joe', 'Jordan', 'Billy', 'Bruce', 'Albert', 'Willie', 'Gabriel', 'Logan', 'Alan', 'Juan', 'Wayne', 'Ralph', 'Roy', 'Eugene', 'Randy', 'Vincent', 'Russell', 'Louis', 'Philip', 'Bobby', 'Johnny', 'Bradley'];
  private lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes', 'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster', 'Jimenez'];
  private cities = ['London', 'Manchester', 'Liverpool', 'Birmingham', 'Leeds', 'Sheffield', 'Newcastle', 'Bristol', 'Nottingham', 'Leicester', 'Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza', 'Malaga', 'Murcia', 'Palma', 'Las Palmas', 'Bilbao', 'Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna', 'Florence', 'Bari', 'Catania', 'Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Stuttgart', 'Dusseldorf', 'Dortmund', 'Essen', 'Leipzig', 'Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Montpellier', 'Bordeaux', 'Lille'];
  private nationalities = ['English', 'Spanish', 'Italian', 'German', 'French', 'Brazilian', 'Argentine', 'Portuguese', 'Dutch', 'Belgian'];

  private teamNames = [
    'Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton',
    'Burnley', 'Chelsea', 'Crystal Palace', 'Everton', 'Fulham',
    'Liverpool', 'Luton Town', 'Manchester City', 'Manchester United', 'Newcastle United',
    'Nottingham Forest', 'Sheffield United', 'Tottenham Hotspur', 'West Ham United', 'Wolverhampton'
  ];

  generateLeague(): { teams: Team[], schedule: Match[], currentSeasonYear: number } {
    const currentSeasonYear = new Date().getFullYear();
    const teams: Team[] = this.teamNames.map((name, index) => this.generateTeam(index.toString(), name, currentSeasonYear));

    // Sort generated teams by overall strength (starter overall average) descending
    const teamsWithStrength = teams.map(team => {
      const starters = team.players.filter(p => p.role === RoleEnum.STARTER);
      const sum = starters.reduce((acc, p) => {
        const overall = p.seasonAttributes[0]?.overall?.value ?? 50;
        return acc + overall;
      }, 0);
      const strength = starters.length > 0 ? sum / starters.length : 50;
      return { team, strength };
    });

    teamsWithStrength.sort((a, b) => b.strength - a.strength);

    // Assign fixed tiers:
    // Tier 1 (3 teams), Tier 2 (4 teams), Tier 3 (6 teams), Tier 4 (5 teams), Tier 5 (2 teams)
    const tierConfig = [
      { tier: 1, count: 3, budget: 2500000, cap: 56 },
      { tier: 2, count: 4, budget: 1400000, cap: 42 },
      { tier: 3, count: 6, budget: 700000, cap: 29 },
      { tier: 4, count: 5, budget: 350000, cap: 21 },
      { tier: 5, count: 2, budget: 150000, cap: 17 }
    ];

    let teamIndex = 0;
    for (const conf of tierConfig) {
      for (let i = 0; i < conf.count; i++) {
        const teamObj = teamsWithStrength[teamIndex];
        const team = teamObj.team;

        // Calculate initial wagePointsUsed
        const wagePointsUsed = calculateSquadTotalWageCost(team.players, currentSeasonYear);

        team.finances = {
          tier: conf.tier,
          transferBudget: conf.budget,
          wagePointsCap: conf.cap,
          wagePointsUsed: Math.round(wagePointsUsed * 100) / 100
        };

        teamIndex++;
      }
    }

    const finalTeams = teamsWithStrength.map(x => x.team);
    const schedule = this.generateSchedule(finalTeams, currentSeasonYear);
    return { teams: finalTeams, schedule, currentSeasonYear };
  }

  generateScheduleForSeason(teams: Team[], seasonYear: number): Match[] {
    return this.generateSchedule(teams, seasonYear);
  }

  private generateTeam(id: string, name: string, currentSeasonYear: number): Team {
    const players: Player[] = [];

    // Team quality multiplier: ranges from 0.6 to 1.4 to create stronger and weaker teams
    const teamQuality = Math.random() * 0.8 + 0.6; // 0.6 to 1.4

    // 11 Starters: 1 GK, 4 DEF, 4 MID, 2 FWD
    players.push(this.generatePlayer(id, PositionEnum.GOALKEEPER, RoleEnum.STARTER, teamQuality, currentSeasonYear));
    for (let i = 0; i < 4; i++) players.push(this.generatePlayer(id, PositionEnum.DEFENDER, RoleEnum.STARTER, teamQuality, currentSeasonYear));
    for (let i = 0; i < 4; i++) players.push(this.generatePlayer(id, PositionEnum.MIDFIELDER, RoleEnum.STARTER, teamQuality, currentSeasonYear));
    for (let i = 0; i < 2; i++) players.push(this.generatePlayer(id, PositionEnum.FORWARD, RoleEnum.STARTER, teamQuality, currentSeasonYear));

    // 9 Bench: 1 GK, 2 DEF, 4 MID, 2 FWD
    players.push(this.generatePlayer(id, PositionEnum.GOALKEEPER, RoleEnum.BENCH, teamQuality, currentSeasonYear));
    for (let i = 0; i < 2; i++) players.push(this.generatePlayer(id, PositionEnum.DEFENDER, RoleEnum.BENCH, teamQuality, currentSeasonYear));
    for (let i = 0; i < 4; i++) players.push(this.generatePlayer(id, PositionEnum.MIDFIELDER, RoleEnum.BENCH, teamQuality, currentSeasonYear));
    for (let i = 0; i < 2; i++) players.push(this.generatePlayer(id, PositionEnum.FORWARD, RoleEnum.BENCH, teamQuality, currentSeasonYear));

    // 5 Not Dressed: Guarantee at least 1 of each outfield position, max 1 GK
    const reservePositions: Position[] = [
      PositionEnum.DEFENDER,
      PositionEnum.MIDFIELDER,
      PositionEnum.FORWARD
    ];

    // Fill remaining 2 slots: allowing at most 1 GK total in reserves
    for (let i = 0; i < 2; i++) {
      const allowed: Position[] = [PositionEnum.DEFENDER, PositionEnum.MIDFIELDER, PositionEnum.FORWARD];
      if (!reservePositions.includes(PositionEnum.GOALKEEPER)) {
        allowed.push(PositionEnum.GOALKEEPER);
      }
      const pos = allowed[Math.floor(Math.random() * allowed.length)];
      reservePositions.push(pos);
    }

    for (const pos of reservePositions) {
      players.push(this.generatePlayer(id, pos, RoleEnum.RESERVE, teamQuality, currentSeasonYear));
    }

    const startersByPosition = {
      [PositionEnum.GOALKEEPER]: players.filter(p => p.role === RoleEnum.STARTER && p.position === PositionEnum.GOALKEEPER),
      [PositionEnum.DEFENDER]: players.filter(p => p.role === RoleEnum.STARTER && p.position === PositionEnum.DEFENDER),
      [PositionEnum.MIDFIELDER]: players.filter(p => p.role === RoleEnum.STARTER && p.position === PositionEnum.MIDFIELDER),
      [PositionEnum.FORWARD]: players.filter(p => p.role === RoleEnum.STARTER && p.position === PositionEnum.FORWARD)
    };

    const formationAssignments: Record<string, string> = {
      gk_1: startersByPosition[PositionEnum.GOALKEEPER][0]?.id ?? '',
      def_l: startersByPosition[PositionEnum.DEFENDER][0]?.id ?? '',
      def_lc: startersByPosition[PositionEnum.DEFENDER][1]?.id ?? '',
      def_rc: startersByPosition[PositionEnum.DEFENDER][2]?.id ?? '',
      def_r: startersByPosition[PositionEnum.DEFENDER][3]?.id ?? '',
      mid_l: startersByPosition[PositionEnum.MIDFIELDER][0]?.id ?? '',
      mid_lc: startersByPosition[PositionEnum.MIDFIELDER][1]?.id ?? '',
      mid_rc: startersByPosition[PositionEnum.MIDFIELDER][2]?.id ?? '',
      mid_r: startersByPosition[PositionEnum.MIDFIELDER][3]?.id ?? '',
      att_l: startersByPosition[PositionEnum.FORWARD][0]?.id ?? '',
      att_r: startersByPosition[PositionEnum.FORWARD][1]?.id ?? ''
    };

    return {
      id,
      name,
      players,
      playerIds: players.map(player => player.id),
      selectedFormationId: this.formationLibrary.getDefaultFormationId(),
      formationAssignments,
      stats: createEmptyTeamStats(),
      seasonSnapshots: [{
        seasonYear: currentSeasonYear,
        playerIds: players.map(player => player.id),
        stats: createEmptyTeamStats()
      }],
      finances: {
        tier: 5,
        transferBudget: 150000,
        wagePointsCap: 26,
        wagePointsUsed: 0
      }
    };
  }

  public generatePlayer(teamId: string, position: Position, role: Role, teamQuality = 1.0, currentSeasonYear = new Date().getFullYear(), age?: number): Player {
    const id = this.rng.nextUUID();

    const personalDetails = this.generatePlayerPersonalDetails();
    const { name, height, weight, nationality } = personalDetails;

    const qualityDetails = this.calculateEffectiveQuality(teamQuality, currentSeasonYear, age);
    const { effectiveQuality, birthday } = qualityDetails;

    const values = this.generatePlayerBaseAttributes(effectiveQuality, position);
    const progression = this.generatePlayerProgression(values.overall, position);
    const seasonAttributes = this.generatePlayerSeasonAttributes(currentSeasonYear, values);

    const playerWithoutContract = {
      id,
      name,
      teamId,
      position,
      role,
      personal: { height, weight, birthday, nationality },
      seasonAttributes: [seasonAttributes],
      careerStats: [],
      mood: 100,
      fatigue: 0,
      injuries: [],
      suspensions: [],
      progression
    } as unknown as Player;

    const initialWage = calculatePlayerWageCost(playerWithoutContract, currentSeasonYear);
    const contractYears = Math.floor(Math.random() * 4) + 1;
    const contract = {
      agreedWageCost: initialWage,
      expiresAfterSeason: currentSeasonYear + contractYears - 1
    };

    const playerWithContract: Player = {
      ...playerWithoutContract,
      contract,
      careerStats: [createEmptyPlayerCareerStats(currentSeasonYear, teamId, initialWage, calculateMarketValue(playerWithoutContract, currentSeasonYear))]
    };

    return playerWithContract;
  }

  private generatePlayerPersonalDetails(): { firstName: string, lastName: string, name: string, height: number, weight: number, nationality: string } {
    const firstName = this.firstNames[Math.floor(Math.random() * this.firstNames.length)];
    const lastName = this.lastNames[Math.floor(Math.random() * this.lastNames.length)];
    const name = `${firstName} ${lastName}`;
    const height = Math.floor(Math.random() * 30) + 165; // 165cm to 195cm
    const weight = Math.floor(Math.random() * 25) + 65; // 65kg to 90kg
    const nationality = this.nationalities[Math.floor(Math.random() * this.nationalities.length)];

    return { firstName, lastName, name, height, weight, nationality };
  }

  private calculateEffectiveQuality(teamQuality: number, currentSeasonYear: number, age?: number): { resolvedAge: number, effectiveQuality: number, birthday: Date } {
    const resolvedAge = age ?? (Math.floor(Math.random() * 20) + 16); // 16 to 35
    // Youth scaling: base quality ramps from 0.25 at age 16 to 1.0 at age 23.5, then stays flat.
    // A power-law talent roll (U^3) biases most players toward the base while allowing
    // rare standouts to approach full quality — creating a natural prodigy spectrum.
    // Multiplied with teamQuality so stronger teams still produce better prospects.
    const baseAgeQuality = resolvedAge < 23.5 ? Math.min(1.0, 0.25 + (resolvedAge - 16) * 0.1) : 1.0;
    const talentRoll = Math.pow(Math.random(), 3); // biased toward 0, rare highs
    const ageQuality = baseAgeQuality + talentRoll * (1.0 - baseAgeQuality);
    const effectiveQuality = teamQuality * ageQuality;
    const birthday = birthdayForAge(resolvedAge, currentSeasonYear, Math.random());

    return { resolvedAge, effectiveQuality, birthday };
  }

  private generatePlayerBaseAttributes(effectiveQuality: number, position: Position): Record<StatKey, number> {
    const values: Record<StatKey, number> = {
      speed: this.randomStat(20, 90, effectiveQuality),
      strength: this.randomStat(20, 90, effectiveQuality),
      endurance: this.randomStat(20, 90, effectiveQuality),
      flair: this.randomStat(20, 90, effectiveQuality),
      vision: this.randomStat(20, 90, effectiveQuality),
      determination: this.randomStat(20, 90, effectiveQuality),
      tackling: this.randomStat(20, 90, effectiveQuality),
      shooting: this.randomStat(20, 90, effectiveQuality),
      heading: this.randomStat(20, 90, effectiveQuality),
      longPassing: this.randomStat(20, 90, effectiveQuality),
      shortPassing: this.randomStat(20, 90, effectiveQuality),
      handling: position === PositionEnum.GOALKEEPER ? this.randomStat(60, 99, effectiveQuality) : this.randomStat(1, 40, effectiveQuality),
      reflexes: position === PositionEnum.GOALKEEPER ? this.randomStat(60, 99, effectiveQuality) : this.randomStat(1, 40, effectiveQuality),
      commandOfArea: position === PositionEnum.GOALKEEPER ? this.randomStat(60, 99, effectiveQuality) : this.randomStat(1, 40, effectiveQuality),
      clutch: this.randomStat(40, 80, effectiveQuality),
      composure: this.randomStat(40, 80, effectiveQuality),
      morale: this.randomStat(40, 80, effectiveQuality),
      consistency: this.randomStat(40, 80, effectiveQuality),
      aggressiveness: this.randomStat(40, 80, effectiveQuality),
      fitness: this.randomStat(40, 80, effectiveQuality),
      luck: this.randomStat(1, 100, effectiveQuality),
      injuryRate: this.randomStat(1, 100, effectiveQuality),
      overall: 0
    };

    // Boost stats based on position
    if (position === PositionEnum.DEFENDER) {
      values.tackling = this.randomStat(60, 99, effectiveQuality);
      values.heading = this.randomStat(50, 90, effectiveQuality);
    } else if (position === PositionEnum.MIDFIELDER) {
      values.shortPassing = this.randomStat(60, 99, effectiveQuality);
      values.longPassing = this.randomStat(60, 99, effectiveQuality);
      values.vision = this.randomStat(60, 99, effectiveQuality);
    } else if (position === PositionEnum.FORWARD) {
      values.shooting = this.randomStat(60, 99, effectiveQuality);
      values.speed = this.randomStat(60, 99, effectiveQuality);
      values.flair = this.randomStat(60, 99, effectiveQuality);
    }

    values.overall = calculateOverall(values, position);
    return values;
  }

  private generatePlayerProgression(overall: number, position: Position): { potential: number, professionalism: number, temperament: number, juniorEndAge: number, peakEndAge: number, seniorEndAge: number } {
    const potential = clamp(overall + Math.floor(Math.random() * (100 - overall)) + 1, overall + 1, 100);
    const professionalism = Math.floor(Math.random() * 100) + 1;
    const temperament = Math.floor(Math.random() * 100) + 1;

    let baseJuniorEnd = 22, basePeakEnd = 28, baseSeniorEnd = 32;
    if (position === PositionEnum.GOALKEEPER) { baseJuniorEnd = 23; basePeakEnd = 32; baseSeniorEnd = 36; }
    else if (position === PositionEnum.DEFENDER) { baseJuniorEnd = 22; basePeakEnd = 29; baseSeniorEnd = 33; }
    else if (position === PositionEnum.FORWARD) { baseJuniorEnd = 21; basePeakEnd = 27; baseSeniorEnd = 32; }

    const juniorEndAge = baseJuniorEnd + clamp(Math.floor((potential - 50) / 10), -3, 3);
    const peakEndAge = basePeakEnd + clamp(Math.floor((professionalism - 50) / 10), -3, 3);
    const seniorEndAge = baseSeniorEnd + clamp(Math.floor((professionalism - 50) / 20), -3, 3);

    return {
      potential,
      professionalism,
      temperament,
      juniorEndAge,
      peakEndAge,
      seniorEndAge
    };
  }

  private generatePlayerSeasonAttributes(currentSeasonYear: number, values: Record<StatKey, number>): PlayerSeasonAttributes {
    return {
      seasonYear: currentSeasonYear,
      speed: buildStat('speed', values.speed),
      strength: buildStat('strength', values.strength),
      endurance: buildStat('endurance', values.endurance),
      flair: buildStat('flair', values.flair),
      vision: buildStat('vision', values.vision),
      determination: buildStat('determination', values.determination),
      tackling: buildStat('tackling', values.tackling),
      shooting: buildStat('shooting', values.shooting),
      heading: buildStat('heading', values.heading),
      longPassing: buildStat('longPassing', values.longPassing),
      shortPassing: buildStat('shortPassing', values.shortPassing),
      handling: buildStat('handling', values.handling),
      reflexes: buildStat('reflexes', values.reflexes),
      commandOfArea: buildStat('commandOfArea', values.commandOfArea),
      clutch: buildStat('clutch', values.clutch),
      composure: buildStat('composure', values.composure),
      morale: buildStat('morale', values.morale),
      consistency: buildStat('consistency', values.consistency),
      aggressiveness: buildStat('aggressiveness', values.aggressiveness),
      fitness: buildStat('fitness', values.fitness),
      luck: buildStat('luck', values.luck),
      injuryRate: buildStat('injuryRate', values.injuryRate),
      overall: buildStat('overall', values.overall)
    };
  }

  private randomStat(min = 20, max = 90, teamQuality = 1.0): number {
    const range = max - min;
    // Scale position within [min, max] rather than scaling the absolute value.
    // quality < 1.0 lowers the ceiling; quality > 1.0 raises the floor.
    // This preserves real variance even for high-floor ranges (e.g. GK handling min=60).
    const qualityMax = Math.round(min + range * Math.min(teamQuality, 1.0));
    const qualityMin = Math.round(min + range * Math.max(teamQuality - 1.0, 0));
    return Math.floor(Math.random() * (qualityMax - qualityMin + 1)) + qualityMin;
  }

  private generateSchedule(teams: Team[], currentSeasonYear: number): Match[] {
    if (teams.length % 2 !== 0) {
      throw new Error(`generateSchedule: round-robin algorithm requires an even number of teams. Got ${teams.length}`);
    }

    const schedule: Match[] = [];
    const numTeams = teams.length;
    const numWeeks = (numTeams - 1) * 2; // Home and away

    // Round Robin scheduling algorithm
    const teamIds = teams.map(t => t.id);

    for (let week = 1; week <= numWeeks / 2; week++) {
      for (let i = 0; i < numTeams / 2; i++) {
        const home = teamIds[i];
        const away = teamIds[numTeams - 1 - i];

        schedule.push({
          id: this.rng.nextUUID(),
          seasonYear: currentSeasonYear,
          homeTeamId: home,
          awayTeamId: away,
          homeScore: undefined,
          awayScore: undefined,
          week,
          played: false
        });

        // Add reverse fixture for second half of season
        schedule.push({
          id: this.rng.nextUUID(),
          seasonYear: currentSeasonYear,
          homeTeamId: away,
          awayTeamId: home,
          homeScore: undefined,
          awayScore: undefined,
          week: week + (numWeeks / 2),
          played: false
        });
      }

      // Rotate teams (keep first team fixed)
      teamIds.splice(1, 0, teamIds.pop()!);
    }

    return schedule.sort((a, b) => a.week - b.week);
  }
}
