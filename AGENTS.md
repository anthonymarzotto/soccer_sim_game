# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Running Unit Tests

To run unit tests quickly for only modified/changed files (recommended during active development):
- On Windows PowerShell:
  ```powershell
  npm.cmd run test:changed
  ```
- On other platforms/shells:
  ```bash
  npm run test:changed
  ```

To run all unit tests in the codebase non-interactively (without watch mode):
- On Windows PowerShell (to bypass script execution policies blocking `npm.ps1`):
  ```powershell
  npm.cmd run test -- --watch=false
  ```
- On other platforms/shells:
  ```bash
  npm run test -- --watch=false
  ```

## 5. Complete and Consistent State Resetting

When implementing functions that clear, reset, or delete primary state (e.g., `clearLeague`):
- **Clear All Auxiliary State**: Ensure all associated sub-states, logs (like transition logs), cached values, and database records are reset/cleared in tandem.
- **Update Test Mocks**: Ensure all test suites that mock the service or persistence layer (e.g., `persistenceSpy`) are updated to include mock implementations for the new clear methods to prevent compile-time or run-time test errors.

## 6. Persistence & Simulation Flow Invariants

- **Seasonal State**: Use `Player.seasonAttributes` and `Team.seasonSnapshots` for seasonal data. Compute age dynamically from birthday; never persist it.
- **Rollover Orchestration**: Season rollover must be manual (user-triggered) and route entirely through the single `GameService` orchestrator (covering year increment, schedule generation, and pruning oldest seasons under the 5000 saved-match cap).
- **Schema Discipline**: Bumping persistence contracts requires incrementing version in `package.json` and syncing `src/app/generated/data-schema-version.ts`.
- **Simulation Flow Sync**: If structurally editing `match.simulation.variant-b.service.ts` (e.g. action types, gates, tick loops), immediately update the Mermaid diagram in `public/design-docs/simulation-flow.html`.

## 7. Player OVR Calculation & Calibration

- **Config-Driven OVR**: Player OVR ratings (`calculateOverall`) are determined dynamically using `POSITION_OVR_CONFIG` in `src/app/models/player-progression.ts`.
- **Core Blend Factor**: OVR is calculated as $85\% \times \text{Core} + 15\% \times \text{Tertiary}$. The core weights inside the config must always sum to exactly 100 for each position.
- **UI Highlighting**: The player profile UI dynamically queries `POSITION_OVR_CONFIG` to highlight core attributes as "Key Stats".
- **Calibration Tooling**: If the simulation engine is calibrated or new stats are added, run the diagnostic test to re-calculate positional event rates per 90 minutes:
  ```powershell
  npx ng test --watch=false --include src/app/services/analyze-position-events.spec.ts
  ```

<!-- START SEMBLE INTEGRATION FOR SUB-AGENTS -->
## Code Search

Use `semble search` to find code by describing what it does or naming a symbol/identifier, instead of grep:

​```bash
semble search "authentication flow" ./my-project
semble search "save_pretrained" ./my-project
semble search "save model to disk" ./my-project --top-k 10
​```

Use `semble find-related` to discover code similar to a known location (pass `file_path` and `line` from a prior search result):

​```bash
semble find-related src/auth.py 42 ./my-project
​```

`path` defaults to the current directory when omitted; git URLs are accepted.

If `semble` is not on `$PATH`, use `uvx --from "semble[mcp]" semble` in its place.

## Workflow

1. Start with `semble search` to find relevant chunks.
2. Inspect full files only when the returned chunk is not enough context.
3. Optionally use `semble find-related` with a promising result's `file_path` and `line` to discover related implementations.
4. Use grep only when you need exhaustive literal matches or quick confirmation of an exact string.

<!-- END SEMBLE INTEGRATION FOR SUB-AGENTS -->