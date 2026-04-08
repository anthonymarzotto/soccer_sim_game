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
- Scoreline-state aggression is complete:
	- final-15 behavior split is active (minute `>= 80`)
	- trailing side increases risk (more shot/carry pressure and direct intent)
	- leading side increases recycle-first game management
	- regression coverage added for late-game scoreline behavior and metadata integrity in `src/app/services/match.simulation.ab.spec.ts`
	- AB, calibration, and fouls guardrails remain green after rollout
- Substitution handling is complete:
	- substitution checks run at minute boundaries in the simulation loop
	- max substitutions per team is `5`
	- incoming eligibility is `Role.BENCH` only
	- outgoing players are marked `Role.SUBSTITUTED_OUT` to prevent same-match re-entry
	- substitutions emit `SUBSTITUTION` events with outgoing/incoming player ids
	- substitutions are shown in Expanded Key Moments, not Key Events summary
	- dedicated substitution specs added and guardrails remain green

## Active priorities

### 1) Manpower effects (separate from substitutions)

Goal:
- Model 10v11/11v10 impacts after dismissals without changing substitution mechanics.

Plan:
- Apply lightweight manpower modifiers to action weights and pass/shot success.
- Keep `Role.DISMISSED` constraints explicit and test-covered.

### 2) Guardrail maintenance

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
