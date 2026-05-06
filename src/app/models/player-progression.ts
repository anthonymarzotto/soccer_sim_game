import { Player, Position, StatKey } from './types';
import { Phase } from './enums';

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

  const outfieldSum = val('speed') + val('strength') + val('flair') + val('vision') + val('determination') +
    val('tackling') + val('shooting') + val('heading') + val('longPassing') + val('shortPassing');

  if (position === Position.GOALKEEPER) {
    const gkSum = val('handling') * 2 + val('reflexes') * 2 + val('commandOfArea');
    return Math.floor((outfieldSum + gkSum) / 15);
  }

  return Math.floor(outfieldSum / 10);
}
