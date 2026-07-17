---
name: recalibrate-ovr
description: Recalibrate position-specific player OVR weightings by running match simulation diagnostics.
---
# Recalibrate Player OVR Weightings

This skill guides you through re-analyzing positional match event rates and adjusting the `POSITION_OVR_CONFIG` in `src/app/models/player-progression.ts`.

## Step 1: Run the Diagnostic Test
Execute the diagnostic test to output a Markdown table of match events per position per 90 minutes:
```bash
npx ng test --watch=false --include src/app/services/analyze-position-events.spec.ts
```

## Step 2: Correlate and Calibrate
1. Review the output table (e.g. goals, assists, tackles, interceptions per 90).
2. Group the attributes into "Core" (85% total weight) and "Tertiary" (15% total weight).
3. Distribute the 100% of "Core" weight across the main attributes for each position based on their relative event rates and game-criticality.

## Step 3: Update player-progression.ts
Update the `POSITION_OVR_CONFIG` mapping in `src/app/models/player-progression.ts`. Ensure that for any position, the weights defined in the `core` object sum to exactly `100`.

## Step 4: Verify
Run all tests to verify OVR calculations remain correct and compiles successfully:
```bash
npm run test -- --watch=false
```
