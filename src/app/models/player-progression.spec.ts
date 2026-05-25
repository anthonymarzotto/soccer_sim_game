import { Player, Position } from './types';
import { Phase } from './enums';
import {
  derivePhase,
  phaseGrowthWeight,
  phaseDecayWeight,
  getStatKeysForCategory,
  calculateOverall
} from './player-progression';

describe('Player Progression', () => {

  describe('calculateOverall', () => {
    const rawOutfieldAttrs = {
      speed: 10, strength: 10, flair: 10, vision: 10, determination: 10,
      tackling: 10, shooting: 10, heading: 10, longPassing: 10, shortPassing: 10,
      handling: 5, reflexes: 5, commandOfArea: 5
    };

    const statObjectAttrs = {
      speed: { value: 20 }, strength: { value: 20 }, flair: { value: 20 }, vision: { value: 20 }, determination: { value: 20 },
      tackling: { value: 20 }, shooting: { value: 20 }, heading: { value: 20 }, longPassing: { value: 20 }, shortPassing: { value: 20 },
      handling: { value: 10 }, reflexes: { value: 10 }, commandOfArea: { value: 10 }
    };

    it('calculates overall correctly for an outfield player using raw numbers', () => {
      // Sum is 10 * 10 = 100. Overall is Math.floor(100 / 10) = 10.
      expect(calculateOverall(rawOutfieldAttrs, Position.MIDFIELDER)).toBe(10);
    });

    it('calculates overall correctly for an outfield player using Stat objects', () => {
      // Sum is 10 * 20 = 200. Overall is Math.floor(200 / 10) = 20.
      expect(calculateOverall(statObjectAttrs, Position.FORWARD)).toBe(20);
    });

    it('calculates overall correctly for a goalkeeper using raw numbers', () => {
      // Outfield sum: 10 * 10 = 100. Goalkeeper sum: 5*2 + 5*2 + 5 = 25.
      // Total sum: 125. Overall: Math.floor(125 / 15) = 8.
      expect(calculateOverall(rawOutfieldAttrs, Position.GOALKEEPER)).toBe(8);
    });

    it('calculates overall correctly for a goalkeeper using Stat objects', () => {
      // Outfield sum: 10 * 20 = 200. Goalkeeper sum: 10*2 + 10*2 + 10 = 50.
      // Total sum: 250. Overall: Math.floor(250 / 15) = 16.
      expect(calculateOverall(statObjectAttrs, Position.GOALKEEPER)).toBe(16);
    });

    it('treats missing attributes as 0', () => {
      expect(calculateOverall({}, Position.DEFENDER)).toBe(0);
      expect(calculateOverall({}, Position.GOALKEEPER)).toBe(0);
    });
  });

  describe('getStatKeysForCategory', () => {
    it('returns expected keys for physical category', () => {
      expect(getStatKeysForCategory('physical')).toEqual(['speed', 'strength', 'endurance', 'fitness']);
    });

    it('returns expected keys for skill category', () => {
      expect(getStatKeysForCategory('skill')).toEqual(['tackling', 'shooting', 'heading', 'longPassing', 'shortPassing']);
    });

    it('returns expected keys for goalkeeping category', () => {
      expect(getStatKeysForCategory('goalkeeping')).toEqual(['handling', 'reflexes', 'commandOfArea']);
    });

    it('returns expected keys for mental category', () => {
      expect(getStatKeysForCategory('mental')).toEqual(['flair', 'vision', 'determination', 'clutch', 'composure', 'morale', 'consistency', 'aggressiveness']);
    });

    it('returns empty array for unknown category', () => {
      expect(getStatKeysForCategory('unknown')).toEqual([]);
    });
  });

  describe('phaseDecayWeight', () => {
    it('returns correct decay weight for physical group', () => {
      expect(phaseDecayWeight('physical', Phase.Junior)).toBe(0.10);
      expect(phaseDecayWeight('physical', Phase.Peak)).toBe(0.15);
      expect(phaseDecayWeight('physical', Phase.Senior)).toBe(0.50);
      expect(phaseDecayWeight('physical', Phase.Decline)).toBe(0.85);
    });

    it('returns correct decay weight for skill group', () => {
      expect(phaseDecayWeight('skill', Phase.Junior)).toBe(0.10);
      expect(phaseDecayWeight('skill', Phase.Peak)).toBe(0.10);
      expect(phaseDecayWeight('skill', Phase.Senior)).toBe(0.20);
      expect(phaseDecayWeight('skill', Phase.Decline)).toBe(0.40);
    });

    it('returns correct decay weight for goalkeeping group', () => {
      expect(phaseDecayWeight('goalkeeping', Phase.Junior)).toBe(0.10);
      expect(phaseDecayWeight('goalkeeping', Phase.Peak)).toBe(0.10);
      expect(phaseDecayWeight('goalkeeping', Phase.Senior)).toBe(0.20);
      expect(phaseDecayWeight('goalkeeping', Phase.Decline)).toBe(0.40);
    });

    it('returns correct decay weight for mental group', () => {
      expect(phaseDecayWeight('mental', Phase.Junior)).toBe(0.05);
      expect(phaseDecayWeight('mental', Phase.Peak)).toBe(0.05);
      expect(phaseDecayWeight('mental', Phase.Senior)).toBe(0.10);
      expect(phaseDecayWeight('mental', Phase.Decline)).toBe(0.20);
    });

    it('returns 0 for unknown group', () => {
      expect(phaseDecayWeight('unknown', Phase.Peak)).toBe(0);
    });
  });

  describe('phaseGrowthWeight', () => {
    it('returns correct growth weight for physical group', () => {
      expect(phaseGrowthWeight('physical', Phase.Junior)).toBe(0.65);
      expect(phaseGrowthWeight('physical', Phase.Peak)).toBe(0.20);
      expect(phaseGrowthWeight('physical', Phase.Senior)).toBe(0.05);
      expect(phaseGrowthWeight('physical', Phase.Decline)).toBe(0.00);
    });

    it('returns correct growth weight for skill group', () => {
      expect(phaseGrowthWeight('skill', Phase.Junior)).toBe(0.60);
      expect(phaseGrowthWeight('skill', Phase.Peak)).toBe(0.35);
      expect(phaseGrowthWeight('skill', Phase.Senior)).toBe(0.15);
      expect(phaseGrowthWeight('skill', Phase.Decline)).toBe(0.00);
    });

    it('returns correct growth weight for goalkeeping group', () => {
      expect(phaseGrowthWeight('goalkeeping', Phase.Junior)).toBe(0.60);
      expect(phaseGrowthWeight('goalkeeping', Phase.Peak)).toBe(0.35);
      expect(phaseGrowthWeight('goalkeeping', Phase.Senior)).toBe(0.15);
      expect(phaseGrowthWeight('goalkeeping', Phase.Decline)).toBe(0.00);
    });

    it('returns correct growth weight for mental group', () => {
      expect(phaseGrowthWeight('mental', Phase.Junior)).toBe(0.25);
      expect(phaseGrowthWeight('mental', Phase.Peak)).toBe(0.55);
      expect(phaseGrowthWeight('mental', Phase.Senior)).toBe(0.45);
      expect(phaseGrowthWeight('mental', Phase.Decline)).toBe(0.10);
    });

    it('returns 0 for unknown group', () => {
      expect(phaseGrowthWeight('unknown', Phase.Peak)).toBe(0);
    });
  });

  describe('derivePhase', () => {
    it('returns Junior when age is less than or equal to juniorEndAge', () => {
      const player = { progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32 } } as Player;
      expect(derivePhase(20, player)).toBe(Phase.Junior);
      expect(derivePhase(21, player)).toBe(Phase.Junior);
    });

    it('returns Peak when age is greater than juniorEndAge and less than or equal to peakEndAge', () => {
      const player = { progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32 } } as Player;
      expect(derivePhase(22, player)).toBe(Phase.Peak);
      expect(derivePhase(28, player)).toBe(Phase.Peak);
    });

    it('returns Senior when age is greater than peakEndAge and less than or equal to seniorEndAge', () => {
      const player = { progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32 } } as Player;
      expect(derivePhase(29, player)).toBe(Phase.Senior);
      expect(derivePhase(32, player)).toBe(Phase.Senior);
    });

    it('returns Decline when age is greater than seniorEndAge', () => {
      const player = { progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32 } } as Player;
      expect(derivePhase(33, player)).toBe(Phase.Decline);
      expect(derivePhase(40, player)).toBe(Phase.Decline);
    });
  });

});
