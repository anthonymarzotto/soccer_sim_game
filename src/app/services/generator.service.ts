import { Injectable, inject } from '@angular/core';
import { Player, Team, Match, Position, Role } from '../models/types';
import { Role as RoleEnum, Position as PositionEnum } from '../models/enums';
import { FormationLibraryService } from './formation-library.service';

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

  generateLeague(): { teams: Team[], schedule: Match[] } {
    const teams: Team[] = this.teamNames.map((name, index) => this.generateTeam(index.toString(), name));
    const schedule = this.generateSchedule(teams);
    return { teams, schedule };
  }

  private generateTeam(id: string, name: string): Team {
    const players: Player[] = [];
    
    // 11 Starters: 1 GK, 4 DEF, 4 MID, 2 FWD
    players.push(this.generatePlayer(id, PositionEnum.GOALKEEPER, RoleEnum.STARTER));
    for (let i = 0; i < 4; i++) players.push(this.generatePlayer(id, PositionEnum.DEFENDER, RoleEnum.STARTER));
    for (let i = 0; i < 4; i++) players.push(this.generatePlayer(id, PositionEnum.MIDFIELDER, RoleEnum.STARTER));
    for (let i = 0; i < 2; i++) players.push(this.generatePlayer(id, PositionEnum.FORWARD, RoleEnum.STARTER));

    // 9 Bench: 1 GK, 2 DEF, 4 MID, 2 FWD
    players.push(this.generatePlayer(id, PositionEnum.GOALKEEPER, RoleEnum.BENCH));
    for (let i = 0; i < 2; i++) players.push(this.generatePlayer(id, PositionEnum.DEFENDER, RoleEnum.BENCH));
    for (let i = 0; i < 4; i++) players.push(this.generatePlayer(id, PositionEnum.MIDFIELDER, RoleEnum.BENCH));
    for (let i = 0; i < 2; i++) players.push(this.generatePlayer(id, PositionEnum.FORWARD, RoleEnum.BENCH));

    // 5 Not Dressed: Random positions
    const positions: Position[] = [PositionEnum.GOALKEEPER, PositionEnum.DEFENDER, PositionEnum.MIDFIELDER, PositionEnum.FORWARD];
    for (let i = 0; i < 5; i++) {
      const pos = positions[Math.floor(Math.random() * positions.length)];
      players.push(this.generatePlayer(id, pos, RoleEnum.RESERVE));
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
      stats: {
        played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, last5: []
      }
    };
  }

  private generatePlayer(teamId: string, position: Position, role: Role): Player {
    const id = Math.random().toString(36).substring(2, 9);
    const firstName = this.firstNames[Math.floor(Math.random() * this.firstNames.length)];
    const lastName = this.lastNames[Math.floor(Math.random() * this.lastNames.length)];
    const name = `${firstName} ${lastName}`;

    const age = Math.floor(Math.random() * 20) + 16; // 16 to 35
    const height = Math.floor(Math.random() * 30) + 165; // 165cm to 195cm
    const weight = Math.floor(Math.random() * 25) + 65; // 65kg to 90kg
    const nationality = this.nationalities[Math.floor(Math.random() * this.nationalities.length)];

    const physical = {
      speed: this.randomStat(),
      strength: this.randomStat(),
      endurance: this.randomStat()
    };

    const mental = {
      flair: this.randomStat(),
      vision: this.randomStat(),
      determination: this.randomStat()
    };

    const skills = {
      tackling: this.randomStat(),
      shooting: this.randomStat(),
      heading: this.randomStat(),
      longPassing: this.randomStat(),
      shortPassing: this.randomStat(),
      goalkeeping: position === PositionEnum.GOALKEEPER ? this.randomStat(60, 99) : this.randomStat(1, 40)
    };

    const hidden = {
      luck: this.randomStat(1, 100),
      injuryRate: this.randomStat(1, 100)
    };

    // Boost stats based on position
    if (position === PositionEnum.DEFENDER) {
      skills.tackling = this.randomStat(60, 99);
      skills.heading = this.randomStat(50, 90);
    } else if (position === PositionEnum.MIDFIELDER) {
      skills.shortPassing = this.randomStat(60, 99);
      skills.longPassing = this.randomStat(60, 99);
      mental.vision = this.randomStat(60, 99);
    } else if (position === PositionEnum.FORWARD) {
      skills.shooting = this.randomStat(60, 99);
      physical.speed = this.randomStat(60, 99);
      mental.flair = this.randomStat(60, 99);
    }

    const overall = Math.floor((
      physical.speed + physical.strength + mental.flair + mental.vision + mental.determination +
      skills.tackling + skills.shooting + skills.heading + skills.longPassing + skills.shortPassing + (position === PositionEnum.GOALKEEPER ? skills.goalkeeping * 5 : 0)
    ) / (position === PositionEnum.GOALKEEPER ? 15 : 10));

    return {
      id,
      name,
      teamId,
      position,
      role,
      personal: { height, weight, age, nationality },
      physical,
      mental,
      skills,
      hidden,
      overall,
      careerStats: {
        matchesPlayed: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        shots: 0,
        shotsOnTarget: 0,
        tackles: 0,
        interceptions: 0,
        passes: 0,
        saves: 0,
        cleanSheets: 0,
        minutesPlayed: 0
      }
    };
  }

  private randomStat(min = 20, max = 90): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private generateSchedule(teams: Team[]): Match[] {
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
