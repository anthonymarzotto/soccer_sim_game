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
  handling: {
    type: 'goalkeeping',
    description: 'How well the goalkeeper hangs on to shots versus allowing rebounds.',
    hidden: false
  },
  reflexes: {
    type: 'goalkeeping',
    description: 'How quickly the goalkeeper reacts to shots.',
    hidden: false
  },
  commandOfArea: {
    type: 'goalkeeping',
    description: 'Organizing free-kick walls, intercepting crosses, and commanding the penalty area.',
    hidden: false
  },
  clutch: {
    type: 'mental',
    description: 'Performance quality in important games and high-pressure individual moments.',
    hidden: true
  },
  composure: {
    type: 'mental',
    description: 'Ability to stay calm and make good decisions under pressure.',
    hidden: true
  },
  morale: {
    type: 'mental',
    description: 'How affected the player is by wins and losses; influences overall and in-game mood.',
    hidden: true
  },
  consistency: {
    type: 'mental',
    description: 'Tendency to perform at the same level from match to match.',
    hidden: true
  },
  aggressiveness: {
    type: 'mental',
    description: 'How hard the player tackles and contests duels.',
    hidden: true
  },
  fitness: {
    type: 'physical',
    description: 'The rate at which the player builds up fatigue during a game.',
    hidden: true
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
