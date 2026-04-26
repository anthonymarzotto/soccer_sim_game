import { rankThreeStars } from './match-stars';
import { PlayerStatistics } from './types';
import { Position } from './enums';

function makeStat(playerId: string, rating: number, overrides: Partial<PlayerStatistics> = {}): PlayerStatistics {
  return {
    playerId,
    playerName: playerId,
    position: Position.MIDFIELDER,
    rating,
    minutesPlayed: 90,
    passes: 0,
    passesSuccessful: 0,
    shots: 0,
    shotsOnTarget: 0,
    misses: 0,
    goals: 0,
    assists: 0,
    tackles: 0,
    tacklesSuccessful: 0,
    interceptions: 0,
    saves: 0,
    fouls: 0,
    foulsSuffered: 0,
    yellowCards: 0,
    redCards: 0,
    ...overrides
  };
}

describe('rankThreeStars', () => {
  const HOME = 'team-home';
  const AWAY = 'team-away';

  it('returns at most 3 entries', () => {
    const home = [makeStat('h1', 70), makeStat('h2', 60), makeStat('h3', 55)];
    const away = [makeStat('a1', 65), makeStat('a2', 50)];
    const result = rankThreeStars(home, away, null, HOME, AWAY);
    expect(result.length).toBe(3);
  });

  it('returns fewer than 3 when fewer rated players exist', () => {
    const home = [makeStat('h1', 70)];
    const away = [makeStat('a1', 0)]; // unrated bench player excluded
    const result = rankThreeStars(home, away, null, HOME, AWAY);
    expect(result.length).toBe(1);
  });

  it('assigns ranks 1, 2, 3 in order', () => {
    const home = [makeStat('h1', 70)];
    const away = [makeStat('a1', 60), makeStat('a2', 50)];
    const result = rankThreeStars(home, away, null, HOME, AWAY);
    expect(result.map(r => r.rank)).toEqual([1, 2, 3]);
  });

  it('orders by rating descending', () => {
    const home = [makeStat('h1', 50)];
    const away = [makeStat('a1', 80), makeStat('a2', 65)];
    const result = rankThreeStars(home, away, null, HOME, AWAY);
    expect(result[0].stats.playerId).toBe('a1');
    expect(result[1].stats.playerId).toBe('a2');
    expect(result[2].stats.playerId).toBe('h1');
  });

  it('breaks rating tie by winning team', () => {
    const home = [makeStat('h1', 70)];
    const away = [makeStat('a1', 70)]; // same rating; home team wins
    const result = rankThreeStars(home, away, HOME, HOME, AWAY);
    expect(result[0].stats.playerId).toBe('h1');
    expect(result[1].stats.playerId).toBe('a1');
  });

  it('breaks tie by goals after winning-team', () => {
    const home = [makeStat('h1', 70, { goals: 1 })];
    const away = [makeStat('a1', 70, { goals: 2 })]; // both on no-winner draw
    const result = rankThreeStars(home, away, null, HOME, AWAY);
    expect(result[0].stats.playerId).toBe('a1');
  });

  it('breaks tie by saves after goals', () => {
    const home = [makeStat('h1', 70, { goals: 0, saves: 3 })];
    const away = [makeStat('a1', 70, { goals: 0, saves: 1 })];
    const result = rankThreeStars(home, away, null, HOME, AWAY);
    expect(result[0].stats.playerId).toBe('h1');
  });

  it('breaks tie by assists after saves', () => {
    const home = [makeStat('h1', 70, { assists: 2 })];
    const away = [makeStat('a1', 70, { assists: 1 })];
    const result = rankThreeStars(home, away, null, HOME, AWAY);
    expect(result[0].stats.playerId).toBe('h1');
  });

  it('breaks tie by fewer cards after assists', () => {
    const home = [makeStat('h1', 70, { yellowCards: 0 })];
    const away = [makeStat('a1', 70, { yellowCards: 1 })];
    const result = rankThreeStars(home, away, null, HOME, AWAY);
    expect(result[0].stats.playerId).toBe('h1');
  });

  it('breaks tie by playerId lexicographic order as last resort', () => {
    const home = [makeStat('aaa', 70)];
    const away = [makeStat('bbb', 70)];
    const result = rankThreeStars(home, away, null, HOME, AWAY);
    expect(result[0].stats.playerId).toBe('aaa');
  });

  it('excludes bench players with rating 0', () => {
    const home = [makeStat('h1', 70), makeStat('h_bench', 0)];
    const away = [makeStat('a1', 65), makeStat('a_bench', 0)];
    const result = rankThreeStars(home, away, null, HOME, AWAY);
    expect(result.every(r => r.stats.rating > 0)).toBe(true);
    expect(result.length).toBe(2);
  });

  it('sets teamId correctly for home and away players', () => {
    const home = [makeStat('h1', 80)];
    const away = [makeStat('a1', 70)];
    const result = rankThreeStars(home, away, null, HOME, AWAY);
    expect(result[0].teamId).toBe(HOME);
    expect(result[1].teamId).toBe(AWAY);
  });
});
