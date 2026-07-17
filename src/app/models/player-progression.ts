import { Player, Position, StatKey } from './types';
import { Phase, getPositionGroup } from './enums';
import { computeAge, seasonAnchorDate } from './player-age';
import { getCurrentPlayerSeasonAttributes } from './season-history';
import { STAT_DEFINITIONS } from './stat-definitions';

export function derivePhase(age: number, player: Player): Phase {
  const p = player.progression;
  if (age <= p.juniorEndAge) return Phase.Junior;
  if (age <= p.peakEndAge) return Phase.Peak;
  if (age <= p.seniorEndAge) return Phase.Senior;
  return Phase.Decline;
}

export function phaseGrowthWeight(group: string, phase: Phase): number {
  if (group === 'physical') {
    switch (phase) {
      case Phase.Junior: return 0.65;
      case Phase.Peak: return 0.20;
      case Phase.Senior: return 0.05;
      case Phase.Decline: return 0.00;
    }
  } else if (group === 'skill' || group === 'goalkeeping') {
    switch (phase) {
      case Phase.Junior: return 0.60;
      case Phase.Peak: return 0.35;
      case Phase.Senior: return 0.15;
      case Phase.Decline: return 0.00;
    }
  } else if (group === 'mental') {
    switch (phase) {
      case Phase.Junior: return 0.25;
      case Phase.Peak: return 0.55;
      case Phase.Senior: return 0.45;
      case Phase.Decline: return 0.10;
    }
  }
  return 0;
}

export function phaseDecayWeight(group: string, phase: Phase): number {
  if (group === 'physical') {
    switch (phase) {
      case Phase.Junior: return 0.10;
      case Phase.Peak: return 0.15;
      case Phase.Senior: return 0.50;
      case Phase.Decline: return 0.85;
    }
  } else if (group === 'skill' || group === 'goalkeeping') {
    switch (phase) {
      case Phase.Junior: return 0.10;
      case Phase.Peak: return 0.10;
      case Phase.Senior: return 0.20;
      case Phase.Decline: return 0.40;
    }
  } else if (group === 'mental') {
    switch (phase) {
      case Phase.Junior: return 0.05;
      case Phase.Peak: return 0.05;
      case Phase.Senior: return 0.10;
      case Phase.Decline: return 0.20;
    }
  }
  return 0;
}

export function getStatKeysForCategory(category: string): StatKey[] {
  switch (category) {
    case 'physical': return ['speed', 'strength', 'endurance', 'fitness'];
    case 'skill': return ['tackling', 'shooting', 'heading', 'longPassing', 'shortPassing'];
    case 'goalkeeping': return ['handling', 'reflexes', 'commandOfArea'];
    case 'mental': return ['flair', 'vision', 'determination', 'clutch', 'composure', 'morale', 'consistency', 'aggressiveness'];
    default: return [];
  }
}

export const POSITION_OVR_CONFIG: Record<Position, { core: Partial<Record<StatKey, number>> }> = {
  [Position.GK]: {
    core: {
      handling: 50,
      reflexes: 50
    }
  },
  [Position.CB]: {
    core: {
      tackling: 35,
      strength: 25,
      heading: 20,
      determination: 10,
      speed: 10
    }
  },
  [Position.FB]: {
    core: {
      speed: 30,
      tackling: 25,
      endurance: 20,
      shortPassing: 15,
      determination: 10
    }
  },
  [Position.CDM]: {
    core: {
      tackling: 30,
      vision: 20,
      shortPassing: 20,
      strength: 15,
      longPassing: 15
    }
  },
  [Position.CM]: {
    core: {
      shortPassing: 25,
      vision: 20,
      tackling: 15,
      longPassing: 15,
      endurance: 15,
      determination: 10
    }
  },
  [Position.CAM]: {
    core: {
      vision: 30,
      shortPassing: 30,
      shooting: 20,
      flair: 10,
      speed: 10
    }
  },
  [Position.WNG]: {
    core: {
      speed: 35,
      flair: 25,
      longPassing: 15,
      shortPassing: 15,
      shooting: 10
    }
  },
  [Position.ST]: {
    core: {
      shooting: 40,
      speed: 20,
      heading: 15,
      strength: 15,
      flair: 10
    }
  }
};

export const CORE_BLEND_FACTOR = 0.85;

// Accepts either a raw dictionary of values (from generator) or PlayerSeasonAttributes (from rollover)
export function calculateOverall(
  attrs: unknown,
  position: Position
): number {
  // helper to extract value whether it's a number (generator) or a Stat object (rollover)
  const val = (key: string): number => {
    const record = attrs as Record<string, unknown>;
    const v = record[key];
    if (v && typeof v === 'object' && 'value' in v) return (v as { value: number }).value;
    return typeof v === 'number' ? v : 0;
  };

  const config = POSITION_OVR_CONFIG[position];
  if (!config) return 0;

  // 1. Calculate Core Sum
  let coreSum = 0;
  const coreEntries = Object.entries(config.core) as [StatKey, number][];
  coreEntries.forEach(([key, weight]) => {
    coreSum += val(key) * (weight / 100);
  });

  // 2. Determine non-hidden stats pool for this position
  const isGk = position === Position.GK;
  const pool = (Object.keys(STAT_DEFINITIONS) as StatKey[]).filter(key => {
    const def = STAT_DEFINITIONS[key];
    return !def.hidden && def.type !== 'misc' && (isGk || def.type !== 'goalkeeping');
  });

  // Tertiary stats: any stat in the pool that is NOT in core
  const tertiaryKeys = pool.filter(key => !(key in config.core));
  
  const tertiarySum = tertiaryKeys.reduce((acc, k) => acc + val(k), 0) / (tertiaryKeys.length || 1);

  // 3. Blend Core and Tertiary
  const overall = CORE_BLEND_FACTOR * coreSum + (1.0 - CORE_BLEND_FACTOR) * tertiarySum;
  return Math.floor(overall);
}

