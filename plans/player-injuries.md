# Plan: Player Injury System

**Status:** Draft v3 (architecture-reviewed)

---

## Context

`injuryRate` already exists on `PlayerSeasonAttributes` as a `Stat` (0–100). It is currently unused. `50` = baseline susceptibility. This plan wires it up end-to-end.

The reviewed design direction is:

- Persisted injury state lives in `player.injuries`.
- `Player.role` remains a lineup / in-match participation field. It is **not** the authoritative persisted availability flag.
- We can reuse dismissal-style shape removal and rebalance, but we **cannot** reuse the red-card tactical substitution path unchanged. Injuries need a vacancy-fill replacement flow, not a second player sacrificed to keep a reduced shape.
- Match consumers should read injury outcomes from emitted `INJURY` events, not from a private simulation side channel.

---

## Step 1 — Injury Data Types and Shared Selectors

**New file:** `src/app/data/injuries.ts`

### 1a. `InjuryDefinition` (static table entry)

`weight` drives weighted random selection. A `severity` category groups injuries for display and future tuning.

```ts
export type InjurySeverity = 'Knock' | 'Minor' | 'Moderate' | 'Serious' | 'Severe';

export interface InjuryDefinition {
  id: string;
  name: string;
  severity: InjurySeverity;
  minWeeks: number;   // 0 = game-only
  maxWeeks: number;
  weight: number;     // relative weight for weighted random selection
}
```

### 1b. Proposed injury table (25 injuries)

Weights are **relative**. They do not need to sum to a fixed number for weighted selection to work. This draft intentionally shifts weight out of pure game-only outcomes and into the 1-5 week band so the first-pass plan targets about `2.74` games missed per injury, or about `52` games missed at `19` injuries per team per 30-match season.

| id | name | severity | minWeeks | maxWeeks | weight |
|----|------|----------|----------|----------|--------|
| `knock` | Knock | Knock | 0 | 0 | 65 |
| `cramp` | Cramp | Knock | 0 | 0 | 30 |
| `minor_cut` | Minor Cut | Knock | 0 | 0 | 15 |
| `dead_leg` | Dead Leg | Knock | 0 | 1 | 35 |
| `winded` | Winded | Knock | 0 | 0 | 20 |
| `bruising` | Bruising | Minor | 1 | 1 | 95 |
| `shin_contusion` | Shin Contusion | Minor | 1 | 2 | 75 |
| `groin_strain` | Groin Strain | Minor | 1 | 2 | 70 |
| `wrist_sprain` | Wrist Sprain | Minor | 1 | 2 | 40 |
| `minor_ankle_twist` | Minor Ankle Twist | Minor | 1 | 3 | 72 |
| `calf_strain` | Calf Strain | Moderate | 2 | 4 | 75 |
| `thigh_strain` | Thigh Strain | Moderate | 2 | 4 | 75 |
| `hamstring_pull` | Hamstring Pull | Moderate | 3 | 5 | 90 |
| `ankle_sprain` | Ankle Sprain | Moderate | 2 | 5 | 95 |
| `shoulder_sprain` | Shoulder Sprain | Moderate | 2 | 4 | 45 |
| `rib_contusion` | Rib Contusion | Moderate | 2 | 3 | 60 |
| `knee_sprain` | Knee Sprain | Serious | 4 | 6 | 30 |
| `hamstring_tear` | Hamstring Tear | Serious | 5 | 7 | 30 |
| `ankle_ligament_tear` | Ankle Ligament Tear | Serious | 5 | 8 | 20 |
| `fractured_rib` | Fractured Rib | Serious | 4 | 6 | 15 |
| `broken_metatarsal` | Broken Metatarsal | Serious | 6 | 9 | 14 |
| `knee_ligament_sprain` | Knee Ligament Sprain | Serious | 6 | 9 | 12 |
| `broken_leg` | Broken Leg | Severe | 10 | 16 | 8 |
| `acl_partial_tear` | ACL Partial Tear | Severe | 10 | 14 | 8 |
| `acl_rupture` | ACL Rupture | Severe | 18 | 24 | 6 |

> **Current total weight: 1100.** Approx severity mix: Knock 15.0%, Minor 32.0%, Moderate 40.0%, Serious 11.0%, Severe 2.0%. Expected burden: about `2.74` games missed per injury.

### 1c. `InjuryRecord` (per injury occurrence on a player)

