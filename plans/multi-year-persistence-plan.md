## Plan: Multi-Year Persistence Prep

Introduce explicit season-scoped history records where the current schema only stores a single live copy today, while keeping current-season access straightforward for the rest of the app. The recommended approach is to add season-keyed history collections for player attributes and team roster/stats, add seasonYear to matches, bump the persisted data schema, and use a deliberate destructive reset for pre-change saves instead of supporting migration from the old format.

**Current status (April 20, 2026)**
- Overall phase status: **Phases 1, 2, and 3 complete and stable.** Core model/persistence contracts are in place with season-scoped history records. Season rollover orchestration is fully implemented with explicit `startNewSeason()` path, player/team seeding, schedule generation, and week reset. Match retention enforcement (whole-season pruning to 5000-match cap) is active on rollover. Schema-mismatch enforcement blocks mutating writes at service layer. Test coverage validates all new behaviors.
- Validation status: build succeeds and tests are passing (`22` test files, `197` tests).

**Completed in implementation**
- Added and wired season-scoped contracts (`PlayerSeasonAttributes`, `TeamSeasonSnapshot`) across models and persistence boundaries.
- Added shared season-history selectors/helpers and migrated key reads/writes to them.
- Updated league flatten/assemble boundaries to persist and rehydrate season-scoped data.
- Updated generated league seeding so players/teams/matches include current season records (`seasonAttributes`, `seasonSnapshots`, `match.seasonYear`).
- Updated `GameService` current-season selectors and match result write paths to update season snapshots.
- Migrated remaining Phase 1 runtime call sites that were still relying on flat seasonal fields (standings/team details/statistics/simulation scoring paths).
- Bumped `dataSchemaVersion` to `C` and synchronized generated schema metadata.
- **Phase 2 complete:** Implemented explicit `startNewSeason()` orchestrator in `GameService` with year increment, player/team seeding, schedule generation, selected-week reset via `ScheduleStateService` effect, and single-path rollover pattern.
- **Phase 3 complete:** Implemented match-retention policy with `pruneScheduleBySeasonBuckets()` enforcing 5000-match cap, pruning oldest whole seasons first.
- **Schema-mismatch enforcement complete:** Added `isMutatingWritesBlockedBySchemaMismatch` computed property to `GameService`, guards ~12 mutation methods, prevents writes during mismatch; UI disabled bindings in place (standings, schedule, home pages).
- Created reusable `SeasonControlsComponent` mounted in Navigation (top of sidebar, separated by horizontal bar), with "Simulate Week" button visible during season and "Start New Season" button visible at season end. Buttons disabled during simulation, hidden on schema mismatch.
- Comprehensive test coverage: rollover seeding/schedule-gen/week-reset logic, whole-season retention pruning, season-change auto-reset behavior, mutation guards, schema-mismatch blocks, round-trip league assembly, and multi-season player/team history retrieval.

**In progress / remaining**
- **Optional Phase 4 enhancement:** Minimal team-history scaffold for end-to-end historical read path (e.g., "View Past Seasons" page with team snapshots). Currently out of scope but available as a follow-up if desired.
- Performance optimization and refinement based on live gameplay feedback.

**Immediate next actions**
The core multi-year persistence plan (Phases 1–3) is complete and stable. The following enhancements are now also complete:

**Phase 4 complete: Historical Views**
- Implemented "View Past Seasons" section in Team Details page with a third view mode toggle (Bio → Stats → Season History → Bio)
- Season history displays previous seasons with aggregated stats: matches played, wins/draws/losses, goals for/against, goal differential, squad size
- Implemented "Season History" section on Player Profile page showing past season stats
- Players can select any past season to view attributes, overall rating, and career stats from that season
- Season buttons are only shown for seasons before the current season year

**Locked target data shapes**
The first implementation pass should stop treating these as vague placeholders and lock the persisted contracts up front. The two new season-scoped records should be:

