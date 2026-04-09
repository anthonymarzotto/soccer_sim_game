# Variant B Visualization Handoff (Future Ticket)

## Why this can be deferred

The current simulation cut is in a good stopping state for engine behavior.
Core simulation goals are implemented and guarded by passing AB and calibration specs.

What remains is primarily observability and UI visualization, not simulation correctness.

## Ticket objective

Expose enough replay/debug metadata to visualize:
- current starters
- current bench
- fatigue snapshots
- active on-field shape (staffed and unstaffed slots)

Use this metadata in debug and watch-game experiences.

## Not in scope for this ticket

- New simulation rules or tuning changes
- Rewriting action weighting or pass/shot logic
- Replacing existing play-by-play architecture

## Proposed implementation plan

### Phase 1: Metadata contract

1. Extend replay metadata types in src/app/models/simulation.types.ts.
2. Add optional team snapshot structures to keep compatibility safe.
3. Keep fields lightweight and serializable.

Suggested shape:
- per-team starters: player ids
- per-team bench: player ids
- per-team fatigue map: playerId -> fatigue level and stamina
- per-team active shape slots: slot id, player id or null, coordinates, zone
- optional flags: rebalanceApplied, tacticalSubPending

### Phase 2: Emit snapshots from simulation

1. Populate snapshots in src/app/services/match.simulation.variant-b.service.ts.
2. Attach snapshots to existing variantBReplay metadata on selected events.
3. Gate extra payloads behind enableSpatialTracking.

Emission policy for first cut:
- always on substitution and dismissal events
- always on pass and shot events
- optional on possession switches

### Phase 3: Debug UI readout

1. Add a compact inspector in src/app/pages/simulation-debug/simulation-debug.ts.
2. Show team starters, bench, and fatigue in a side panel.
3. Show active shape slot occupancy in a simple grid/table first.
4. Keep this text/diagram-first before any animation.

### Phase 4: Watch-game overlay

1. Add a lightweight overlay in src/app/pages/watch-game/watch-game.ts.
2. Show current lineups and fatigue deltas by event time.
3. Highlight shape changes after red cards and tactical substitutions.

### Phase 5: Field animation (optional follow-up)

1. Reuse keyframes and active shape slots for marker-based motion.
2. Start with simple token movement and possession highlighting.
3. Defer polish (transitions, easing, trails) to a separate ticket.

## Acceptance criteria

1. Replay metadata includes optional team snapshots without breaking existing consumers.
2. Debug page can render starters, bench, fatigue, and shape from replay metadata.
3. Watch-game can render at least one snapshot-driven overlay.
4. Existing simulation specs remain green:
   - src/app/services/match.simulation.ab.spec.ts
   - src/app/services/match.simulation.variant-b.calibration.spec.ts
5. No new runtime errors when enableSpatialTracking is false.

## Recommended technical safeguards

1. Keep metadata fields optional and version-tolerant.
2. Avoid attaching full snapshots to every event unless needed.
3. Use stable player ids and slot ids only; avoid embedding mutable player objects.
4. Add one targeted metadata unit test and one UI parsing test before animation work.

## Suggested implementation order for PRs

1. PR 1: Type updates + simulation metadata emission + tests.
2. PR 2: Simulation-debug inspector.
3. PR 3: Watch-game overlay.
4. PR 4: Optional field animation.

## Definition of done for this ticket

The team can inspect starters, bench, fatigue, and active shape progression directly from replay data in at least one UI surface without changing simulation behavior.
