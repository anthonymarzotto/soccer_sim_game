import { Injectable } from '@angular/core';
import { PlayByPlayEvent, FieldZone } from '../models/simulation.types';
import { Player, Team } from '../models/types';
import { resolveTeamPlayers } from '../models/team-players';
import { CommentaryStyle, EventType, Role } from '../models/enums';

@Injectable({
  providedIn: 'root'
})
export class CommentaryService {
  private getTeamPlayers(team: Team, explicitPlayers?: Player[]): Player[] {
    return resolveTeamPlayers(team, explicitPlayers);
  }
  
  private readonly COMMENTARY_STYLES = {
    DETAILED: {
      pass: [
        "Great pass from {player} to {target}!",
        "{player} finds {target} with a precise through ball!",
        "Excellent vision from {player}, picks out {target} perfectly!",
        "{player} slides a perfect pass to {target} in the final third!",
        "Smart ball from {player} to {target}, who's in plenty of space!"
      ],
      tackle: [
        "Strong tackle from {player} wins the ball back!",
        "{player} makes a crucial interception!",
        "Excellent defensive work from {player}!",
        "{player} reads the game and cuts out the pass!",
        "Brilliant timing from {player} to dispossess the opponent!"
      ],
      shot: [
        "What a strike from {player}!",
        "{player} lets fly from distance!",
        "Great effort from {player}, on target!",
        "{player} tests the goalkeeper with a powerful shot!",
        "Excellent technique from {player} in the box!"
      ],
      save: [
        "Outstanding save from {player}!",
        "{player} makes a fantastic stop!",
        "Brilliant reaction save from {player}!",
        "{player} denies the shot with a strong hand!",
        "Superb positioning from {player}!"
      ],
      goal: [
        "GOAL! {player} scores! What a finish!",
        "And that's the difference! {player} finds the net!",
        "Unstoppable from {player}! The crowd goes wild!",
        "{player} with a clinical finish!",
        "Magnificent goal from {player}!"
      ],
      miss: [
        "Close! {player} just wide of the target!",
        "{player} should have done better there!",
        "Excellent save keeps {player} out!",
        "{player} hits the post!",
        "Just over the bar from {player}!"
      ],
      foul: [
        "Foul by {player}! That's a dangerous challenge!",
        "{player} goes in too hard!",
        "Free kick coming up after a foul by {player}!",
        "{player} caught {target} late!",
        "That's a bookable offense from {player}!"
      ]
    },
    BRIEF: {
      pass: ["Pass to {target}", "Ball to {target}", "Find {target}", "To {target}"],
      tackle: ["Tackle by {player}", "Interception", "Ball won", "Clearance"],
      shot: ["Shot by {player}", "Attempt on goal", "On target", "Dangerous!"],
      save: ["Save!", "Good stop", "Brilliant!", "Denied!"],
      goal: ["GOAL!", "Score!", "Net!", "Bulleye!"],
      miss: ["Wide!", "Over!", "Saved!", "Post!"],
      foul: ["Foul!", "Free kick", "Card!", "Dangerous!"]
    },
    STATS_ONLY: {
      pass: ["Pass", "Pass", "Pass", "Pass"],
      tackle: ["Tackle", "Tackle", "Tackle", "Tackle"],
      shot: ["Shot", "Shot", "Shot", "Shot"],
      save: ["Save", "Save", "Save", "Save"],
      goal: ["Goal", "Goal", "Goal", "Goal"],
      miss: ["Miss", "Miss", "Miss", "Miss"],
      foul: ["Foul", "Foul", "Foul", "Foul"]
    }
  };

  generateEventCommentary(
    event: PlayByPlayEvent,
    homeTeam: Team,
    awayTeam: Team,
    style: CommentaryStyle = CommentaryStyle.DETAILED,
    rosters?: { homePlayers?: Player[]; awayPlayers?: Player[] }
  ): string {
    const commentaryStyle = this.COMMENTARY_STYLES[style];
    let template = '';
    let playerName = '';
    let targetName = '';
    const homePlayers = this.getTeamPlayers(homeTeam, rosters?.homePlayers);
    const awayPlayers = this.getTeamPlayers(awayTeam, rosters?.awayPlayers);

    if (event.playerIds.length > 0) {
      const player = this.findPlayerById(event.playerIds[0], homePlayers, awayPlayers);
      playerName = player ? player.name : 'Player';
    }

    if (event.playerIds.length > 1) {
      const target = this.findPlayerById(event.playerIds[1], homePlayers, awayPlayers);
      targetName = target ? target.name : 'Player';
    }

    switch (event.type) {
      case EventType.PASS:
        template = this.getRandomCommentary(commentaryStyle.pass);
        return this.formatCommentary(template, playerName, targetName);
      
      case EventType.TACKLE:
      case EventType.INTERCEPTION:
        template = this.getRandomCommentary(commentaryStyle.tackle);
        return this.formatCommentary(template, playerName, targetName);
      
      case EventType.SHOT:
        template = this.getRandomCommentary(commentaryStyle.shot);
        return this.formatCommentary(template, playerName, targetName);
      
      case EventType.SAVE:
        template = this.getRandomCommentary(commentaryStyle.save);
        return this.formatCommentary(template, playerName, targetName);
      
      case EventType.GOAL: {
        template = this.getRandomCommentary(commentaryStyle.goal);
        return this.formatCommentary(template, playerName, targetName);
      }
      
      case EventType.YELLOW_CARD:
      case EventType.RED_CARD:
        return `${playerName} receives a ${event.type === EventType.YELLOW_CARD ? 'yellow' : 'red'} card!`;
      
      case EventType.SUBSTITUTION: {
        const subIn = this.findPlayerById(event.playerIds[1], homePlayers, awayPlayers);
        const subOut = this.findPlayerById(event.playerIds[0], homePlayers, awayPlayers);
        return `${subOut?.name || 'Player'} off, ${subIn?.name || 'Player'} on.`;
      }
      
      default:
        return event.description;
    }
  }