```ts
export interface InjuryRecord {
  definitionId: string;   // references InjuryDefinition.id
  totalWeeks: number;     // original rolled duration (immutable after creation)
  weeksRemaining: number; // 0 = already healed / game-only, >=1 = active multi-week injury
  sustainedInSeason: number;
  sustainedInWeek: number;
}
```

`name` and `severity` are intentionally omitted. They are always derivable from the static `INJURY_DEFINITIONS` table via `definitionId`.

### 1d. Shared injury selectors/helpers

**File:** `src/app/models/season-history.ts`

All call sites should use shared selectors rather than inlining array scans.

```ts
export function getActiveInjury(player: Player): InjuryRecord | null {
  return player.injuries.findLast(record => record.weeksRemaining > 0) ?? null;
}

export function isPlayerInjured(player: Player): boolean {
  return getActiveInjury(player) !== null;
}

export function isPlayerEligible(player: Player): boolean {
  return !isPlayerInjured(player);
}

export function getInjuredPlayers(players: Player[]): Player[] {
  return players.filter(isPlayerInjured);
}
```

`isPlayerEligible()` is the authoritative gate for lineup selection and match-readiness checks.

### 1e. Event metadata types

**File:** `src/app/models/simulation.types.ts`

Extend the play-by-play event contract instead of inventing a one-off `extra` field or a simulator-private injury map.

```ts
export interface InjuryEventMetadata {
  definitionId: string;
  totalWeeks: number;
  weeksRemaining: number;
}

export interface PlayByPlayEventAdditionalData {
  // ...existing fields...
  injury?: InjuryEventMetadata;
}
```

If we later need to distinguish tactical subs from injury replacements in analytics or UI, add an explicit substitution-reason metadata field there as well.

---

## Step 2 — Extend the Persisted Player Model

**File:** `src/app/models/types.ts`

Add a required `injuries` array to `Player`.

```ts
export interface Player {
  // ... existing fields ...
  injuries: InjuryRecord[];
}
```

Design rules:

- All injuries, past and present, live in `player.injuries`.
- There is **no** `currentInjury` field.
- There is **no** persisted `Role.INJURED` flag.
- Current availability is derived from `getActiveInjury()` / `isPlayerEligible()`.

`EventType.INJURY` already exists in the enum set, so no new event enum value is needed. This step changes the persisted player contract, not the role model.

---

## Step 3 — Schema Version Bump

**Files:** `package.json`, `src/app/generated/data-schema-version.ts`, `src/app/services/data-schema-version.service.ts`

`Player` gains a new required persisted array field, so the data schema version must advance.

No migration is required. Existing persisted data can continue to be treated as outdated on schema mismatch, with reset/regeneration as the explicit recovery path.

---

## Step 4 — Simulation: Injury Chance Check

**File:** `src/app/services/match.simulation.variant-b.service.ts`

### 4a. Which events can trigger injury?

Two tiers of injury roll, differing only in base chance:

**Contact rolls (higher base chance):**

| Event | Players rolled | Asymmetry |
|-------|---------------|-----------|
| `FOUL` | offender + victim | victim uses `1.5x` modifier |
| `TACKLE` | winner + loser | loser uses `1.25x` modifier |
| `SAVE` | goalkeeper only | none |

**Non-contact rolls (lower base chance):**

| Event | Players rolled | Notes |
|-------|---------------|-------|
| `PASS` | passer only | recipient not rolled |
| `GOAL` | scorer only | celebration / landing |
| `MISS` | shooter only | overstretch / miscued shot |
| `INTERCEPTION` | winner only | lunging stretch |
| `CARRY` | carrier only | roll occurs during carry processing |

`SHOT` remains a transient action token that resolves into `GOAL`, `SAVE`, or `MISS` before event creation. `YELLOW_CARD`, `RED_CARD`, and `SUBSTITUTION` are not separate injury roll sites.

### 4b. Probability formula

```ts
contactBaseChance    = c
nonContactBaseChance = n

injuryRateStat = getCurrentPlayerSeasonAttributes(player, currentSeason).injuryRate.value
multiplier     = Math.max(injuryRateStat, 1) / 50

finalChance = baseChance * multiplier * asymmetryModifier
```

At `injuryRate = 50`, `multiplier = 1`.

### 4c. Expected frequency calculation

Use the actual event math, including the asymmetry modifiers, when setting target rates.

At baseline `injuryRate = 50`:

