# Player Attributes Consolidation Plan

Status: Draft v4 — all decisions confirmed. Ready for review and
implementation.

## Goal

Consolidate all player attribute groupings (`PlayerPhysical`, `PlayerMental`,
`PlayerSkills`, `PlayerHidden`) into `PlayerSeasonAttributes`, which becomes
the sole source of truth for player attributes (no fallback fields on
`Player`). At runtime, every stat is exposed as a `Stat` object: `value` is
per-player/per-season and persisted; `type`, `description`, `hidden` are
metadata sourced from a single registry and rehydrated on load. Replace
`Player.personal.age` with `Player.personal.birthday: Date`; age is computed.
Surface `Stat` metadata in the UI: group by `type`, show `description`
tooltips, and treat `hidden: true` as an enforced render gate.

This is a breaking schema change; no migration. `dataSchemaVersion` is bumped
so existing leagues are invalidated and regenerated.

## Decisions (confirmed)

- `Stat.type` uses original categories: `'physical' | 'mental' | 'skill' | 'goalkeeping' | 'misc'`.
  - `'hidden'` is **not** a category. Hidden-ness is conveyed by `Stat.hidden`.
  - `luck`, `injuryRate` → `type: 'misc'`, `hidden: true`.
  - `overall` → `type: 'misc'`, `hidden: false`.
- `overall` is also a `Stat`, and is **persisted** (not recomputed on load).
- `PlayerSeasonAttributes` uses named fields per stat (type-safe), not a map.
- Persistence stores only `value` per stat; metadata rehydrated from registry.
- No temporary shim on `Player`; every callsite is updated to use the
  season-aware selector in this same change.
- `Player.personal.age` is replaced by `Player.personal.birthday: Date`. Age
  is computed via a helper from `birthday` and the current date.
- UI surfacing of `type`, `description`, `hidden` is in scope for this PR.
- `Stat.hidden` is an **enforced render gate** in production: hidden stats are
  excluded from normal UI. In dev mode (`isDevMode()`), hidden stats are
  rendered (visually marked, e.g. a "hidden" badge or muted styling).

## Scope of breakage

- Removed: `Player.physical | mental | skills | hidden | overall`.
- Removed: `PlayerPhysical | PlayerMental | PlayerSkills | PlayerHidden`.
- Restructured: `PlayerSeasonAttributes` (see below); now required and non-empty.
- Replaced: `PlayerPersonal.age: number` → `PlayerPersonal.birthday: Date`.
- Persistence payload contract changes; existing IndexedDB stores rejected on
  schema mismatch.

## Target type shape

### `Stat`

```ts
export type StatCategory = 'physical' | 'mental' | 'skill' | 'goalkeeping' | 'misc';

export interface Stat {
  value: number;
  type: StatCategory;     // category for UI grouping
  description?: string;   // sourced from STAT_DEFINITIONS
  hidden: boolean;        // sourced from STAT_DEFINITIONS; default false
}
```

### `StatKey`

```ts
export type StatKey =
  | 'speed' | 'strength' | 'endurance'
  | 'flair' | 'vision' | 'determination'
  | 'tackling' | 'shooting' | 'heading'
  | 'longPassing' | 'shortPassing' | 'goalkeeping'
  | 'luck' | 'injuryRate'
  | 'overall';
```

### `PlayerSeasonAttributes`

```ts
export interface PlayerSeasonAttributes {
  seasonYear: number;
  // physical
  speed: Stat;
  strength: Stat;
  endurance: Stat;
  // mental
  flair: Stat;
  vision: Stat;
  determination: Stat;
  // skill
  tackling: Stat;
  shooting: Stat;
  heading: Stat;
  longPassing: Stat;
  shortPassing: Stat;
  // goalkeeping
  goalkeeping: Stat;
  // misc (incl. previously "hidden")
  luck: Stat;
  injuryRate: Stat;
  overall: Stat;
}
```

### `PlayerPersonal` (updated)

```ts
export interface PlayerPersonal {
  height: number;       // cm
  weight: number;       // kg
  birthday: Date;       // replaces `age: number`
  nationality: string;
}
```

### `Player` (slimmed)

```ts
export interface Player {
  id: string;
  name: string;
  teamId: string;
  position: Position;
  role: Role;
  personal: PlayerPersonal;
  seasonAttributes: PlayerSeasonAttributes[];   // required, non-empty, ascending by seasonYear
  careerStats: PlayerCareerStats[];
}
```

### Stat metadata registry (new)

- New file: `src/app/models/stat-definitions.ts` (lives in `models/` per
  decision; future folder reorg is out of scope for this PR).
- Exports:
  - `STAT_DEFINITIONS: Record<StatKey, { type: StatCategory; description: string; hidden: boolean }>`
  - `STAT_KEYS: readonly StatKey[]` (canonical iteration order)
  - `buildStat(key: StatKey, value: number): Stat`
