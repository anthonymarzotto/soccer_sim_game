# Variant B Simulation – Next Steps

## What was built in this session

### Core engine (`match.simulation.variant-b.service.ts`)
- Replaced the old Variant A delegation with a fully independent Variant B orchestration loop.
- **Adaptive ticks per minute** driven by field zone (defense: 1-3, midfield: 2-5, attack: 2-5) and late-game urgency boost when the score is close with < 15 minutes left.
- **Ball-carrier decision model**: each tick the player in possession picks an action (PASS / CARRY / SHOT / FOUL) using weighted probabilities that shift based on field zone, player role, tactical style, fatigue level, scoreline, and match minute.
- **Silent CARRY action**: possession progressions that move the ball but don't create a logged event, reducing event spam while preserving spatial dynamism.
- **Variant B-native shot resolution** (`executeVariantBShot`): replaces the Variant A shot delegate with a direction-agnostic model that normalises away-team shots correctly and uses separate on-target and goal-chance calculations driven by attacking depth and lateral angle.
- **Fatigue normalisation** after multi-tick minutes so per-minute accumulation stays representative regardless of tick count.
- **Deep team cloning** (`structuredClone`) at match start in *both* Variant A and B services — in-simulation mutations (future substitutions, injuries, tactical changes) will never leak into canonical league state.
- **Animation-ready replay metadata** emitted per event in `additionalData.variantBReplay`: actor player ID, action type, duration, and 3-keyframe ball path. Fully additive and backward-compatible with existing UI consumers.

### Calibration infrastructure
- **`VariantBTuningConfig`** interface in `simulation.types.ts` exposes all scoring levers as first-class named fields.
- **`SimulationConfig.variantBTuning?: Partial<VariantBTuningConfig>`** lets callers pass preset overrides without code changes.
- **`DEFAULT_VARIANT_B_TUNING`** constant in the service holds the active defaults — a single place to read and change tuning.
- **Calibration benchmark spec** (`match.simulation.variant-b.calibration.spec.ts`): runs 100 seeded matches per preset, ranks presets by a combined realism score weighted 1× goals distance + 0.35× shots distance, and writes results to `test-output/simulation-ab/variant-b-calibration-latest.json`.
- **`npm run test:simulation-calibration`** script runs the benchmark directly.
- Calibration spec now has explicit acceptance bands: goals 2.2–3.3, shots 22–28.

### A/B harness improvements
- Fixed `SimulationABRunner.buildSummary` grouping — previously collapsed all `variant === 'B'` rows into one bucket; now groups by `(variant, variantName)` so multiple B presets are summarised independently.
- Added A/B harness assertion that Variant B average events exceed Variant A average events.

### Current default metrics (100-match benchmark)
| Metric | Value | Real-world target |
|---|---|---|
| Avg total goals | ~2.85 | ~2.75 |
| Avg combined shots | ~24 | ~26.5 (PL median) |
| Avg shots on target | ~9.8 | ~9-10 |
| Avg events logged | ~227 | lower is better |

---

## Key files

| File | Role |
|---|---|
| `src/app/services/match.simulation.variant-b.service.ts` | Variant B engine + tuning constants |
| `src/app/services/match.simulation.service.ts` | Variant A baseline; shared bridge methods (`simulateMinute`, `handlePass`, `handleShot`, `handleFoul`, `handleGoal`, `handleCorner`, `updateFatigue`, `updatePossessionStats`, `createEvent`, `initializeMatchState`, `calculateTeamTactics`, `initializeFatigue`) |
| `src/app/models/simulation.types.ts` | `VariantBTuningConfig`, `VariantBReplayMetadata`, `ReplayKeyframe`, `SimulationConfig.variantBTuning` |
| `src/app/services/match.simulation.variant-b.calibration.spec.ts` | 100-match calibration benchmark with acceptance bands |
| `src/app/services/match.simulation.ab.spec.ts` | A/B batch harness (10 matches per variant, JSON report) |
| `src/app/testing/simulation-ab.runner.ts` | Batch runner; summary grouping fixed to `(variant, variantName)` |
| `test-output/simulation-ab/variant-b-calibration-latest.json` | Latest calibration output (overwritten each run) |

