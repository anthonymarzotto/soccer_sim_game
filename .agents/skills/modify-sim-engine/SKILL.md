---
name: modify-sim-engine
description: Rules and invariants to follow when modifying the match simulation engine, tick loop, or set-piece calculations
---

# Modify Simulation Engine Skill

Use this skill whenever you are requested to modify, debug, or add features to the match simulation engine (especially Variant B in `MatchSimulationVariantBService`).

## 1. Normalized Event Budget
* **The Goal**: Keep the average match length and total action volume stable.
* **The Rule**: Any new event pathways, fouls, or set pieces must **consume** from the existing match tick budget (~250 ticks per match) rather than appending extra ticks. Do not stretch match duration.

## 2. Strict Configuration Discipline
* **The Goal**: Keep simulation logic decoupled from balance/calibration tuning.
* **The Rule**: Never hardcode numeric success rates, shot weights, pass weights, or skill multipliers directly in simulation gameplay methods.
* **Implementation**: Define all tunable metrics as properties on `VariantBTuningConfig` in `simulation.types.ts`, assign default values in `DEFAULT_VARIANT_B_TUNING` in the service file, and reference them via `this.activeTuning.<metricName>`.

## 3. Mandatory Guardrail Verification
* **The Goal**: Avoid goal-scoring inflation or shot count regressions.
* **The Rule**: After making any changes to match engine logic, you MUST run the fast simulation guardrail tests:
  ```powershell
  npm.cmd run test:simulation-ab
  ```
* **Acceptance Bands**: Ensure that:
  - `avgTotalGoals` stays between `1.8` and `3.0` (target ~2.4–2.5).
  - `avgShots` stays between `15` and `30` (target ~26–27).
* If a test fails, calibrate the default tuning variables rather than changing the test assertions.
