import { Player, PlayerPersonal, PlayerSeasonAttributes, Position, Role, StatKey } from '../models/types';
import { STAT_KEYS, buildStat } from '../models/stat-definitions';
import { birthdayForAge } from '../models/player-age';

export type StatOverrides = Partial<Record<StatKey, number>>;

export function createTestSeasonAttributes(
  seasonYear: number,
  overrides: StatOverrides = {},
  defaultValue = 70
): PlayerSeasonAttributes {
  const out = { seasonYear } as PlayerSeasonAttributes;
  for (const key of STAT_KEYS) {
    const value = overrides[key] ?? defaultValue;
    (out as unknown as Record<StatKey, ReturnType<typeof buildStat>>)[key] = buildStat(key, value);
  }
  return out;
}

export function createTestPersonal(opts: {
  age?: number;
  height?: number;
  weight?: number;
  nationality?: string;
  seasonYear?: number;
} = {}): PlayerPersonal {
  const age = opts.age ?? 25;
  const seasonYear = opts.seasonYear ?? new Date().getUTCFullYear();
  return {
    height: opts.height ?? 180,
    weight: opts.weight ?? 75,
    nationality: opts.nationality ?? 'ENG',
    birthday: birthdayForAge(age, seasonYear, 0)
  };
}

export function createTestPlayer(opts: {
  id: string;
  name?: string;
  teamId?: string;
  position?: Position;
  role?: Role;
  age?: number;
  height?: number;
  weight?: number;
  nationality?: string;
  seasonYear?: number;
  stats?: StatOverrides;
  defaultStat?: number;
  seasonAttributes?: PlayerSeasonAttributes[];
}): Player {
  const seasonYear = opts.seasonYear ?? new Date().getUTCFullYear();
  return {
    id: opts.id,
    name: opts.name ?? opts.id,
    teamId: opts.teamId ?? 'team-1',
    position: opts.position ?? Position.MIDFIELDER,
    role: opts.role ?? Role.STARTER,
    personal: createTestPersonal({
      age: opts.age,
      height: opts.height,
      weight: opts.weight,
      nationality: opts.nationality,
      seasonYear
    }),
    seasonAttributes: opts.seasonAttributes ?? [
      createTestSeasonAttributes(seasonYear, opts.stats ?? {}, opts.defaultStat ?? 70)
    ],
    careerStats: [],
    mood: 100,
    fatigue: 100
  };
}

/**
 * Returns the persisted shape (for use in storedLeague hydration tests).
 * `birthday` becomes ISO string and seasonAttributes uses `{ seasonYear, values }`.
 */
export function createTestPersistedPlayer(opts: {
  id: string;
  name?: string;
  teamId?: string;
  position?: Position;
  role?: Role;
  age?: number;
  height?: number;
  weight?: number;
  nationality?: string;
  seasonYear?: number;
  stats?: StatOverrides;
  defaultStat?: number;
  careerStats?: unknown[];
  mood?: number;
  fatigue?: number;
}): Record<string, unknown> {
  const seasonYear = opts.seasonYear ?? new Date().getUTCFullYear();
  const personal = createTestPersonal({
    age: opts.age,
    height: opts.height,
    weight: opts.weight,
    nationality: opts.nationality,
    seasonYear
  });
  const values: Record<string, number> = {};
  for (const key of STAT_KEYS) {
    values[key] = opts.stats?.[key] ?? opts.defaultStat ?? 70;
  }
  return {
    id: opts.id,
    name: opts.name ?? opts.id,
    teamId: opts.teamId ?? 'team-1',
    position: opts.position ?? Position.MIDFIELDER,
    role: opts.role ?? Role.STARTER,
    personal: {
      height: personal.height,
      weight: personal.weight,
      nationality: personal.nationality,
      birthday: personal.birthday.toISOString()
    },
    seasonAttributes: [{ seasonYear, values }],
    careerStats: opts.careerStats ?? [],
    mood: opts.mood ?? 100,
    fatigue: opts.fatigue ?? 100
  };
}
