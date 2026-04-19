# Repository Copilot Instructions

Use these rules for all changes in this repository unless a more specific instruction file applies.

## Multi-Year Persistence Standards

1. Treat season history as authoritative persistence state.
- Do not add or reintroduce flat root-level fallback fields for seasonal player or team data.
- Seasonal player attributes belong in `Player.seasonAttributes`.
- Seasonal team roster/stats belong in `Team.seasonSnapshots`.

2. Use shared season-aware selectors for reads.
- Current-season and season-specific reads must route through shared service selectors/helpers.
- Avoid ad hoc per-page season-history scans.

3. Season advancement is explicit.
- Completing a season must not auto-advance.
- Season rollover must occur only through an explicit user-triggered action (for example, a "Start New Season" control).

4. Rollover orchestrator is single-path.
- All rollover side effects must run through one orchestrator path in `GameService`:
  year increment, next-season seeding, schedule generation, week reset, and pruning.

5. Schema mismatch and integrity behavior.
- Missing current-season records are incompatible persisted data.
- During schema mismatch, mutating writes remain blocked until reset.
- Dev/test should fail loudly on invariant mismatches.

6. Aggregation policy.
- Career/team totals should be computed from source records and cached in memory as needed.
- Do not add persisted aggregate totals unless promoted by measured performance evidence.

7. Persistence-contract changes require schema discipline.
- When stored payload contracts change, review and bump `dataSchemaVersion`.
- Keep `src/app/generated/data-schema-version.ts` synchronized with `package.json`.
- Add tests for outdated payload handling and reset behavior for each schema bump.