```ts
export interface PlayerSeasonAttributes {
	seasonYear: number;
	physical: PlayerPhysical;
	mental: PlayerMental;
	hidden: PlayerHidden;
	skills: PlayerSkills;
	overall: number;
}

export interface TeamSeasonSnapshot {
	seasonYear: number;
	playerIds: string[];
	stats: TeamStats;
}
```

Recommended root-shape changes once those records exist:

```ts
export interface Player {
	id: string;
	name: string;
	teamId: string;
	position: Position;
	role: Role;
	personal: PlayerPersonal;
	seasonAttributes: PlayerSeasonAttributes[];
	careerStats: PlayerCareerStats[];
}

export interface Team {
	id: string;
	name: string;
	players: Player[];
	selectedFormationId: string;
	formationAssignments: Record<string, string>;
	seasonSnapshots: TeamSeasonSnapshot[];
}

export interface Match {
	id: string;
	seasonYear: number;
	week: number;
	homeTeamId: string;
	awayTeamId: string;
	homeScore?: number;
	awayScore?: number;
	played: boolean;
	keyEvents?: MatchEvent[];
	matchStats?: MatchStatistics;
	matchReport?: MatchReport;
}
```

The intent is:
- Move `Player.physical`, `Player.mental`, `Player.hidden`, `Player.skills`, and `Player.overall` into `Player.seasonAttributes` so all player attributes that can vary by year live in one season-keyed record.
- Move `Team.playerIds` and `Team.stats` into `Team.seasonSnapshots` so roster order and standings are versioned by season instead of overwritten in place.
- Keep `Team.selectedFormationId` and `Team.formationAssignments` at the root. They do not become season-scoped in this pass.
- Keep `Player.personal`, identity fields, and current `teamId` at the root because this pass is not yet introducing transfers, contracts, or historical biography snapshots.

These records should follow a few explicit invariants so the persistence layer, selectors, and tests all target the same contract:
- `seasonAttributes` and `seasonSnapshots` are append-only season histories keyed by `seasonYear`, with at most one record per season.
- Histories should be stored in ascending `seasonYear` order to match the existing `careerStats` pattern and keep serialization deterministic.
- `TeamSeasonSnapshot.playerIds` remains the canonical roster order for that season and must still be normalized and deduplicated at persistence boundaries.
- `Player.teamId` continues to represent the current team only. Historical team membership remains sourced from `PlayerCareerStats.teamId` and the relevant `TeamSeasonSnapshot.playerIds` until transfers are designed.
- Current-season reads should not scan arbitrary raw history at call sites. `GameService` should expose selectors that resolve the current season record once and present it as the active player/team state.
- Missing current-season records should be treated as invalid persisted data in dev/test rather than silently falling back, because season history becomes the source of truth after the schema bump.

Recommended persistence contracts for Phase 1 should mirror those shapes directly rather than partially flattening them:

```ts
export interface PersistedPlayerRecord {
	id: string;
	name: string;
	teamId: string;
	position: Position;
	role: Role;
	personal: PlayerPersonal;
	seasonAttributes: PlayerSeasonAttributes[];
	careerStats: PlayerCareerStats[];
}

export interface PersistedTeamRecord {
	id: string;
	name: string;
	selectedFormationId: string;
	formationAssignments: Record<string, string>;
	seasonSnapshots: TeamSeasonSnapshot[];
}
```

That keeps the Dexie schema and league-assembly layer aligned with the long-term model instead of carrying transitional duplicates like both `stats` and `seasonSnapshots` or both `playerIds` and `seasonSnapshots[].playerIds`. In-memory assembly can still hydrate `Team.players` as a convenience for current callers, but persisted data should treat the season records as authoritative.