- FOUL rolls: `14 * (1.0 + 1.5) * c = 35c`
- TACKLE rolls: `20 * (1.0 + 1.25) * c = 45c`
- SAVE rolls: `6 * c = 6c`
- Non-contact rolls: `(160 + 2.5 + 8 + 12 + 30) * n = 212.5n`

So the expected **combined injuries per match** is:

```ts
E_match = 86c + 212.5n
```

And the expected **injuries per team per season** is:

```ts
E_teamSeason = E_match * matchesPerTeam / 2
```

For a 30-match season and a first-pass target of **19 injuries per team per season**:

```ts
target E_match = 19 * 2 / 30 = 1.2667
```

So the baseline constants must satisfy:

```ts
86c + 212.5n ~= 1.2667
```

If we keep the agreed `6:1` ratio between contact and non-contact base chances (`c = 6n`), a recommended first-pass starting point is:

```ts
contactBaseChance    ~= 0.01043  // 1.043%
nonContactBaseChance ~= 0.00174  // 0.174%
```

The old `0.004 / 0.0005` pair only yields about `0.45` injuries per match combined, or about `6.8` injuries per team over 30 matches, which is well below the first-pass target.

For injury burden, the first-pass calibration target should also aim for about **52 games missed per team over a 30-match season**. The revised table above is weighted to land at about `52 / 19 ~= 2.74` games missed per injury analytically, but simulation sweeps still need to confirm that the actual event mix stays near that target.

### 4d. Guard: already injured players

A player with an active injury (`weeksRemaining > 0`) must not be selected into a new match, and once injured during a match they must not be injured a second time in the same simulation.

Enforcement points:

1. **Pre-match selection / readiness:** `isPlayerEligible(player)` gates lineup eligibility.
2. **In-simulation roll:** `tryRollInjury()` returns early if the player has already been marked injured for the current match.

### 4e. Roll sites

- **Contact events** (`FOUL`, `TACKLE`, `SAVE`): roll inside the event-producing handler immediately after event creation.
- **Non-contact events** (`PASS`, `GOAL`, `MISS`, `INTERCEPTION`): roll at the same event-creation callsite.
- **`CARRY`**: roll during carry processing, since no event is emitted for the carry action itself.

---

## Step 5 — Simulation: Injury Event, Withdrawal, and Replacement

**File:** `src/app/services/match.simulation.variant-b.service.ts`

### 5a. Event contract

`EventType.INJURY` is already defined. Implement it as a **key event** carrying injury metadata in `additionalData.injury`.

```ts
additionalData: {
  injury: {
    definitionId: string,
    totalWeeks: number,
    weeksRemaining: number,
  }
}
```

This gives post-match consumers everything they need without consulting mutable simulation state.

### 5b. `tryRollInjury()` helper

On success:

1. Pick an `InjuryDefinition` using weighted random selection.
2. Roll a random integer duration in `[minWeeks, maxWeeks]`.
3. Emit an `INJURY` event with `additionalData.injury`.
4. Mark the player as injured for the rest of the match.
5. Call the injury withdrawal path.

There is **no** temporary simulation-scoped injury map. The emitted event is the contract.

### 5c. `handleInjuryWithdrawal()`

This reuses only the parts of dismissal behavior that actually match injuries:

- remove the injured player from the active shape / on-field pool
- rebalance the shape after the player leaves
- prevent the injured player from re-entering the match

What it does **not** reuse unchanged is the red-card tactical substitution logic.

### 5d. Dedicated injury replacement helper

Create a dedicated helper such as `tryInjuryReplacement(...)`.

Behavior:

- If a legal substitution is available and a bench player exists, fill the newly vacant spot with **one** bench player.
- Increment the standard substitution count.
- Emit a normal `SUBSTITUTION` event `[injuredPlayerId, incomingPlayerId]`.
- If no bench player exists or the cap is exhausted, do nothing further and the team stays short-handed.

This helper must **not** remove an additional healthy starter. That is the core difference from the current reduced-shape tactical substitution path used after a red card.

### 5e. Generic player-exit semantics

From a match-engine standpoint there are three player-exit reasons:

- substitution
- dismissal
- injury

All three remove a player from the pitch. Replay, minutes-played, and post-match stats should share that same concept instead of hard-coding only substitutions and red cards.

---

## Step 6 — Post-Match Persistence

**File:** `src/app/services/game.service.ts`

After simulation completes, scan `matchState.events` for `EventType.INJURY` and read `additionalData.injury`.

For each injury event:

1. Locate the player in the persisted roster.
2. Append a new `InjuryRecord` to `player.injuries`.
3. Do **not** persist a role change.