- Single source of truth for category, description, and hidden flag.
- Adding a stat = registry entry + `StatKey` union + new field on
  `PlayerSeasonAttributes`.

#### Proposed `description` copy (review)

| key            | type      | hidden | description                                                              |
|----------------|-----------|--------|--------------------------------------------------------------------------|
| `speed`        | physical  | false  | Top sprint speed and acceleration on and off the ball.                   |
| `strength`     | physical  | false  | Physical power in duels, shielding, and aerial challenges.               |
| `endurance`    | physical  | false  | Stamina across the full match; resistance to fatigue.                    |
| `flair`        | mental    | false  | Creativity and willingness to attempt unconventional play.               |
| `vision`       | mental    | false  | Awareness of teammates, runs, and passing lanes.                         |
| `determination`| mental    | false  | Drive to keep working; resilience after setbacks.                        |
| `tackling`     | skill     | false  | Quality and timing of tackles and dispossessions.                        |
| `shooting`     | skill     | false  | Striking technique, placement, and finishing.                            |
| `heading`      | skill     | false  | Aerial technique for both attacking and defensive headers.               |
| `longPassing`  | skill     | false  | Accuracy and weight of longer-range passes and switches.                 |
| `shortPassing` | skill     | false  | Accuracy and tempo of short, possession-oriented passes.                 |
| `goalkeeping`  | goalkeeping | false  | Shot-stopping, positioning, and handling. Primarily relevant for keepers.|
| `luck`         | misc      | true   | Modifier on uncertain outcomes; nudges 50/50 events.              |
| `injuryRate`   | misc      | true   | Susceptibility to injury during matches and training.             |
| `overall`      | misc      | false  | Composite rating summarizing the player's all-around quality.            |


### Age helper (new)

- New file: `src/app/models/player-age.ts`.
  - `computeAge(birthday: Date, asOf: Date): number`
  - `seasonAnchorDate(seasonYear: number): Date` — returns January 1 of
    `seasonYear` (placeholder until the schedule-as-calendar roadmap lands).
- Player profile and team details switch from `personal.age` to
  `computeAge(personal.birthday, seasonAnchorDate(currentSeasonYear))`.
- Birthday generation (in player generation): given a target age `A` and the
  season anchor date `S = seasonAnchorDate(currentSeasonYear)`, set
  `birthday = S - A years - random days in [0, 365)` (deterministic via the
  existing seeded RNG). Round-trip: `computeAge(birthday, S) === A`.

## Persistence (value-only, rehydrate on load)

Persisted shape per season per player:

```jsonc
{
  "seasonYear": 2026,
  "values": {
    "speed": 78, "strength": 70, "endurance": 74,
    "flair": 65, "vision": 72, "determination": 80,
    "tackling": 60, "shooting": 82, "heading": 68,
    "longPassing": 71, "shortPassing": 76, "goalkeeping": 20,
    "luck": 55, "injuryRate": 8,
    "overall": 74
  }
}
```

- Hydration maps each entry through `buildStat(key, value)` → runtime
  `PlayerSeasonAttributes`.
- Persistence omits `type`/`description`/`hidden` entirely (registry is the
  single source of truth).
- `Player` payload no longer contains `physical/mental/skills/hidden/overall`
  and stores `personal.birthday` as ISO string (rehydrated to `Date`).
- Bump `dataSchemaVersion` (per `data-layer-version-bump-policy`):
  - `package.json` → `dataSchemaVersion`
  - Regenerate `src/app/generated/data-schema-version.ts` via
    `scripts/sync-data-schema-version.mjs`.
- No migration code. Old payloads fail integrity check → reset path.

### Validation at load

- Loaded season-attributes record must contain every `StatKey` in `values`.
  Missing keys = incompatible payload → schema-mismatch reset.
- Unknown keys in `values` are dropped with a dev-loud warning.
- `personal.birthday` must parse to a valid `Date`; otherwise integrity fail.
- `values` must be between 0..100.

## Read paths

- Single read entry point: `getCurrentPlayerSeasonAttributes(player, currentSeasonYear)`.
- New helpers in `season-history.ts`:
  - `getStat(player, currentSeasonYear, key: StatKey): Stat`
  - `getStatValue(player, currentSeasonYear, key: StatKey): number`
- Replace every `player.<group>.<key>` with `getStatValue(player, year, '<key>')`.

## UI changes (in scope)

`src/app/pages/player-profile/player-profile.ts` and `.html`:

- Remove direct reads of `player.physical/mental/skills/hidden/overall`.
- Drive attribute lists from `STAT_KEYS` filtered by category from the
  current `PlayerSeasonAttributes`:
  - Group sections by `Stat.type` (`physical`, `mental`, `skill`, `misc`).
  - Skip any stat where `Stat.hidden === true` (enforced render gate).
  - Show `Stat.description` as tooltip (`title` attr or existing tooltip
    component) on each row/label.
