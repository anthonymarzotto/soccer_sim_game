import { Injectable, inject } from '@angular/core';
import { Player, Team, Match, Position, Role, PlayerSeasonAttributes, StatKey } from '../models/types';
import { Role as RoleEnum, Position as PositionEnum } from '../models/enums';
import { FormationLibraryService } from './formation-library.service';
import { createEmptyPlayerCareerStats } from '../models/player-career-stats';
import { createEmptyTeamStats } from '../models/season-history';
import { buildStat } from '../models/stat-definitions';
import { birthdayForAge } from '../models/player-age';
import { calculateOverall } from '../models/player-progression';
import { clamp } from '../utils/math';

@Injectable({
  providedIn: 'root'
})
export class GeneratorService {
  private formationLibrary = inject(FormationLibraryService);

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
    const schedule = this.generateSchedule(teams, currentSeasonYear);
    return { teams, schedule, currentSeasonYear };
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

    // 5 Not Dressed: Random positions
    const positions: Position[] = [PositionEnum.GOALKEEPER, PositionEnum.DEFENDER, PositionEnum.MIDFIELDER, PositionEnum.FORWARD];
    for (let i = 0; i < 5; i++) {
      const pos = positions[Math.floor(Math.random() * positions.length)];
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
      }]
    };
  }

  public generatePlayer(teamId: string, position: Position, role: Role, teamQuality = 1.0, currentSeasonYear = new Date().getFullYear(), age?: number): Player {
    const id = crypto.randomUUID();
    const firstName = this.firstNames[Math.floor(Math.random() * this.firstNames.length)];
    const lastName = this.lastNames[Math.floor(Math.random() * this.lastNames.length)];
    const name = `${firstName} ${lastName}`;

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
    const height = Math.floor(Math.random() * 30) + 165; // 165cm to 195cm
    const weight = Math.floor(Math.random() * 25) + 65; // 65kg to 90kg
    const nationality = this.nationalities[Math.floor(Math.random() * this.nationalities.length)];

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

    const potential = clamp(values.overall + Math.floor(Math.random() * (100 - values.overall)) + 1, values.overall + 1, 100);
    const professionalism = Math.floor(Math.random() * 100) + 1;
    const temperament = Math.floor(Math.random() * 100) + 1;

    let baseJuniorEnd = 22, basePeakEnd = 28, baseSeniorEnd = 32;
    if (position === PositionEnum.GOALKEEPER) { baseJuniorEnd = 23; basePeakEnd = 32; baseSeniorEnd = 36; }
    else if (position === PositionEnum.DEFENDER) { baseJuniorEnd = 22; basePeakEnd = 29; baseSeniorEnd = 33; }
    else if (position === PositionEnum.FORWARD) { baseJuniorEnd = 21; basePeakEnd = 27; baseSeniorEnd = 32; }

    const juniorEndAge = baseJuniorEnd + clamp(Math.floor((potential - 50) / 10), -3, 3);
    const peakEndAge = basePeakEnd + clamp(Math.floor((professionalism - 50) / 10), -3, 3);
    const seniorEndAge = baseSeniorEnd + clamp(Math.floor((professionalism - 50) / 20), -3, 3);

    const progression = {
      potential,
      professionalism,
      temperament,
      juniorEndAge,
      peakEndAge,
      seniorEndAge
    };

    const seasonAttributes: PlayerSeasonAttributes = {
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

    return {
      id,
      name,
      teamId,
      position,
      role,
      personal: { height, weight, birthday, nationality },
      seasonAttributes: [seasonAttributes],
      careerStats: [createEmptyPlayerCareerStats(currentSeasonYear, teamId)],
      mood: 100,
      fatigue: 100,
      injuries: [],
      progression
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
    const schedule: Match[] = [];
    const numTeams = teams.length;
    const numWeeks = (numTeams - 1) * 2; // Home and away
    let matchId = 1;

    // Round Robin scheduling algorithm
    const teamIds = teams.map(t => t.id);

    for (let week = 1; week <= numWeeks / 2; week++) {
      for (let i = 0; i < numTeams / 2; i++) {
        const home = teamIds[i];
        const away = teamIds[numTeams - 1 - i];

        schedule.push({
          id: (matchId++).toString(),
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
          id: (matchId++).toString(),
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