**Steps**
1. Phase 1: Define the target persisted model shapes in c:\Repos\soccer_sim_game\src\app\models\types.ts and align persistence contracts in c:\Repos\soccer_sim_game\src\app\services\app-db.service.ts plus c:\Repos\soccer_sim_game\src\app\services\league-assembly.service.ts. Use the locked `PlayerSeasonAttributes` and `TeamSeasonSnapshot` contracts above rather than introducing alternative naming or transitional duplicate fields.
2. Add season-scoped player attribute history. Replace the single live Player.physical, Player.mental, Player.hidden, and Player.skills persistence contract with season records such as PlayerSeasonAttributes keyed by seasonYear, while preserving a clear current-season accessor for callers that should not know about the full history structure.
3. Add season-scoped team history. Replace direct persistence of Team.playerIds and Team.stats with season records such as TeamSeasonSnapshot keyed by seasonYear so roster order and standings/history can coexist across years. Keep non-seasonal team identity fields such as id, name, formation selection, and formation assignments outside the season history unless later requirements show formation should also vary by season.
4. Add Match.seasonYear and update all schedule assembly, persistence, and retrieval paths so current-season views filter by both week and currentSeasonYear. This blocks historical matches from leaking into the active schedule and gives retention logic a reliable pruning key.
5. Phase 2: Introduce a season-advancement workflow in c:\Repos\soccer_sim_game\src\app\services\game.service.ts and related generator logic in c:\Repos\soccer_sim_game\src\app\services\generator.service.ts. This step depends on 1 through 4. Completing a season should not auto-advance; instead, provide an explicit user action to start the next season (for example, a dedicated "Start New Season" button; exact UI placement can be decided later). On that action, increment currentSeasonYear, generate a fresh schedule, seed a new player attribute-history entry for each player, seed a new TeamSeasonSnapshot for each team, reset current-week progression, and run retention pruning.
6. Add helper selectors in GameService for active-season access so existing callers can migrate incrementally: getCurrentSeasonPlayerAttributes, getTeamSnapshotForSeason, getMatchesForWeek filtered by currentSeasonYear, and equivalent current-season team-standings accessors. This can run in parallel with UI/service call-site updates once the model shape is settled.
7. Phase 3: Add match-retention policy in c:\Repos\soccer_sim_game\src\app\services\normalized-db.service.ts or the season-advance orchestration that calls it. Recommended cap: 5000 saved matches. Rationale: a 20-team double round-robin season is about 380 matches, so 5000 retains about 13 seasons of history while staying comfortably below typical IndexedDB pressure even when match payloads include events, statistics, and reports. Enforce pruning as part of the explicit "Start New Season" action, deleting the oldest seasonYear buckets first until the total is within cap.
8. Keep retention enforcement scoped to explicit season rollover in this pass. If later write paths (imports or bulk saves) can introduce enough data to exceed cap, evaluate extending retention to those entry points in a follow-up.
9. Phase 4: Update consumers that currently assume flat current-season data. Prioritize c:\Repos\soccer_sim_game\src\app\services\game.service.ts standings and team-stat updates, c:\Repos\soccer_sim_game\src\app\pages\schedule\schedule.ts current-week retrieval, c:\Repos\soccer_sim_game\src\app\pages\standings\standings.html team.stats usage, and c:\Repos\soccer_sim_game\src\app\pages\player-stats\player-stats.ts season selection. Historical views should read season snapshots rather than the live team object.
10. Make the schema-version reset path explicit. Bump package.json dataSchemaVersion, regenerate c:\Repos\soccer_sim_game\src\app\generated\data-schema-version.ts via the existing sync script, and update hydration/reset expectations in c:\Repos\soccer_sim_game\src\app\services\data-schema-version.service.ts plus persistence tests. Do not write a Dexie migration for legacy saves. Instead, treat any stored pre-change payload as incompatible and require the existing reset flow to clear persisted state before the new schema can be used.
11. Add reset-path UX and test coverage so the destructive migration is intentional and safe. Confirm the app blocks incompatible persisted data, surfaces the mismatch cleanly, and recovers after reset into a fresh league on the new schema.
12. Phase 5: Add tests for the new contracts. Cover league assembly round-trips, current-season filtering, multi-season player/team history retrieval, season advancement seeding, destructive-reset behavior on old schema versions, and pruning of oldest matches by seasonYear. Update specs that currently build flat Match, Team, and Player fixtures to include the new history structures where needed.
13. Document scope boundaries. This pass prepares persistence for multi-year simulation and historical views but does not need to implement player aging curves, attribute progression algorithms, transfers, or full historical UI navigation. Include one minimal team-history UI scaffold to validate end-to-end season-history read paths.

