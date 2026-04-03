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

### Watch-game playback (`watch-game.ts`)
- Replaced the old fixed 1-second commentary interval with **importance-based replay pacing**.
- **Routine commentary** stays at the original 1-second cadence, preserving the previous replay feel for normal match flow.
- **Medium and high-importance events** now hold longer on screen, giving shots, saves, goals, cards, and other major moments more breathing room.
- Half-time remains an explicit pause point, and second-half playback resumes with its own cadence rather than dropping straight back into a fixed timer.
- Expanded key moments in replay are now **minute-gated during live simulation** to prevent spoiler reveals before they occur.

### Post-match and summary consumers
- `PostMatchAnalysisService.extractKeyMoments` now surfaces notable non-goal attacking moments (saves and notable misses/shots), not just goals/cards/set-piece milestones.
- Chance selection now uses both spatial context (`event.location`) and Variant B metadata (`additionalData.variantBReplay`) for better signal.
- `CommentaryService` now includes location-aware chance phrasing (e.g., left channel inside the box, central area from long range).
- Save commentary now correctly attributes the save action to the goalkeeper.
- `match-summary` now has a collapsible **Expanded Key Moments** section backed by `matchReport.keyMoments`.
- Schedule page now reuses `app-match-summary`, so schedule and watch-game share the same summary rendering behavior.

### Stat attribution fixes (`game.service.ts`)
- Fixed career stat attribution for multi-player events:
	- Goals now credit only the scorer (`event.playerIds[0]`).
	- Saves now credit only the goalkeeper (`event.playerIds[1]` when present).
- Fixed clean-sheet attribution:
	- Home goalkeeper clean sheet now checks `awayScore === 0`.
	- Away goalkeeper clean sheet now checks `homeScore === 0`.

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
| `src/app/models/simulation.types.ts` | `VariantBTuningConfig`, `VariantBReplayMetadata`, `ReplayKeyframe`, `SimulationConfig.variantBTuning` |
| `src/app/services/match.simulation.variant-b.calibration.spec.ts` | 100-match calibration benchmark with acceptance bands |
| `src/app/services/match.simulation.ab.spec.ts` | A/B batch harness (10 matches per variant, JSON report) |
| `src/app/testing/simulation-ab.runner.ts` | Batch runner; summary grouping fixed to `(variant, variantName)` |
| `src/app/pages/watch-game/watch-game.ts` | Replay/commentary pacing consumer for dense Variant B event streams |
| `src/app/components/match-summary/match-summary.ts` | Shared summary card with collapsible expanded key moments |
| `src/app/pages/schedule/schedule.ts` | Schedule page now reuses shared summary component |
| `src/app/services/post.match.analysis.service.ts` | Post-match key-moment extraction with notable non-goal chances |
| `src/app/services/commentary.service.ts` | Commentary generation with location-aware chance language |
| `src/app/services/game.service.ts` | Match persistence + player career stat attribution (goals/saves/clean sheets) |
| `test-output/simulation-ab/variant-b-calibration-latest.json` | Latest calibration output (overwritten each run) |

---

## Current architecture note

Variant B is no longer delegating core match flow to a shared Variant A service. The current implementation owns its own match-state initialization, tactics derivation, fatigue updates, possession updates, pass handling, foul handling, and shot resolution inside `match.simulation.variant-b.service.ts`.

That changes the risk profile of future work:
- Variant B tuning and feature work can proceed without preserving a temporary bridge contract.
- The main follow-on integration risk is now in downstream consumers (`watch-game`, post-match analysis, commentary), not in hidden coupling to a baseline simulation service.

---

## Next steps

### 1. Post-match event consumption
Status: finished for this round.

Completed baseline work:
- Dangerous saves and notable non-goal chances are now eligible for post-match key moments.
- `additionalData.variantBReplay` and `event.location` are now used when deciding whether a non-goal attacking event is worth surfacing.
- Shot/save/miss commentary now includes rough origin context, such as left channel inside the box or central area from long range.

Round decision:
- Keep `keyEvents` and `matchReport.keyMoments` intentionally distinct:
	- `keyEvents` remains the compact, low-noise summary track.
	- `keyMoments` remains the richer post-match analysis track.

## Simulation-first priority order

### 1. Defensive pressure proxy
There is no opponent defensive presence modelled per tick. A shot from an open position is treated the same as a shot under pressing. Consider:
- Derive a lightweight pressure score from team pressing intensity (`TacticalSetup.pressingIntensity`) and match phase.
- Apply pressure discount to pass success and shot quality in `determineCarrierAction`.
- This will naturally reduce goal conversion when under pressure and increase it on counter-attacks.

### 2. Scoreline-state aggression
Trailing teams currently have only a mild late-game shot weight boost. Realistic urgency logic requires:
- Losing teams in the final 15 minutes increase shot attempts, reduce passing safety, and push more ticks.
- Winning teams in the final 15 minutes lower tick density and increase recycling carries to waste time.
- This change will add variance to match outcomes and produce more realistic "late winner" patterns.

### 3. Home advantage
Both teams currently run the same probability model. Add a configurable home advantage modifier (~+5% on shot quality, slightly higher pressing intensity for home team) to reflect the real-world home win rate (~46%).

### 4. Possession-chain quality (Phase 2 continuation) — stretch goal
Variant B currently does not differentiate *attacking* passes from *recycling* passes. A pass in the own half always looks the same as a through-ball. Consider:
- Add `PassIntent` within the carrier decision: `RECYCLE | PROGRESSION | THROUGH_BALL | CROSS`.
- Each intent maps to a different target-player selection strategy (nearest safe target vs. furthest forward-progressing target etc.).
- Track pass chain length in `Possession.passes` and use it to reward sequences that break into the final third.

Note for this round:
- An earlier attempt produced noisy, hard-to-tune outcomes.
- Treat this as a focused follow-up pass rather than core-scope tuning work.

### 5. Guardrail maintenance
Acceptance gates already exist in `match.simulation.ab.spec.ts` and in the calibration benchmark spec. The remaining work here is maintenance, not initial setup. Consider:
- Keeping the fast A/B spec broad enough to catch obvious tuning drift.
- Using the 100-match calibration benchmark for slower realism tuning passes.
- Tightening event-density expectations only after browser pacing checks remain consistently good.

## Completed decisions and validation

- Browser validation pass completed:
	- Watch-game pacing and expanded moments feel good in manual testing.
	- No spoiler leakage observed for expanded key moments during live simulation.
	- Goalkeeper stat line sanity checks (goals/saves/clean sheets) look resolved after the latest fixes.
- Product decision confirmed:
	- `keyEvents` and `keyMoments` remain distinct on purpose.
