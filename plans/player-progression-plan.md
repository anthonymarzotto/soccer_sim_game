## Soccer Simulation — Player Progression System

### Overview
A stats-driven season rollover system that models realistic player development and aging. Each season, player attributes change based on hidden progression attributes, position-specific aging curves, and randomness. No manual tuning per player — everything emerges from the algorithm.

---

### Database Schema

#### `Player` interface additions
Add a `progression` property to the `Player` interface in `src/app/models/types.ts`:

```typescript
export interface PlayerProgression {
  potential: number;         // 1–100, the Overall rating the player is capable of reaching. Softly caps growth via headroom.
  professionalism: number;   // 1–100, scales outcomes and extends career longevity
  temperament: number;       // 1–100, low = high variance in development (formerly consistency)
  juniorEndAge: number;      // computed once at creation
  peakEndAge: number;        // computed once at creation
  seniorEndAge: number;      // computed once at creation
}

// In Player interface:
// progression: PlayerProgression;
```

### Phase Threshold Calculation (run once at player creation)

Base ages by position (from `src/app/models/enums.ts` Position enum):

| Phase boundary | Goalkeeper | Defender | Midfielder | Forward |
|---|---|---|---|---|
| `juniorEndAge` | 23 | 22 | 22 | 21 |
| `peakEndAge` | 32 | 29 | 28 | 27 |
| `seniorEndAge` | 36 | 33 | 32 | 32 |

Per-player adjustment, applied on top of base, capped at ±3 years:

```typescript
juniorEndAge = baseJuniorEnd + clamp(Math.floor((potential - 50) / 10), -3, 3)
peakEndAge   = basePeakEnd   + clamp(Math.floor((professionalism - 50) / 10), -3, 3)
seniorEndAge = baseSeniorEnd + clamp(Math.floor((professionalism - 50) / 20), -3, 3)
```

High potential → longer junior phase (late bloomer). High professionalism → longer peak and senior phases.

---

### Phase Derivation (runtime, not persisted)

Implemented using `computeAge` from `src/app/models/player-age.ts`:

```typescript
import { computeAge, seasonAnchorDate } from '../models/player-age';
import { gaussianRandom } from '../utils/math';

function derivePhase(age: number, player: Player): Phase {
  const p = player.progression;
  if (age <= p.juniorEndAge) return Phase.Junior;
  if (age <= p.peakEndAge) return Phase.Peak;
  if (age <= p.seniorEndAge) return Phase.Senior;
  return Phase.Decline;
}
```

---

### Attribute Group Behaviour by Phase

Groups map to `StatCategory` values in `types.ts`: `physical`, `skill` (includes `goalkeeping`), and `mental`.

| Group | Junior | Peak | Senior | Decline |
|---|---|---|---|---|
| **Physical** | ↑ grows | → stable | ↓ slight decay | ↓↓ fast decay |
| **Skill/GK** | ↑ grows | ↑ small gains | → mostly stable | ↓ slight decay |
| **Mental** | → mostly stable | ↑ grows | ↑ continues | → stable/slight decay |

---

### Growth & Decay Chances

Growth and decay roll **independently** each season — a player can gain a skill point and lose a stamina point in the same rollover.

| Phase | Group | Growth Chance | Decay Chance |
|---|---|---|---|
| **Junior** | Physical | 0.65 | 0.10 |
| **Junior** | Skill/GK | 0.60 | 0.10 |
| **Junior** | Mental | 0.25 | 0.05 |
| **Peak** | Physical | 0.20 | 0.15 |
| **Peak** | Skill/GK | 0.35 | 0.10 |
| **Peak** | Mental | 0.55 | 0.05 |
| **Senior** | Physical | 0.05 | 0.50 |
| **Senior** | Skill/GK | 0.15 | 0.20 |
| **Senior** | Mental | 0.45 | 0.10 |
| **Decline** | Physical | 0.00 | 0.85 |
| **Decline** | Skill/GK | 0.00 | 0.40 |
| **Decline** | Mental | 0.10 | 0.20 |

---

### Season Rollover Algorithm (per player)

To be integrated during `GameService` season advancement:

```typescript
function rolloverPlayer(player: Player, nextSeasonYear: number): void {

  // 1. LOAD current season stats (latest row in player.seasonAttributes)
  const currentAttrs = player.seasonAttributes[player.seasonAttributes.length - 1];

  // 2. INCREMENT AGE
  const currentAge = computeAge(player.personal.birthday, seasonAnchorDate(nextSeasonYear));
  const phase = derivePhase(currentAge, player);

  // 3. DEVELOPMENT ROLL
  // headroom shrinks as Overall approaches potential, naturally slowing growth.
  const headroom = Math.max(0, player.progression.potential - currentAttrs.overall.value);
  
  const outcomeRoll = gaussianRandom({
    mean: phaseGrowthChance(phase) * (player.progression.professionalism / 100),
    variance: 1 - (player.progression.temperament / 100)
  });

  // 4. FOR EACH ATTRIBUTE GROUP [physical, skill/goalkeeping, mental]:
  const newAttrs: PlayerSeasonAttributes = structuredClone(currentAttrs);
  newAttrs.seasonYear = nextSeasonYear;

  for (const group of ['physical', 'skill', 'goalkeeping', 'mental']) {
    const growthWeight = phaseGrowthWeight(group, phase);
    const decayWeight = phaseDecayWeight(group, phase);
    
    // Iterate over all StatKeys in this category
    for (const key of getStatKeysForCategory(group)) {
      if (Math.random() < 0.60) {                              // ~60% chance any given attribute changes
        // Use Math.sqrt for a smoother, non-linear slowdown as headroom approaches 0
        const growth = outcomeRoll * growthWeight * Math.sqrt(headroom / 100);
        const decay  = decayWeight * Math.random(); // decayRoll
        const delta  = growth - decay;
        
        newAttrs[key].value = clamp(currentAttrs[key].value + Math.round(delta), 1, 100);
      }
    }
  }

  // 5. RECALCULATE OVERALL
  newAttrs.overall.value = calculateOverall(newAttrs, player.position);

  // 6. UPDATE player attributes array (ensure GameService handles persistence)
  player.seasonAttributes = [...player.seasonAttributes, newAttrs];
}
```

---

### Key Design Principles

- **Potential** is the Overall rating the player is capable of reaching under ideal conditions. It softly limits growth via headroom — as a player's Overall approaches their potential, gains shrink naturally. Individual attributes are never clamped; the mix that produces the Overall is unconstrained.
- **Professionalism** controls how close a player gets to their potential and how long their career lasts.
- **Temperament** controls variance — low temperament players can boom or bust unpredictably.
- **Young player failure is emergent** — low professionalism drags down outcome rolls without any forced failure logic; not all juniors develop.
- **Mental attributes peak last and fade last** — models the real-world "wily veteran" effect.
- **Position anchors the aging curve** — goalkeepers last longest, forwards fade earliest.
- **Rollover is an append, not an overwrite** — full career history is preserved in `seasonAttributes` for UI comparisons across seasons.