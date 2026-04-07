# Variant B Simulation - Next Steps

## Current state

- Variant B owns the full simulation loop (`simulateMatch` + per-tick action orchestration).
- Guardrails are currently green for active defaults:
	- `src/app/services/match.simulation.ab.spec.ts`
	- `src/app/services/match.simulation.variant-b.calibration.spec.ts`
- Simulation flow design doc is maintained at `public/design-docs/simulation-flow.html` and exposed in-app at `/design-docs`.

## Completed and retired from backlog

- Home advantage in shot conversion (`homeAdvantageGoalBonus`) is implemented and exposed in debug tuning.
- Foul/card model correction is complete:
	- defender is the foul offender
	- events preserve offender + victim ids
	- possession restart behavior is zone-aware
	- second-yellow and direct-red paths are separated
	- dismissed players are marked `Role.DISMISSED`
- Passing overhaul phases are complete:
	- pass intent model (`RECYCLE | PROGRESSION | THROUGH_BALL | CROSS`)
	- deterministic target scoring
	- pressure-aware pass success
	- pass failure split (`TACKLED | LANE_CUT_OUT | OVERHIT`)
	- possession-chain quality signal
	- controlled randomness follow-up (weighted top-candidate target selection)
- Passing quality guardrails are enforced in specs:
	- completion rate: `0.60` to `0.90`
	- progression-pass share: `0.10` to `0.75`
	- turnover-from-pass share: `0.10` to `0.40`
- Commentary enrichment for the passing model is complete and covered by `src/app/services/commentary.service.spec.ts`.

## Active priorities

### 1) Scoreline-state aggression

Goal:
- Improve late-game realism in the final 15 minutes without destabilizing baseline goals/shots.

Plan:
- Trailing side: increase risk and tempo.
- Leading side: increase recycling/clock-management behavior.
- Validate against existing AB/calibration guardrails.

### 2) Substitutions and manpower effects

Goal:
- Add substitution behavior and explicit 10v11 effects while preserving dismissal constraints.

Plan:
- Add substitution framework with limits and role-safe replacement pools.
- Ensure `Role.DISMISSED` players can never re-enter.
- Add lightweight manpower impact on action weights and pass/shot success.

### 3) Guardrail maintenance

- Keep fast AB spec broad for drift detection.
- Keep calibration benchmark for slower realism tuning.
- Tighten event-density expectations only after watch-game pacing remains stable over multiple runs.

## Key files for next work

- `src/app/services/match.simulation.variant-b.service.ts`
- `src/app/models/simulation.types.ts`
- `src/app/services/match.simulation.ab.spec.ts`
- `src/app/services/match.simulation.variant-b.calibration.spec.ts`
- `src/app/services/commentary.service.ts`
- `src/app/services/commentary.service.spec.ts`
- `public/design-docs/simulation-flow.html`