---

## Bridge pattern — important contract

Variant B calls private methods on `MatchSimulationService` via `MatchSimulationBridge` (a local cast interface). The methods it currently depends on are marked in `match.simulation.service.ts` with the comment `// ** TEMPORARY BRIDGE FOR VARIANT B **`. These should eventually either be:
- Moved to a shared `MatchSimulationCoreService`, or
- Re-implemented natively in Variant B and the bridge stripped.

Do not refactor the shared methods in Variant A without checking they aren't relied on through the bridge.

---

## Next steps

### 1. Possession-chain quality (Phase 2 continuation)
Variant B currently does not differentiate *attacking* passes from *recycling* passes. A pass in the own half always looks the same as a through-ball. Consider:
- Add `PassIntent` within the carrier decision: `RECYCLE | PROGRESSION | THROUGH_BALL | CROSS`.
- Each intent maps to a different target-player selection strategy (nearest safe target vs. furthest forward-progressing target etc.).
- Track pass chain length in `Possession.passes` and use it to reward sequences that break into the final third.

### 2. Defensive pressure proxy
There is no opponent defensive presence modelled per tick. A shot from an open position is treated the same as a shot under pressing. Consider:
- Derive a lightweight pressure score from team pressing intensity (`TacticalSetup.pressingIntensity`) and match phase.
- Apply pressure discount to pass success and shot quality in `determineCarrierAction`.
- This will naturally reduce goal conversion when under pressure and increase it on counter-attacks.

### 3. Scoreline-state aggression
Trailing teams currently have only a mild late-game shot weight boost. Realistic urgency logic requires:
- Losing teams in the final 15 minutes increase shot attempts, reduce passing safety, and push more ticks.
- Winning teams in the final 15 minutes lower tick density and increase recycling carries to waste time.
- This change will add variance to match outcomes and produce more realistic "late winner" patterns.

### 4. Home advantage
Both teams currently run the same probability model. Add a configurable home advantage modifier (~+5% on shot quality, slightly higher pressing intensity for home team) to reflect the real-world home win rate (~46%).

### 5. Acceptance gates in the main A/B spec
The calibration spec has acceptance bands, but `match.simulation.ab.spec.ts` only checks event-density uplift. Add explicit checks:
- Variant B avg goals in a realistic range (e.g. 2.0–3.5 per game).
- Variant B avg shots in a realistic range (e.g. 20–30 per game).
- This prevents tuning drift between sessions.

### 6. Watch-game commentary density
At ~227 events per match (vs. Variant A ~87), watch-game commentary feed now has ~2.6× as many items feeding in at 1-second intervals. This will feel too fast at the current 1-second/item rate:
- Consider grouping low-importance events (PASSes, CARRYs that produced no event) at 0.3-second intervals.
- Keep goal / save / foul / card events at their own pause cadence.
- The `EventImportance` filter in `watch-game.ts:generateCommentaryFromMatch` already gates MEDIUM/HIGH, so most silent carries won't appear — but worth verifying the pacing in the browser.

### 7. Substitutions and injuries (groundwork is ready)
Team cloning is in place. The groundwork for in-match mutations is done. The first feature to layer on top:
- A `MatchSimulationContext` object attached to each simulation run containing: active player list (from clone), substitution slots used, injury flags.
- Variant B can reduce a fatigued player's `performanceModifier` below the current 0.5 floor and trigger a substitution by swapping `playerWithBall` to a bench player.

### 8. Post-match analysis compatibility
`post.match.analysis.service.ts:extractKeyMoments` currently filters on `EventImportance`. With more events and richer metadata, a quality review is worthwhile:
- Verify that shot events with `additionalData.variantBReplay` are properly surfaced as key moments.
- Commentary templates in `commentary.service.ts` don't yet use spatial data from events — passing `event.location` into commentary templates for shot events would get "a shot from the left side of the box" level of detail cheaply.
