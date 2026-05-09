Here's a comprehensive handoff document.

---

# Feature Handoff: Player Retirement & Season Transition Log

## Overview

Two tightly coupled features: a retirement system that runs during season rollover, and a lightweight notification mechanism to surface retirement events to the user.

---

## Part 1: Retirement System

### Where it lives

A new private method `assessRetirements()` in `GameService`, called inside `startNewSeason()`. It should run **after** season snapshots are recorded but **before** `generateNextSeasonAttributes()` is called. It returns a structured result containing retired players, their replacements, and events for the transition log.

### Retirement algorithm

**Phase gates — check these first, no RNG roll needed:**
- Player is in `JUNIOR` or `PEAK` phase (`derivePhase()` from `player-progression.ts`): **0% chance, skip entirely**
- Player age >= 45: **retire unconditionally**

**Base rate — for players in `SENIOR` or `DECLINE` phase:**

For `SENIOR` phase:
```
baseRate = lerp(0.01, 0.06, 1 - (professionalism / 100))
```
High-professionalism senior players almost never retire early; low-professionalism ones have a small but real chance.

For `DECLINE` phase:
```
yearsIntoDecline = age - player.progression.seniorEndAge
declineWindowLength = 45 - player.progression.seniorEndAge
t = yearsIntoDecline / declineWindowLength
professionalismDampener = lerp(1.2, 0.8, professionalism / 100)
baseRate = clamp(t * 0.75 * professionalismDampener, 0, 0.75)
```

**Injury modifier** (multiplicative against baseRate):
```
recentSevereCount = count of player.injuries where:
  - severity in ['Serious', 'Severe']
  - sustainedInSeason >= currentSeasonYear - 2

injuryMultiplier = clamp(1.0 + (recentSevereCount * 0.3) + (isStillInjured ? 0.2 : 0), 1.0, 2.0)
```
`isStillInjured` is determined by `getActiveInjury(player) !== null` at rollover time.

**Overall decline bonus** (additive):
```
peakOverall = max overall value across all player.seasonAttributes
currentOverall = current season overall
declineMagnitude = peakOverall - currentOverall

bonus = 0     if declineMagnitude < 5
      = 0.05  if declineMagnitude 5–14
      = 0.12  if declineMagnitude 15–24
      = 0.20  if declineMagnitude >= 25
```

**Mood/professionalism bonus** (additive):
```
moodBonus = 0 if professionalism > 70
          = ((50 - mood) / 50) * 0.10 if professionalism <= 70 and mood < 50
          = 0 otherwise
```

**Current overall floor dampener** (applied after combining all factors):
```
if currentOverall >= 70: finalChance *= 0.5
if currentOverall >= 65 and < 70: finalChance *= 0.7
```
This protects still-useful players from being pushed out by age and decline magnitude alone.

**Career ceiling modifier** (additive, applied to decline-phase players only):
```
if peakOverall < 55: +0.15
if peakOverall 55–64: +0.08
```
This gives low-ceiling players meaningful retirement pressure at the start of their decline window, independent of how far through it they are.

**Final assembly:**
```
rawChance = (baseRate * injuryMultiplier) + overallDeclineBonus + moodBonus + careerCeilingBonus
dampened = rawChance * currentOverallDampener
finalChance = clamp(dampened, 0, 0.90)
retire = rng.random() < finalChance
```

The 0.90 ceiling ensures retirement is never certain, even for a 39-year-old in poor shape.

### Replacements

When a player retires:
- Generate a replacement via `GeneratorService.generatePlayer()` at the same position as the retiree
- Age should be 16–18, using `birthdayForAge()` from `player-age.d.ts` with a random fraction from `RngService`
- Assign the replacement `Role.RESERVE`
- For CPU teams, the existing `dressBestPlayers` / `dressTeamLineup` logic handles lineup refresh automatically
- For the user's team, leave the replacement as `RESERVE` intentionally — the user should manually slot them in

### Calibration target

Roughly 2–4 retirements per team per season across a 20-team league, skewed toward lower-overall players. The `SimulationDebugComponent` is a good place to eventually add retirement statistics output for tuning purposes.

---

## Part 2: Season Transition Log

### Data structures

```typescript
type SeasonTransitionEventCategory = 'retirement'; // extensible later

interface SeasonTransitionEvent {
  category: SeasonTransitionEventCategory;
  headline: string;
  detail: string;
  teamId: string;
  playerIds: string[];       // [retireeId, replacementId]
  isUserTeam: boolean;
}

interface SeasonTransitionLog {
  seasonYear: number;        // the season that just ended
  events: SeasonTransitionEvent[];
  isRead: boolean;
}
```

### Persistence

- Stored as a single key (e.g. `'season_transition_log'`) in the existing `appState` Dexie table via `AppDbService`
- Add `saveSeasonTransitionLog()` and `loadSeasonTransitionLog()` to `PersistenceService`
- The log is replaced atomically on each season rollover — no accumulation across seasons
- On load, if `log.seasonYear` does not match the current season year minus one, discard it as stale

### What gets logged

Not every retirement is equally interesting. Apply this filter when building the event list in `assessRetirements()`:

- **All retirements from the user's team**: always include, with specific player names in headline and detail
- **Notable CPU retirements**: include if `currentOverall >= 65` or `peakOverall >= 75` — these are players the user may have encountered as opponents
- **Suppress low-overall CPU retirements**: a 58-overall reserve retiring from a rival team is not news

Cap the total number of CPU retirement events at around 5 to avoid a noisy log.

### Surfacing in the UI

- `GameService` (or a thin companion service if it grows) exposes a computed signal:
  ```typescript
  unreadSeasonTransitionLog: Signal<SeasonTransitionLog | null>
  // null when absent, already read, or stale
  ```
- `NavigationComponent` already has the `hasSettingsVersionMismatch` indicator pattern — reuse this pattern to show a notification dot when `unreadSeasonTransitionLog` is non-null
- The actual content surfaces on the home page or as a dismissible banner on first landing after rollover
- Dismissing calls `markSeasonTransitionLogRead()` which flips `isRead` to true and persists

### Extensibility

The `category` field on `SeasonTransitionEvent` is the extension point. Future categories (injuries, milestones, standings events) add a new category value and a new event builder in the relevant service. The persistence, signal, display, and read/dismiss logic require no changes.