**Relevant files**
- c:\Repos\soccer_sim_game\src\app\models\types.ts — root Player, Team, Match, and League contracts that currently store single-season fields directly.
- c:\Repos\soccer_sim_game\src\app\models\player-career-stats.ts — existing season-keyed pattern to mirror for player attributes and team snapshots.
- c:\Repos\soccer_sim_game\src\app\services\app-db.service.ts — Dexie table definitions and persisted record aliases; likely needs a new version() schema declaration if indices change, but not a legacy data migration.
- c:\Repos\soccer_sim_game\src\app\services\league-assembly.service.ts — flatten and assemble boundaries where new season history fields should be normalized.
- c:\Repos\soccer_sim_game\src\app\services\normalized-db.service.ts — transactional save/load logic and the best central place for shared match-pruning helpers.
- c:\Repos\soccer_sim_game\src\app\services\persistence.service.ts — safe write entry points that must continue to route through schema-version gating.
- c:\Repos\soccer_sim_game\src\app\services\data-schema-version.service.ts — destructive reset behavior and persisted-schema mismatch handling.
- c:\Repos\soccer_sim_game\src\app\services\game.service.ts — current-season selectors, match-result application, standings, and future advanceSeason orchestration.
- c:\Repos\soccer_sim_game\src\app\services\generator.service.ts — current season seeding and future next-season schedule generation hooks.
- c:\Repos\soccer_sim_game\src\app\pages\schedule\schedule.ts — week view currently delegates to getMatchesForWeek and will need season-aware filtering.
- c:\Repos\soccer_sim_game\src\app\pages\standings\standings.html — renders Team.stats directly and will need current-season snapshot access.
- c:\Repos\soccer_sim_game\src\app\pages\player-stats\player-stats.ts — already supports season selection and is a good reference for adapting to new season-scoped structures.
- c:\Repos\soccer_sim_game\package.json — authoritative dataSchemaVersion source.

**Verification**
1. Add round-trip tests for league assembly and persistence so season history survives save/load intact on the new schema.
2. Add tests proving week views exclude prior-season matches when week numbers overlap.
3. Add season-advance tests proving a new season creates fresh player/team season records without mutating earlier ones.
4. Add retention tests proving the oldest seasonYear buckets are pruned first once the saved-match count exceeds 5000.
5. Add schema-version tests proving old persisted data is rejected, writes stay blocked during mismatch, and reset clears the incompatibility.
6. Run the schema-version sync/check workflow so generated version metadata stays aligned with package.json.

**Decisions**
- Include now: season-keyed persistence for player attributes, team roster history, team stats history, and matches.
- Include now: a concrete recommended match cap of 5000, enforced during explicit season rollover in this pass.
- Migration strategy: destructive reset behind a data-schema bump. No backward-compatible migration for existing persisted browser data is needed.
- Exclude for now: simulation logic for how attributes change year over year, transfer windows, contracts, and finances.
- Recommended non-seasonal fields: Team identity and formation configuration stay at the root initially; `selectedFormationId` and `formationAssignments` do not become season-scoped in this pass. Review formation history later only if tactical snapshots need exact historical reconstruction.

**Resolved implementation defaults (April 18, 2026)**
1. Current-season access: selectors-first. Do not reintroduce flat current-season fields on root models as migration crutches.
2. Missing current-season records: fail hard as incompatible persisted data, requiring reset rather than silent repair.
3. Season rollover timing: require an explicit user-driven season transition action (for example, a dedicated "Start New Season" control; exact UI location TBD). Seed next-season `PlayerSeasonAttributes` and `TeamSeasonSnapshot` when that action executes, not automatically at season close.
4. Team snapshot mutability: `TeamSeasonSnapshot.playerIds` is immutable within a season after creation.
5. Historical team membership integrity: require consistency between `PlayerCareerStats.teamId` and `TeamSeasonSnapshot.playerIds`; treat mismatch as data integrity failure in dev/test.
6. Retention prune unit: prune whole oldest seasons only; do not partially prune a season.
7. Retention trigger: enforce pruning on explicit season rollover only in this pass.
8. Schema-mismatch UX: allow read-only access with mutating writes blocked until reset resolves mismatch.
9. Aggregation policy: keep career/team totals computed plus cached in memory; only promote to persisted summaries after measured performance issues.
10. UI scope: include a minimal team-history scaffold in this pass to exercise season-history retrieval end to end.

