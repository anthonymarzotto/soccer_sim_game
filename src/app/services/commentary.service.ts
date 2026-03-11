import { Injectable } from '@angular/core';
import { PlayByPlayEvent, FieldZone } from '../models/simulation.types';
import { Player, Team } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class CommentaryService {
  
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
    }
  };

  generateEventCommentary(event: PlayByPlayEvent, homeTeam: Team, awayTeam: Team, style: 'DETAILED' | 'BRIEF' = 'DETAILED'): string {
    const commentaryStyle = this.COMMENTARY_STYLES[style];
    let template = '';
    let playerName = '';
    let targetName = '';

    if (event.playerIds.length > 0) {
      const player = this.findPlayerById(event.playerIds[0], homeTeam, awayTeam);
      playerName = player ? player.name : 'Player';
    }

    if (event.playerIds.length > 1) {
      const target = this.findPlayerById(event.playerIds[1], homeTeam, awayTeam);
      targetName = target ? target.name : 'Player';
    }

    switch (event.type) {
      case 'PASS':
        template = this.getRandomCommentary(commentaryStyle.pass);
        return this.formatCommentary(template, playerName, targetName);
      
      case 'TACKLE':
      case 'INTERCEPTION':
        template = this.getRandomCommentary(commentaryStyle.tackle);
        return this.formatCommentary(template, playerName, targetName);
      
      case 'SHOT':
        template = this.getRandomCommentary(commentaryStyle.shot);
        return this.formatCommentary(template, playerName, targetName);
      
      case 'SAVE':
        template = this.getRandomCommentary(commentaryStyle.save);
        return this.formatCommentary(template, playerName, targetName);
      
      case 'GOAL':
        template = this.getRandomCommentary(commentaryStyle.goal);
        return this.formatCommentary(template, playerName, targetName);
      
      case 'YELLOW_CARD':
      case 'RED_CARD':
        return `${playerName} receives a ${event.type === 'YELLOW_CARD' ? 'yellow' : 'red'} card!`;
      
      case 'SUBSTITUTION':
        const subIn = this.findPlayerById(event.playerIds[1], homeTeam, awayTeam);
        const subOut = this.findPlayerById(event.playerIds[0], homeTeam, awayTeam);
        return `${subOut?.name || 'Player'} off, ${subIn?.name || 'Player'} on.`;
      
      default:
        return event.description;
    }
  }

  generateZoneCommentary(zone: FieldZone, teamName: string): string {
    switch (zone) {
      case 'DEFENSE':
        return `${teamName} defending deep, looking to build from the back.`;
      case 'MIDFIELD':
        return `${teamName} controlling the tempo in midfield.`;
      case 'ATTACK':
        return `${teamName} pushing forward, looking for an opening!`;
      default:
        return `${teamName} in possession.`;
    }
  }

  generateMatchSummary(events: PlayByPlayEvent[], homeTeam: Team, awayTeam: Team): string[] {
    const summary: string[] = [];
    const goals = events.filter(e => e.type === 'GOAL');
    const shots = events.filter(e => e.type === 'SHOT');
    const saves = events.filter(e => e.type === 'SAVE');
    const fouls = events.filter(e => e.type === 'FOUL' || e.type === 'YELLOW_CARD' || e.type === 'RED_CARD');

    if (goals.length > 0) {
      summary.push(`Match ended with ${goals.length} goal(s) scored.`);
      goals.forEach(goal => {
        const scorer = this.findPlayerById(goal.playerIds[0], homeTeam, awayTeam);
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
    const goals = playerEvents.filter(e => e.type === 'GOAL').length;
    const assists = playerEvents.filter(e => e.type === 'PASS' && e.success).length;
    const tackles = playerEvents.filter(e => e.type === 'TACKLE').length;
    const shots = playerEvents.filter(e => e.type === 'SHOT').length;

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

  private findPlayerById(playerId: string, homeTeam: Team, awayTeam: Team): Player | undefined {
    return homeTeam.players.find(p => p.id === playerId) || 
           awayTeam.players.find(p => p.id === playerId);
  }

  generateStartingXICommentary(homeTeam: Team, awayTeam: Team): string[] {
    const commentary = [
      `We're ready for kick-off!`,
      `${homeTeam.name} vs ${awayTeam.name}`,
      `The teams are lining up:`,
      `Home team: ${homeTeam.players.filter(p => p.role !== 'Bench' && p.role !== 'Not Dressed').map(p => p.name).join(', ')}`,
      `Away team: ${awayTeam.players.filter(p => p.role !== 'Bench' && p.role !== 'Not Dressed').map(p => p.name).join(', ')}`,
      `Let's play some football!`
    ];
    return commentary;
  }

  generateHalfTimeCommentary(homeScore: number, awayScore: number, events: PlayByPlayEvent[]): string {
    const goals = events.filter(e => e.type === 'GOAL').length;
    const shots = events.filter(e => e.type === 'SHOT').length;
    
    return `Half-time: ${homeScore}-${awayScore}. ${goals} goals, ${shots} shots. Plenty to play for in the second half!`;
  }

  generateFullTimeCommentary(homeScore: number, awayScore: number, events: PlayByPlayEvent[]): string {
    const goals = events.filter(e => e.type === 'GOAL').length;
    
    if (homeScore > awayScore) {
      return `Full-time! ${homeScore}-${awayScore} to the home side! A well-deserved victory!`;
    } else if (awayScore > homeScore) {
      return `Full-time! ${awayScore}-${homeScore} to the visitors! An away win!`;
    } else {
      return `Full-time! ${homeScore}-${awayScore}. A share of the points!`;
    }
  }
}