Implications:

- Game-only injuries (`weeksRemaining === 0`) still become part of career history.
- Multi-week injuries persist only in `player.injuries`, not in `player.role`.
- CPU teams will auto-drop injured players on the next lineup refresh because the optimizer filters `isPlayerEligible()`.
- User teams may still have stale lineup assignments containing newly injured starters; that is handled by centralized match-readiness validation and Quick Fix rather than by mutating `role`.

---

## Step 7 — Centralized Match-Readiness Validation and Shared Lineup Optimization

### 7a. Shared validator in `GameService`

Add a single readiness helper such as `getMatchReadinessIssues(...)` or `validateTeamForMatch(...)`.

It should be the authoritative owner of:

- formation validation errors
- injured / ineligible assigned starters
- any other future selection blockers

Consumers:

- `Watch Game` must call it before starting a match.
- `Schedule` single-match simulation must call it before simulating.
- `Team Details` reads the same data to show inline warnings.

This removes the current split where readiness checks are partly UI-local and partly absent.

### 7b. Shared lineup optimizer

Extract a team optimizer that can run on **any** team, not only CPU teams.

`dressBestPlayers()` becomes a thin CPU-only wrapper over that shared optimizer.

The optimizer must filter on eligibility first:

```ts
const eligiblePlayers = players.filter(isPlayerEligible);
```

### 7c. Quick Fix for the user team

The Quick Fix button uses the shared optimizer on the user team and rewrites the lineup / bench using only eligible players.

Do **not** call the current `dressBestPlayers()` directly for this, because it intentionally skips the user team.

---

## Step 8 — Injury Recovery and Season Transition

**File:** `src/app/services/game.service.ts`

### 8a. Weekly recovery

At each week advance, iterate players and decrement only active injuries.

```ts
for (const player of allPlayers) {
  const active = getActiveInjury(player);
  if (!active) continue;

  active.weeksRemaining -= 1;
}
```

When `weeksRemaining` reaches `0`, no extra role-reset step is required. The player simply becomes eligible again because `isPlayerEligible(player)` starts returning `true`.

This is intentionally O(players), not O(injured). The player counts in this game are small enough that the simpler model is preferable to maintaining another availability flag.

### 8b. Season rollover

`startNewSeason()` carries active injuries forward unchanged.

Rules:

- Do **not** clear injuries on season rollover.
- Do **not** auto-heal injuries during rollover.
- Do **not** derive availability from season boundaries.

Long injuries can therefore spill into the next season, and lineup refresh at season start still filters through `isPlayerEligible()`.

---

## Step 9 — UI, Reporting, and Stats Consumers

### 9a. Player Profile page (`player-profile.html`)

- Show a “Currently Injured” banner when `isPlayerInjured(player)`.
- Resolve name / severity from `definitionId`.
- Show career injury history from `player.injuries`.

### 9b. Team Details page (`team-details.html` / `team-details.ts`)

Add a derived `injured()` computed based on `isPlayerInjured(player)`, not on role.

Display rules:

- `Starters` remain assignment-driven. If the user has an injured starter still assigned, show that row with an injury badge / warning rather than silently hiding it.
- `Bench` and `Reserves` should exclude injured players.
- Add an `Unavailable` section for all injured players.
- Unavailable rows are not draggable and do not accept drops.

This keeps the “saved lineup is invalid” state visible for the user without overloading `role`.

### 9c. Pre-match warning surfaces

Use the centralized readiness helper from Step 7 in both Team Details and Watch Game pre-match UI. The warning payload should list each injured starter with name, injury name, and weeks remaining.

### 9d. Match summary / key events

`extractKeyEvents()` in `GameService` must explicitly include `INJURY` alongside goals and red cards.

Summary display should read from `additionalData.injury`:

- player name
- injury name
- minute
- weeks out (`0` = “back next game”, `N` = “out N weeks”)

### 9e. Watch Game page (`watch-game.html` / `watch-game.ts`)

Do **not** use persisted `Player.role` to distinguish injured vs dismissed vs substituted-off display states.

Instead, introduce a match-local removed-player status, for example:

```ts
type RemovedPlayerStatus = 'substituted' | 'dismissed' | 'injured';
```

Behavior:

- `INJURY` event removes the player’s dot from the pitch immediately when they leave.
- If a replacement follows, the later `SUBSTITUTION` event adds the new player’s dot normally.
- Off-field lineup panel shows a distinct injury icon.
- `getEventIcon()` adds `EventType.INJURY => '🩹'`.