export function getCareerArcMultiplier(player: Player, age: number): number {
  const x1 = 16;
  const y1 = 0.35;
  const x2 = player.progression.juniorEndAge;
  const y2 = 0.82;
  const x3 = player.progression.peakEndAge;
  const y3 = 1.00;
  const x4 = player.progression.seniorEndAge;
  const y4 = 0.68;
  const x5 = 42;
  const y5 = 0.20;

  if (age <= x1) return y1;
  if (age >= x5) return y5;

  let xStart: number, yStart: number, xEnd: number, yEnd: number;

  if (age <= x2) {
    xStart = x1; yStart = y1;
    xEnd = x2; yEnd = y2;
  } else if (age <= x3) {
    xStart = x2; yStart = y2;
    xEnd = x3; yEnd = y3;
  } else if (age <= x4) {
    xStart = x3; yStart = y3;
    xEnd = x4; yEnd = y4;
  } else {
    xStart = x4; yStart = y4;
    xEnd = x5; yEnd = y5;
  }

  if (xEnd === xStart) return yEnd;

  return yStart + (age - xStart) * (yEnd - yStart) / (xEnd - xStart);
}

export const POTENTIAL_GAP_REALIZATION_RATE = 0.75;

export function calculateMarketValue(player: Player, seasonYear: number): number {
  const birthday = player.personal.birthday instanceof Date ? player.personal.birthday : new Date(player.personal.birthday);
  const age = computeAge(birthday, seasonAnchorDate(seasonYear));
  const attributes = getCurrentPlayerSeasonAttributes(player, seasonYear);
  const overall = attributes.overall.value;

  // Blended Overall incorporating potential for young players
  const rawPotential = player.progression?.potential;
  const potential = typeof rawPotential === 'number' && !isNaN(rawPotential)
    ? Math.max(overall, rawPotential)
    : overall;
  const projectedOvr = overall + (potential - overall) * POTENTIAL_GAP_REALIZATION_RATE;

  let arcPosition = 1.0;
  const peakEndAge = player.progression.peakEndAge;
  if (age < peakEndAge && peakEndAge > 16) {
    arcPosition = Math.max(0.0, Math.min(1.0, (age - 16) / (peakEndAge - 16)));
  }

  const blendWeight = arcPosition;
  const effectiveOvr = (blendWeight * overall) + ((1.0 - blendWeight) * projectedOvr);

  const exponent = effectiveOvr >= 70 ? 0.2119 : 0.12;
  const baseValue = 500000 * Math.exp(exponent * (effectiveOvr - 70));
  const arcMultiplier = getCareerArcMultiplier(player, age);

  let positionMultiplier = 1.0;
  const group = getPositionGroup(player.position);
  switch (group) {
    case 'FWD':
      positionMultiplier = 1.1;
      break;
    case 'DEF':
      positionMultiplier = 0.9;
      break;
    case 'GK':
      positionMultiplier = 0.85;
      break;
    case 'MID':
    default:
      positionMultiplier = 1.0;
      break;
  }

  const finalValue = baseValue * arcMultiplier * positionMultiplier;
  return Math.round(Math.max(10000, finalValue));
}

export function calculatePlayerWageCost(player: Player, seasonYear: number): number {
  if (player.contract) {
    return player.contract.agreedWageCost;
  }
  return calculatePlayerMarketWageCost(player, seasonYear);
}

export function calculatePlayerMarketWageCost(player: Player, seasonYear: number): number {
  const birthday = player.personal.birthday instanceof Date ? player.personal.birthday : new Date(player.personal.birthday);
  const age = computeAge(birthday, seasonAnchorDate(seasonYear));
  let attributes = player.seasonAttributes?.find(a => a.seasonYear === seasonYear);
  if (!attributes && player.seasonAttributes && player.seasonAttributes.length > 0) {
    const sortedAttrs = [...player.seasonAttributes].sort((a, b) => b.seasonYear - a.seasonYear);
    attributes = sortedAttrs[0];
  }
  if (!attributes) {
    throw new Error(`calculatePlayerMarketWageCost: no season attributes found for player "${player.id}".`);
  }
  const overall = attributes.overall.value;

  const baseWage = 0.005249 * Math.exp(0.0828 * overall);
  const phase = derivePhase(age, player);

  let phaseMultiplier = 1.0;
  switch (phase) {
    case Phase.Junior:
      phaseMultiplier = 0.8;
      break;
    case Phase.Peak:
      phaseMultiplier = 1.0;
      break;
    case Phase.Senior:
      phaseMultiplier = 0.95;
      break;
    case Phase.Decline:
      phaseMultiplier = 0.75;
      break;
  }

  let positionMultiplier = 1.0;
  const group = getPositionGroup(player.position);
  switch (group) {
    case 'FWD':
      positionMultiplier = 1.1;
      break;
    case 'DEF':
      positionMultiplier = 0.9;
      break;
    case 'GK':
      positionMultiplier = 0.85;
      break;
    case 'MID':
    default:
      positionMultiplier = 1.0;
      break;
  }

  const rawWage = baseWage * phaseMultiplier * positionMultiplier;
  return Math.max(0.5, Math.round(rawWage * 2) / 2);
}

export function calculateSquadTotalWageCost(players: Player[], seasonYear: number): number {
  return players.reduce((sum, p) => sum + calculatePlayerWageCost(p, seasonYear), 0);
}

export function calculateSquadTotalMarketValue(players: Player[], seasonYear: number): number {
  return players.reduce((sum, p) => sum + calculateMarketValue(p, seasonYear), 0);
}

