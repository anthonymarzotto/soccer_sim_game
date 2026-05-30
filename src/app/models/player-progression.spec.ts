import { Player, Position } from './types';
import { Phase } from './enums';
import {
  derivePhase,
  phaseGrowthWeight,
  phaseDecayWeight,
  getStatKeysForCategory,
  calculateOverall,
  getCareerArcMultiplier,
  calculateMarketValue,
  calculatePlayerWageCost
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

  describe('getCareerArcMultiplier', () => {
    const player = {
      progression: {
        juniorEndAge: 21,
        peakEndAge: 28,
        seniorEndAge: 32
      }
    } as Player;

    it('returns exact values at anchors', () => {
      expect(getCareerArcMultiplier(player, 16)).toBeCloseTo(0.35);
      expect(getCareerArcMultiplier(player, 21)).toBeCloseTo(0.82);
      expect(getCareerArcMultiplier(player, 28)).toBeCloseTo(1.00);
      expect(getCareerArcMultiplier(player, 32)).toBeCloseTo(0.68);
      expect(getCareerArcMultiplier(player, 42)).toBeCloseTo(0.20);
    });

    it('clips values outside anchors', () => {
      expect(getCareerArcMultiplier(player, 12)).toBeCloseTo(0.35);
      expect(getCareerArcMultiplier(player, 45)).toBeCloseTo(0.20);
    });

    it('interpolates linearly in between anchors', () => {
      // midway between 16 and 21 (18.5) -> 0.585
      expect(getCareerArcMultiplier(player, 18.5)).toBeCloseTo(0.585);
      // midway between 28 and 32 (30) -> 0.84
      expect(getCareerArcMultiplier(player, 30)).toBeCloseTo(0.84);
    });
  });

  describe('calculateMarketValue', () => {
    it('calculates the target market value for a 70 OVR peak player', () => {
      const player = {
        position: Position.MIDFIELDER,
        personal: { birthday: new Date('2000-01-01') },
        seasonAttributes: [{ seasonYear: 2028, overall: { value: 70 } }],
        progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32 }
      } as unknown as Player;

      // Age: as of 2028-01-01, birthday 2000-01-01 is 28 years old (Peak, multiplier 1.0)
      // OVR: 70
      // 500000 * exp(0.2119 * 0) * 1.0 * 1.0 = 500,000
      expect(calculateMarketValue(player, 2028)).toBe(500000);
    });

    it('applies position and age progression modifiers correctly', () => {
      const player = {
        position: Position.FORWARD, // 1.1x multiplier
        personal: { birthday: new Date('2000-01-01') },
        seasonAttributes: [{ seasonYear: 2028, overall: { value: 85 } }],
        progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32 }
      } as unknown as Player;

      // Age: 28 (Peak, 1.0x multiplier)
      // Base: 500000 * exp(0.2119 * 15) = 12005355.3...
      // Value: 12005355.3... * 1.0 (arc) * 1.1 (FWD) = 13205891
      expect(calculateMarketValue(player, 2028)).toBe(13205891);
    });

    it('enforces a minimum floor of 10k', () => {
      const player = {
        position: Position.GOALKEEPER, // 0.85x
        personal: { birthday: new Date('2000-01-01') },
        seasonAttributes: [{ seasonYear: 2045, overall: { value: 45 } }],
        progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32 }
      } as unknown as Player;

      // Extremely old and low overall: should hit the floor of 10k
      expect(calculateMarketValue(player, 2045)).toBe(10000);
    });

    it('calculates distinct non-flatlined values for lower overalls', () => {
      const player = {
        position: Position.MIDFIELDER, // 1.0x
        personal: { birthday: new Date('2000-01-01') },
        seasonAttributes: [{ seasonYear: 2028, overall: { value: 50 } }],
        progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32 }
      } as unknown as Player;

      // OVR 50 Midfielder, Peak: 500000 * exp(0.12 * -20) * 1.0 * 1.0 = 45359
      expect(calculateMarketValue(player, 2028)).toBe(45359);
    });

    it('prices a young high-potential wonderkid significantly higher than their current OVR suggests', () => {
      const player = {
        position: Position.MIDFIELDER,
        personal: { birthday: new Date('2012-01-01') }, // 16 years old in 2028
        seasonAttributes: [{ seasonYear: 2028, overall: { value: 40 } }],
        progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32, potential: 99 }
      } as unknown as Player;

      // Age: 16 (0.35x career arc multiplier)
      // projectedOvr = 40 + (99 - 40) * 0.75 = 84.25
      // arcPosition = 0 (16-16)/(28-16) = 0
      // blendWeight = 0.0 -> effectiveOvr = 84.25
      // Base: 500000 * exp(0.2119 * (84.25 - 70)) = 10241291
      // Final: 10241291 * 0.35 * 1.0 = 3584452
      expect(calculateMarketValue(player, 2028)).toBe(3584452);
    });

    it('prices a young low-potential filler at the minimum floor of 10,000', () => {
      const player = {
        position: Position.MIDFIELDER,
        personal: { birthday: new Date('2012-01-01') }, // 16 years old in 2028
        seasonAttributes: [{ seasonYear: 2028, overall: { value: 40 } }],
        progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32, potential: 45 }
      } as unknown as Player;

      // Age: 16 (0.35x career arc multiplier)
      // projectedOvr = 40 + (45 - 40) * 0.85 = 44.25
      // arcPosition = 0 -> effectiveOvr = 44.25
      // Base: 500000 * exp(0.12 * (44.25 - 70)) = 22751
      // Final: 22751 * 0.35 = 7963 -> Clamps to 10000 floor
      expect(calculateMarketValue(player, 2028)).toBe(10000);
    });
  });

  describe('calculatePlayerWageCost', () => {
    it('calculates the target wage for a 70 OVR peak player', () => {
      const player = {
        position: Position.MIDFIELDER, // 1.0x
        personal: { birthday: new Date('2000-01-01') },
        seasonAttributes: [{ seasonYear: 2028, overall: { value: 70 } }],
        progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32 }
      } as unknown as Player;

      // Base: 0.005249 * exp(0.0828 * 70) = 1.727
      // Rounded to nearest 0.5: 1.5
      expect(calculatePlayerWageCost(player, 2028)).toBe(1.5);
    });

    it('calculates the target wage for an expensive 95 OVR forward peak player', () => {
      const player = {
        position: Position.FORWARD, // 1.1x
        personal: { birthday: new Date('2000-01-01') },
        seasonAttributes: [{ seasonYear: 2028, overall: { value: 95 } }],
        progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32 }
      } as unknown as Player;

      // Base: 0.005249 * exp(0.0828 * 95) = 13.68
      // Forward multiplier: 1.1x -> 15.05
      // Rounded to nearest 0.5: 15.0
      expect(calculatePlayerWageCost(player, 2028)).toBe(15.0);
    });

    it('applies phase discounts and enforces minimum floor of 0.5', () => {
      const player = {
        position: Position.GOALKEEPER, // 0.85x
        personal: { birthday: new Date('2000-01-01') },
        seasonAttributes: [{ seasonYear: 2045, overall: { value: 45 } }],
        progression: { juniorEndAge: 21, peakEndAge: 28, seniorEndAge: 32 }
      } as unknown as Player;

      // Very old/decline player: raw is very tiny, but should be clamped to 0.5 floor
      expect(calculatePlayerWageCost(player, 2045)).toBe(0.5);
    });
  });

});
