---
description: "Use when modifying multi-year persistence models, rollover orchestration, or season-history storage/retrieval paths."
applyTo: "src/app/models/types.ts,src/app/services/game.service.ts,src/app/services/league-assembly.service.ts,src/app/services/normalized-db.service.ts,src/app/services/app-db.service.ts,src/app/services/persistence.service.ts,src/app/services/data-schema-version.service.ts"
---

# Multi-Year Persistence Guardrails

These rules define non-negotiable behavior for the multi-year persistence architecture.

## Canonical Data Shape Rules

1. `PlayerSeasonAttributes` is the source of truth for seasonal player attributes.
- Seasonal attributes include physical, mental, hidden, skills, and overall.
- Do not keep duplicate authoritative seasonal values on the root `Player` model.

2. `TeamSeasonSnapshot` is the source of truth for seasonal team state.
- Seasonal roster order (`playerIds`) and seasonal stats must be stored in snapshots keyed by `seasonYear`.
- Keep `selectedFormationId` and `formationAssignments` on root `Team`.

3. Season history invariants:
- At most one record per `seasonYear` per history collection.
- Histories remain sorted in ascending `seasonYear`.
- Previous-season snapshots are immutable once finalized.

## Read/Write Path Rules

1. Shared selectors for reads.
- Current-season and season-targeted reads must use shared service selectors/helpers.
- Do not duplicate season-resolution logic in pages/components.

2. Single rollover orchestrator for writes.
- Season rollover side effects must execute through one orchestration path.
- Completing a season must not auto-advance the year.
- Rollover occurs only via explicit user action ("Start New Season" behavior, UI location can vary).

3. Rollover behavior requirements.
- On rollover action: increment season year, generate next schedule, seed next-season player/team records, reset week progression.
- Apply retention pruning as part of the same rollover action.

## Retention Rules

1. Saved-match cap is 5000.
2. Pruning trigger is explicit season rollover only.
3. Pruning removes whole oldest season buckets only.
4. Do not partially prune a season.

## Integrity and Schema Rules

1. Missing current-season records are incompatible persisted data.
2. Dev/test should fail loudly on integrity mismatches.
3. During schema mismatch, writes stay blocked until explicit reset resolves mismatch.
4. Persistence contract changes must trigger:
- `dataSchemaVersion` review/bump.
- Regeneration/sync of `src/app/generated/data-schema-version.ts`.
- Tests for outdated payload handling and reset-path behavior.

## Aggregation and Scope Rules

1. Career/team aggregate totals are computed (and optionally in-memory cached).