This is the right place to keep “why did this player leave?” separate from persisted roster state.

### 9f. Minutes played and post-match stats

Both `GameService` minutes aggregation and `StatisticsService.calculateMinutesPlayed()` must treat `INJURY` as a player-exit event alongside `SUBSTITUTION` and `RED_CARD`.

Cases:

- **Injury with no replacement:** injured player’s minutes stop at injury minute.
- **Injury followed by replacement:** injured player stops at injury minute; replacement starts at substitution minute.
- **Bench player never enters:** remains `0` minutes as before.

---

## Step 10 — Update Design Docs

**Files:** `public/design-docs/player-season-attributes-usage.html`, `public/design-docs/simulation-flow.html`

### 10a. `player-season-attributes-usage.html`

Update `injuryRate` to show active use:

- remove the “unused” label
- describe it as: “drives per-event injury probability in simulation; 50 = baseline, <50 reduces risk, >50 increases risk”

### 10b. `simulation-flow.html`

Reflect the corrected structural flow, not the old red-card reuse assumption.

Key changes:

1. Add `INJURY_ROLL` after relevant event branches.
2. Add `INJURY_EVENT` carrying `additionalData.injury`.
3. Add a `PLAYER_EXIT` / `REBALANCE` node shared by injury and dismissal.
4. Add a separate `INJURY_REPLACEMENT` branch that fills the vacancy with a bench player if legal.
5. Do **not** label this as the same path as the red-card tactical substitution flow.

---

## Step 11 — Calibration and Verification

Implementation should include a tuning / verification pass after the feature is wired up.

Minimum checks:

1. Simulate a large enough sample of matches / seasons to measure mean injuries per team per season.
2. Compare the observed mean against the target band.
3. Break down injuries by severity and by game-only vs multi-week.
4. Check average games missed per team so the frequency target does not accidentally create excessive roster unavailability.

For the first implementation pass, use these calibration goals:

1. **Injury count:** about **19 injuries per team over a 30-match season**.
2. **Availability burden:** about **52 games missed per team over a 30-match season**.
3. **Average burden:** about `52 / 19 ~= 2.74` games missed per injury.
4. **Base-chance ratio:** keep contact rolls at **6:1** relative to non-contact rolls.

That yields the following recommended starting pair:

```ts
contactBaseChance    = 0.01043
nonContactBaseChance = 0.00174
```

Use those as the analytic baseline from `E_match = 86c + 212.5n`, then fine-tune with simulation sweeps. Validate both frequency and games-missed output together; matching injury count alone is not sufficient.

---

## Implementation Order

| # | Step | Files Touched | Notes |
|---|------|---------------|-------|
| 1 | Injury data types + helpers | `src/app/data/injuries.ts` (new), `src/app/models/season-history.ts`, `src/app/models/simulation.types.ts` | No persistence yet |
| 2 | Extend `Player` model | `src/app/models/types.ts` | Add `injuries` only; no role change |
| 3 | Schema version bump | `package.json`, generated version file, service | Depends on 2 |
| 4 | Simulation injury rolls | `match.simulation.variant-b.service.ts` | Depends on 1 |
| 5 | Withdrawal + dedicated injury replacement | `match.simulation.variant-b.service.ts` | Depends on 4 |
| 6 | Persist injuries from emitted events | `game.service.ts` | Depends on 4–5 |
| 7 | Centralized readiness + shared optimizer | `game.service.ts`, team-details / watch-game callers | Depends on 1, 6 |
| 8 | Weekly recovery + season rollover consistency | `game.service.ts` | Depends on 1, 6 |
| 9 | UI / reporting / stats consumers | player profile, team details, watch game, match summary, stats services | Depends on 4–8 |
| 10 | Update design docs | `public/design-docs/*.html` | Depends on final flow |
| 11 | Calibration pass | tuning constants + validation tooling/tests | After implementation |

---

## Open Questions

1. **Observed burden:** After the first simulation sweep, does the actual games-missed output stay close to the table's analytic `~52` games missed per team-season, or do event distributions require another rebalance?
2. **Severity feel:** Do the revised Serious / Severe shares (`11%` / `2%`) feel right in playtesting, or should more burden move back into the Moderate band?
3. **Substitution reason metadata:** Do we want to tag injury-triggered substitutions explicitly, or is the preceding `INJURY` event sufficient for UI / analytics?
