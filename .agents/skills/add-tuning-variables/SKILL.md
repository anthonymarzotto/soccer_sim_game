---
name: add-tuning-variables
description: Workflow for adding new tunable parameters to the Variant B simulation engine and debug UI.
---
# Add New Tuning Variables to Variant B Engine

## Overview
When you want to extend the Variant B simulation with new tunable parameters, follow this workflow to add them to both the engine and the debug UI.

## Files Involved
1. `src/app/models/simulation.types.ts` — Type definition
2. `src/app/services/match.simulation.variant-b.service.ts` — Engine defaults & usage
3. `src/app/pages/simulation-debug/simulation-debug.ts` — Debug UI signals & template

## Step-by-Step Workflow

### 1. Add to VariantBTuningConfig Type
In `src/app/models/simulation.types.ts`:
```typescript
export interface VariantBTuningConfig {
  // ... existing fields ...
  
  // NEW FIELD HERE
  newVariableName: number;
}
```

### 2. Add to Engine Defaults
In `src/app/services/match.simulation.variant-b.service.ts`, within `DEFAULT_VARIANT_B_TUNING`:
```typescript
const DEFAULT_VARIANT_B_TUNING: VariantBTuningConfig = {
  // ... existing defaults ...
  
  newVariableName: 0.50,  // <- Add with sensible default
};
```

Also use the variable in the engine logic:
```typescript
// Example: in determineCarrierAction() or elsewhere
if (someCondition) {
  weight += this.activeTuning.newVariableName;
}
```

### 3. Add Signal to Debug Component
In `src/app/pages/simulation-debug/simulation-debug.ts`, in the class:
```typescript
export class SimulationDebugComponent {
  // ... existing signals ...
  
  readonly newVariableName = signal(0.50);  // <- Match the default
```

### 4. Add Setter Method
Still in the component class:
```typescript
setNewVariableName(value: string): void {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    this.newVariableName.set(Math.round(parsed * 100) / 100);
  }
}
```

### 5. Include in Tuning Config Passed to Engine
In the `simulateMatch()` method, add to the `tuning` object:
```typescript
const tuning: Partial<VariantBTuningConfig> = {
  // ... existing fields ...
  newVariableName: this.newVariableName(),  // <- Add here
};
```

### 6. Add UI Control to Template
In the tuning panel (within `@if (showTuning())`), add a slider:
```html
<div>
  <label class="block text-xs font-medium text-zinc-300 mb-2">
    New Variable Name: {{ newVariableName().toFixed(2) }}
  </label>
  <input
    type="range"
    min="0.10"
    max="0.90"
    step="0.01"
    [value]="newVariableName()"
    (input)="setNewVariableName($any($event.target).value)"
    class="w-full"
  />
  <p class="text-xs text-zinc-500 mt-1">Description of what this controls</p>
</div>
```

## Checklist
- [ ] Type added to `VariantBTuningConfig`
- [ ] Default value in `DEFAULT_VARIANT_B_TUNING`
- [ ] Variable used in engine logic
- [ ] Signal created in debug component
- [ ] Setter method defined
- [ ] Added to tuning config in `simulateMatch()`
- [ ] UI slider added to template
- [ ] Tests pass

## Example Ranges
- Chance/Probability fields: `0.0` to `1.0` (step `0.01`)
- Weight/Multiplier fields: `0.05` to `2.0` (step `0.01`)
- Count fields: `1` to `20` (step `1`)
- Distance fields: `0.5` to `10.0` (step `0.1`)

## Testing
Run the acceptance guardrail spec:
```bash
npm run test -- --watch=false --include src/app/services/match.simulation.ab.spec.ts
```
Verify that tuning changes affect simulation outputs within expected ranges.