**Acceptance criteria for resolved defaults**
1. Selectors-first access: no root-level flat replacements for seasonal fields are added to `Player` or `Team`; current-season reads in updated consumers flow through `GameService` season-aware selectors.
2. Missing current-season records fail hard: loading persisted data with a missing current `PlayerSeasonAttributes` or `TeamSeasonSnapshot` record enters schema-mismatch handling and blocks mutating writes until reset.
3. Explicit season transition action: finishing the final scheduled week does not auto-advance seasons; the season changes only when the explicit user action is invoked.
4. Lazy seeding on transition action: invoking the transition action creates exactly one next-season attributes record per player and one next-season snapshot per team.
5. Immutable snapshot rosters: once a `TeamSeasonSnapshot` is created for a season, in-season roster-order edits do not mutate that season snapshot.
6. Historical membership consistency checks: dev/test paths detect mismatches between `PlayerCareerStats.teamId` and `TeamSeasonSnapshot.playerIds` and fail with an integrity error.
7. Whole-season pruning: when total saved matches exceed cap, pruning removes complete oldest season buckets only; partial-season pruning is not performed.
8. Rollover-only pruning trigger: pruning runs during the explicit season transition action and is not invoked by unrelated write paths in this pass.
9. Schema mismatch read-only behavior: during schema mismatch, navigation to read views remains available while mutating persistence paths are blocked.
10. Aggregation policy: career and team totals are served from computed selectors (with cache/memoization as needed), with no new persisted totals table introduced in this pass.
11. Minimal history UI scaffold: at least one new lightweight team-history view/path exists and reads season-scoped data end to end.

**Architecture guardrails**
1. Single season-transition write path: all season rollover effects (year increment, next-season record seeding, schedule generation, and pruning) must execute through one orchestrator API in `GameService` to avoid partial-update drift.
2. Single seasonal read path: current-season and season-specific reads should be resolved by shared selectors/helpers rather than per-page ad hoc array scans.
3. Integrity checks at boundaries: normalize and validate season history invariants at persistence boundaries (`league-assembly` and normalized DB writes), not in each consumer.
4. Dev/test strictness for data integrity: invariant violations should fail loudly in dev/test; production may route to schema-mismatch handling but should avoid silent auto-repair.
5. No duplicated authoritative aggregates: computed summaries may be cached in memory, but persisted aggregates are deferred unless explicitly promoted after measured performance evidence.
6. Season-history mutation policy: once a season snapshot is finalized for historical use, do not mutate prior seasons in place except through explicit maintenance tooling.
7. Migration discipline: every persistence-contract change requires schema-version bump review, generated version sync, and tests for outdated payload handling.
8. Lightweight observability: on season transition, log enough metadata in dev/test (seasonYear, match-count before/after prune, seeded records) to verify behavior and speed up debugging.

**Further Considerations**
1. Formation history is explicitly deferred. This pass keeps `selectedFormationId` and `formationAssignments` on the root `Team` model, and historical season snapshots will not attempt to reconstruct exact past tactical layouts. Revisit this only if a later feature requires season-accurate lineup replay or historical formation views.
2. Match ordering needs one explicit rule during implementation: no code may treat `week` as globally unique once multi-season persistence exists. For this pass, `seasonYear + week` is the required schedule identity for reads and filtering. Add `playedAt` or `createdAt` only if a concrete reporting or chronology requirement appears that `seasonYear + week + id` cannot satisfy.
3. Match reports and derived season analysis stay non-authoritative in persistence for now. The source of truth remains the match record plus season snapshots, and any summaries can be recomputed from that data. Revisit persisted report summaries only if regeneration becomes materially expensive or historical reporting screens need indexed query performance.