  generateZoneCommentary(zone: FieldZone, teamName: string): string {
    switch (zone) {
      case FieldZone.DEFENSE:
        return `${teamName} defending deep, looking to build from the back.`;
      case FieldZone.MIDFIELD:
        return `${teamName} controlling the tempo in midfield.`;
      case FieldZone.ATTACK:
        return `${teamName} pushing forward, looking for an opening!`;
      default:
        return `${teamName} in possession.`;
    }
  }

  generateMatchSummary(
    events: PlayByPlayEvent[],
    homeTeam: Team,
    awayTeam: Team,
    rosters?: { homePlayers?: Player[]; awayPlayers?: Player[] }
  ): string[] {
    const summary: string[] = [];
    const homePlayers = this.getTeamPlayers(homeTeam, rosters?.homePlayers);
    const awayPlayers = this.getTeamPlayers(awayTeam, rosters?.awayPlayers);
    const goals = events.filter(e => e.type === EventType.GOAL);
    const shots = events.filter(e => e.type === EventType.SHOT);
    const saves = events.filter(e => e.type === EventType.SAVE);
    const fouls = events.filter(e => e.type === EventType.FOUL || e.type === EventType.YELLOW_CARD || e.type === EventType.RED_CARD);

    if (goals.length > 0) {
      summary.push(`Match ended with ${goals.length} goal(s) scored.`);
      goals.forEach(goal => {
        const scorer = this.findPlayerById(goal.playerIds[0], homePlayers, awayPlayers);
        summary.push(`${goal.time}': GOAL by ${scorer?.name || 'Player'}!`);
      });
    }

    summary.push(`Total shots: ${shots.length}`);
    summary.push(`Saves: ${saves.length}`);
    summary.push(`Fouls: ${fouls.length}`);

    return summary;
  }

  generatePlayerHighlight(player: Player, events: PlayByPlayEvent[]): string {
    const playerEvents = events.filter(e => e.playerIds.includes(player.id));
    const goals = playerEvents.filter(e => e.type === EventType.GOAL).length;
    const assists = playerEvents.filter(e => e.type === EventType.PASS && e.success).length;
    const tackles = playerEvents.filter(e => e.type === EventType.TACKLE).length;
    const shots = playerEvents.filter(e => e.type === EventType.SHOT).length;

    if (goals > 0 || assists > 0) {
      return `${player.name} was the star! ${goals} goals, ${assists} assists.`;
    } else if (shots > 0) {
      return `${player.name} had ${shots} shots on target.`;
    } else if (tackles > 0) {
      return `${player.name} made ${tackles} crucial tackles.`;
    } else {
      return `${player.name} had a quiet game.`;
    }
  }

  generateTacticalCommentary(homeTactics: string, awayTactics: string): string {
    const tactics = [
      `${homeTactics} vs ${awayTactics} - An interesting tactical battle!`,
      `Both teams looking to impose their style of play.`,
      `Can ${homeTactics} break down ${awayTactics}?`,
      `Tactical discipline will be key in this encounter.`
    ];
    return this.getRandomCommentary(tactics);
  }

  private getRandomCommentary(templates: string[]): string {
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private formatCommentary(template: string, player: string, target: string): string {
    return template
      .replace('{player}', player)
      .replace('{target}', target);
  }

  private findPlayerById(playerId: string, homePlayers: Player[], awayPlayers: Player[]): Player | undefined {
    return homePlayers.find(p => p.id === playerId) ||
           awayPlayers.find(p => p.id === playerId);
  }

  generateStartingXICommentary(
    homeTeam: Team,
    awayTeam: Team,
    rosters?: { homePlayers?: Player[]; awayPlayers?: Player[] }
  ): string[] {
    const homePlayers = this.getTeamPlayers(homeTeam, rosters?.homePlayers);
    const awayPlayers = this.getTeamPlayers(awayTeam, rosters?.awayPlayers);

    const commentary = [
      `We're ready for kick-off!`,
      `${homeTeam.name} vs ${awayTeam.name}`,
      `The teams are lining up:`,
      `Home team: ${homePlayers.filter(p => p.role === Role.STARTER).map(p => p.name).join(', ')}`,
      `Away team: ${awayPlayers.filter(p => p.role === Role.STARTER).map(p => p.name).join(', ')}`,
      `Let's play some football!`
    ];
    return commentary;
  }

  generateHalfTimeCommentary(homeScore: number, awayScore: number, events: PlayByPlayEvent[]): string {
    const goals = events.filter(e => e.type === EventType.GOAL).length;
    const shots = events.filter(
      (e) => e.type === EventType.SHOT || e.type === EventType.MISS || e.type === EventType.SAVE || e.type === EventType.GOAL
    ).length;
    
    return `Half-time: ${homeScore}-${awayScore}. ${goals} goals, ${shots} shots. Plenty to play for in the second half!`;
  }

  generateFullTimeCommentary(homeScore: number, awayScore: number, events: PlayByPlayEvent[]): string {
    const goals = events.filter(e => e.type === EventType.GOAL).length;
    
    if (homeScore > awayScore) {
      return `Full-time! ${homeScore}-${awayScore} to the home side! ${goals} goals scored. A well-deserved victory!`;
    } else if (awayScore > homeScore) {
      return `Full-time! ${awayScore}-${homeScore} to the visitors! ${goals} goals scored. An away win!`;
    } else {
      return `Full-time! ${homeScore}-${awayScore}. ${goals} goals scored. A share of the points!`;
    }
  }
}