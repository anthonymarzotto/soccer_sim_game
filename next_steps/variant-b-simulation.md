# Variant B Simulation – Next Steps

## Current state (keep for context)

- Variant B owns the full simulation loop (`simulateMatch` + per-tick action orchestration) and no longer delegates to Variant A internals.
- Guardrails are in place and currently green for the active default profile:
	- `src/app/services/match.simulation.ab.spec.ts`
	- `src/app/services/match.simulation.variant-b.calibration.spec.ts`
- Design documentation lives in `public/design-docs/simulation-flow.html` and is viewable via `/design-docs`.

## Recently completed (condensed)

- Home advantage implemented in shot conversion:
	- `homeAdvantageGoalBonus` in `VariantBTuningConfig`
	- applied in `executeVariantBShot`
	- exposed in simulation debug tuning controls
- Foul model corrected:
	- defender now commits the foul against the carrier
	- `FOUL` event always emitted with `[offenderId, victimId]`
	- possession remains with fouled side
	- card attribution fixed to offender only
	- direct red vs second-yellow distinguished via metadata + commentary
	- send-offs now use `Role.DISMISSED`
- Foul restart logic now zone-aware:
	- advanced fouls stay threatening
	- deeper fouls reset further from goal

## Simulation-first priority order

### 1. Passing model overhaul (highest priority)

Current issue:
- Passing is still coarse: nearest-target bias + single success formula, with weak differentiation between recycle and progression outcomes.

Implementation phases:

1) Pass intent layer
- Add `PassIntent`: `RECYCLE | PROGRESSION | THROUGH_BALL | CROSS`.
- Select intent by zone, role, tactical style, scoreline state, and match minute.

2) Candidate scoring for targets
- Replace nearest-only targeting with a scored candidate model:
	- safety score (distance/angle)
	- progression score (attacking Y gain)
	- tactical fit (style + role)
- Sample from top candidates with weighted randomness to avoid deterministic patterns.

3) Pressure-aware pass success
- Introduce a pressure term from opponent tactical setup and local phase.
- Apply intent-specific risk modifiers (e.g. through-balls less safe, recycle safer).

4) Failure outcome split
- Differentiate failed-pass outcomes (`INTERCEPTION`, lane cut-out, overhit/turnover) instead of a single generic path.

5) Possession-chain quality
- Track chain quality signals (clean sequence length, progression depth, final-third entry).
- Use chain quality as a modest boost signal for chance creation, not a hard override.

Guardrails for this epic:
- Keep existing goals/shots acceptance checks.
- Add passing quality checks once intent model is in:
	- completion band
	- progression-pass share
	- turnover-from-pass share

### 2. Defensive pressure proxy

Current issue:
- Shot and pass quality still under-model opposition pressure at decision time.

Plan:
- Derive lightweight pressure score from `TacticalSetup.pressingIntensity`, phase, and zone.
- Feed pressure into both pass success and shot quality calculations.
- Validate effects through A/B guardrails and browser pacing.

### 3. Scoreline-state aggression

Current issue:
- Late-game urgency is still too mild for both trailing and leading behaviors.

Plan:
- Trailing side (final 15'): higher attacking risk and tempo.
- Leading side (final 15'): lower tempo, more recycling/clock management.
- Tune to increase realistic late swings without destabilizing baseline goals.

### 4. Substitutions + manpower effects

Current issue:
- `Role.DISMISSED` now prevents illegal re-entry, but no substitution system exists yet and numerical disadvantage effects are not explicitly modelled.

Plan:
- Add substitution framework with hard constraints:
	- never allow `Role.DISMISSED` players to re-enter
	- enforce substitution limits and role-safe replacement pools
- Add lightweight 10v11 effects on action weights and pass/shot success.

### 5. Guardrail maintenance

- Keep fast A/B spec broad for drift detection.
- Use calibration benchmark for slower realism tuning passes.
- Tighten event-density expectations only after sustained watch-game pacing validation.

## Key files for next work

- `src/app/services/match.simulation.variant-b.service.ts`
- `src/app/models/simulation.types.ts`
- `src/app/services/match.simulation.ab.spec.ts`
- `src/app/services/match.simulation.variant-b.calibration.spec.ts`
- `src/app/services/commentary.service.ts`
- `public/design-docs/simulation-flow.html`
