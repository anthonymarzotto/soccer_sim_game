---
description: "Use when modifying match.simulation.variant-b.service.ts. Requires updating the variant-b-simulation-flow.html diagram to reflect structural changes to the simulation loop, action types, shot resolution gates, or fatigue handling."
applyTo: "src/app/services/match.simulation.variant-b.service.ts"
---

# Keep the Flow Diagram in Sync

The canonical flow diagram lives at `public/design-docs/simulation-flow.html`. It is a self-contained HTML file with an inline Mermaid `flowchart TD` diagram. Update it whenever a structural change is made to the simulation engine.

## Functions to watch

These are the functions whose changes most often require a diagram update:

| Function | Diagram area it owns |
|---|---|
| `simulateMatch` | Top-level initialisation block, minute loop, tick loop, fatigue normalisation |
| `determineTicksForMinute` | "Determine tick count" node label (zone names, urgency conditions) |
| `simulateVariantBTick` | Sequence inside the tick loop: fatigue → carrier → movement → action roll |
| `determineCarrierAction` | The `ACTION` decision diamond and its outgoing branches |
| `executeVariantBAction` | Which branch labels exist on `ACTION` and what each one does |
| `executeVariantBShot` | The two-gate shot resolution sub-flow: on-target → goal/save/miss |
| `normalizeFatigueForTickCount` | The "Normalise fatigue" node after the tick loop closes |

## What triggers a diagram update

**Do update** when:
- A new action type is added to or removed from `determineCarrierAction` / `executeVariantBAction`
- A new gate or condition is inserted into `executeVariantBShot` (e.g. a pressure check between on-target and goal)
- A new modifier changes the *outcome* of a gate (add a label or annotation to the affected node)
- The order of steps inside the tick loop changes
- New sub-flows are introduced (e.g. injury check, substitution trigger)
- A step is removed or merged with another

**Do not update** when:
- Only numeric tuning constants or `DEFAULT_VARIANT_B_TUNING` values change
- An internal helper is extracted or renamed without changing observable flow
- Debug logging or replay metadata fields are added
- Type annotations or imports change

## How to update the diagram

1. Read the current Mermaid source inside `public/design-docs/simulation-flow.html` (inside the `<div class="mermaid">` block).
2. Identify which node(s) or edge(s) correspond to the changed code using the function table above.
3. Edit only the affected nodes/edges — preserve existing node IDs and styles unless a node is being removed.
4. Keep node labels high-level (describe *what*, not *how*). Do not embed probability values or constant names.
5. If a new gate is added, model it as a diamond (`{"question?"}`) with labelled outgoing edges.
6. After editing, verify the Mermaid source is valid: every node referenced in an edge must be declared, and `style` lines must only reference declared node IDs.
