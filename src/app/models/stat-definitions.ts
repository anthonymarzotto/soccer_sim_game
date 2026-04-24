import { Stat, StatCategory, StatKey } from './types';

interface StatDefinition {
  type: StatCategory;
  description: string;
  hidden: boolean;
}

export const STAT_DEFINITIONS: Record<StatKey, StatDefinition> = {
  speed: {
    type: 'physical',
    description: 'Top sprint speed and acceleration on and off the ball.',
    hidden: false
  },
  strength: {
    type: 'physical',
    description: 'Physical power in duels, shielding, and aerial challenges.',
    hidden: false
  },
  endurance: {
    type: 'physical',
    description: 'Stamina across the full match; resistance to fatigue.',
    hidden: false
  },
  flair: {
    type: 'mental',
    description: 'Creativity and willingness to attempt unconventional play.',
    hidden: false
  },
  vision: {
    type: 'mental',
    description: 'Awareness of teammates, runs, and passing lanes.',
    hidden: false
  },
  determination: {
    type: 'mental',
    description: 'Drive to keep working; resilience after setbacks.',
    hidden: false
  },
  tackling: {
    type: 'skill',
    description: 'Quality and timing of tackles and dispossessions.',
    hidden: false
  },
  shooting: {
    type: 'skill',
    description: 'Striking technique, placement, and finishing.',
    hidden: false
  },
  heading: {
    type: 'skill',
    description: 'Aerial technique for both attacking and defensive headers.',
    hidden: false
  },
  longPassing: {
    type: 'skill',
    description: 'Accuracy and weight of longer-range passes and switches.',
    hidden: false
  },
  shortPassing: {
    type: 'skill',
    description: 'Accuracy and tempo of short, possession-oriented passes.',
    hidden: false
  },
  goalkeeping: {
    type: 'goalkeeping',
    description: 'Shot-stopping, positioning, and handling. Primarily relevant for keepers.',
    hidden: false
  },
  luck: {
    type: 'misc',
    description: 'Modifier on uncertain outcomes; nudges 50/50 events.',
    hidden: true
  },
  injuryRate: {
    type: 'misc',
    description: 'Susceptibility to injury during matches and training.',
    hidden: true
  },
  overall: {
    type: 'misc',
    description: 'Composite rating summarizing the player\'s all-around quality.',
    hidden: false
  }
};

export const STAT_KEYS: readonly StatKey[] = Object.keys(STAT_DEFINITIONS) as StatKey[];

export const STAT_VALUE_MIN = 0;
export const STAT_VALUE_MAX = 100;

export function isValidStatValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= STAT_VALUE_MIN && value <= STAT_VALUE_MAX;
}

export function buildStat(key: StatKey, value: number): Stat {
  const def = STAT_DEFINITIONS[key];
  return {
    value,
    type: def.type,
    description: def.description,
    hidden: def.hidden
  };
}

export function getStatKeysByCategory(category: StatCategory): StatKey[] {
  return STAT_KEYS.filter(key => STAT_DEFINITIONS[key].type === category);
}