- Replace `personal.age` with `computeAge(personal.birthday)`.

`src/app/pages/team-details/team-details.html`:

- Replace `personal.age` with computed age (via component-level helper or
  pipe).
- If team-details displays any attribute groupings, switch to season-aware
  selector.

Other UI surfaces (sweep target):

- Any component referencing `player.overall` / `player.physical` etc. is
  updated to use `getStat`/`getStatValue` and to honor `hidden`.

## Affected files (initial inventory)

Source-of-truth and helpers:
- `src/app/models/types.ts`
- `src/app/models/season-history.ts`
- `src/app/models/stat-definitions.ts` (new)
- `src/app/models/player-age.ts` (new) — or co-located helper

Persistence:
- `src/app/services/app-db.service.ts`
- `src/app/services/normalized-db.service.ts`
- `src/app/services/persistence.service.ts`
- `src/app/services/data-schema-version.service.ts`
- `src/app/generated/data-schema-version.ts` (regenerated)
- `package.json` (`dataSchemaVersion` bump)

Generation / assembly:
- `src/app/services/league-assembly.service.ts`
- Any player-generation utility (located via sweep).

UI:
- `src/app/pages/player-profile/player-profile.ts`
- `src/app/pages/player-profile/player-profile.html`
- `src/app/pages/team-details/team-details.html` (and `.ts` if needed)

Known direct flat-attribute readers (sweep will enumerate all):
- `src/app/services/field.service.ts`
- `src/app/services/match.simulation.variant-b.service.ts`
- `src/app/services/commentary.service.spec.ts`
- `src/app/models/team-players.spec.ts`

## Implementation steps

1. Add `Stat`, `StatCategory`, `StatKey`, restructured `PlayerSeasonAttributes`,
   slimmed `Player`, and updated `PlayerPersonal` (with `birthday`) in `types.ts`.
   Remove `PlayerPhysical/Mental/Skills/Hidden`.
2. Add `models/stat-definitions.ts` with `STAT_DEFINITIONS`, `STAT_KEYS`,
   `buildStat`.
3. Add age helper (`computeAge(birthday, asOf?)`).
4. Add `getStat` / `getStatValue` helpers in `season-history.ts`.
5. Update player generation (league assembly + helpers) to:
   - emit `PlayerSeasonAttributes` only (full `Stat` objects via `buildStat`),
   - emit `personal.birthday` (derive from previous age generation logic via
     `now - age years` randomized within the year).
6. Update persistence write path:
   - serialize value-only `{ seasonYear, values }` for season attributes,
   - serialize `personal.birthday` as ISO string.
7. Update persistence read path:
   - rehydrate `Stat`s via `buildStat`,
   - parse `birthday` back to `Date`,
   - reject payloads missing required `StatKey`s or with invalid `birthday`.
8. Bump `dataSchemaVersion`; regenerate generated file; verify schema-mismatch
   path triggers reset for old payloads.
9. Sweep all consumers; replace `player.<group>.<key>` with
   `getStatValue(player, currentSeasonYear, '<key>')`; thread
   `currentSeasonYear` where needed.
10. UI pass:
    - Player profile: drive sections from `STAT_KEYS` grouped by `Stat.type`,
      filter out `Stat.hidden === true`, render `description` as tooltip,
      replace `personal.age` with `computeAge`.
    - Team details: replace `personal.age` with `computeAge`; update any
      attribute reads.
11. Update specs and fixtures (`commentary.service.spec.ts`,
    `team-players.spec.ts`, etc.) to new shape (and `birthday`).
12. Update `.github/copilot-instructions.md` and the multi-year persistence
    instructions to remove references to legacy flat fields and to document
    value-only persistence + rehydration contract.
13. Run lint + full test suite; fix fallout.
14. Manual smoke: regenerate league, simulate a season, verify player profile
    renders by-category sections, hidden stats are absent, descriptions show
    on hover, age renders correctly via birthday.

## Verification

- `npm run test` green.
- Loading a pre-bump league triggers schema-mismatch reset (covered by a unit
  test for `data-schema-version.service`).
- New unit tests:
  - `buildStat(key, value)` populates `Stat` correctly per registry.
  - Persistence round-trip: serialize → deserialize yields identical
    `PlayerSeasonAttributes` (with rehydrated metadata).
  - Loader rejects payload missing a `StatKey`.
  - `computeAge(birthday, asOf)` returns expected value across leap-year and
    pre/post-birthday boundaries.
- Variant B simulation produces results comparable to baseline (no behavior
  regression from the read-path refactor).
- Player profile UI test: hidden stats not rendered in production mode;
  rendered (with marker) in dev mode; categories grouped; tooltip text from
  `STAT_DEFINITIONS` is present on `title` attribute.

## Open questions

None — all decisions resolved. Ready for implementation pending plan review.
