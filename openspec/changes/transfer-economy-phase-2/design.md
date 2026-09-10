## Context

See `proposal.md` and `specs/` for motivation and functional requirements.

Currently, the season schedule generates 38 match weeks for a 20-team league. `GameService` and `TransferService` handle transfer window phases (`getTransferWindowPhase(week)`), and `GeneratorService` builds round-robin fixture schedules. Phase 2 extends this pattern by introducing an explicit `PlayerStatus` enum (`'contracted' | 'free_agent' | 'world' | 'retired'`) and expanding the season calendar to 52 weeks.

## Goals / Non-Goals

**Goals:**
* Implement a 52-week calendar system where 38 match weeks contain round-robin fixtures and 14 management weeks contain no fixtures (`currentWeekMatches` is empty).
* Implement tiered pricing (`calculateAskingPrice`) and World Market buyout generation at 75%–85% Market Value for players listed >= 2 weeks.
* Support explicit `player.status` (`PlayerStatus`) where `teamId` strictly holds an active domestic club UUID when `status === 'contracted'` (and `''` otherwise).
* Integrate World Market contracts, Free Agent re-entry, and scoped retirement sweeps in `GameService` during Week 51 Season Rollover.
* Sync schema version (`data-schema-version.ts` and `package.json`).

**Non-Goals:**
* Implementing playable foreign leagues or match simulation for `world` teams.
* Creating dynamic fixture scheduling logic (the 38 fixture matches are distributed deterministically across weeks 7–25 and 30–48).

## Decisions

### Decision 1: Schedule Generation vs Week Ticking
* **Approach**: `GeneratorService.generateSchedule()` assigns fixture matches specifically to weeks 7–25 (round 1, 19 weeks) and weeks 30–48 (round 2, 19 weeks). Weeks 1–6, 26–29, 49–50, and 52 have zero matches.
* **Rationale**: `advanceWeek()` already handles empty match weeks smoothly by running financial calculations, CPU transfer passes, and World Market ticks without invoking match simulation.
* **Alternatives Considered**: Creating a complex `SeasonPhase` state machine. Rejected because schedule fixture mapping is zero-cost and leverages existing `currentWeekMatches` signals natively.

### Decision 2: Explicit PlayerStatus Enum (`status: PlayerStatus`)
* **Approach**: Add `status: PlayerStatus` (`'contracted' | 'free_agent' | 'world' | 'retired'`) to the `Player` model interface. Keep `teamId` as a valid domestic club UUID when `status === 'contracted'`, and `''` when `status` is `'free_agent'`, `'world'`, or `'retired'`.
* **Rationale**: Avoids magic string overloading on `teamId`. Historical team attribution continues to be derived cleanly from existing `player.careerStats` and `player.transferHistory`.
* **Alternatives Considered**: Overloading `teamId` with string literals like `'free_agents'`, `'world'`, `'retired'`. Rejected because `PlayerStatus` provides type safety and avoids magic string bugs.

### Decision 3: World Market Buyout Roll & Pricing
* **Approach**: During `runCpuToCpuTransferPass()`, check `transferListings`. For listed players where `weeksListed >= 2`, roll a 25% weekly probability for a World Market bid at $0.80 \times \text{marketValue}$.
* **Rationale**: Gives domestic CPU teams and human users 1–2 weeks priority at 100% Market Value before foreign buyers step in at a discount.

### Decision 4: Scoped Rollover Orchestration & Retirement Replacements (Week 51)
* **Approach**: Extend `startNewSeason()` / Week 51 rollover logic in `GameService`:
  1. Decrement `yearsRemaining` for all `player.status === 'world'` records.
  2. Transition `world` players with 0 years remaining to `player.status = 'free_agent'`.
  3. Transition `world` or `free_agent` players to `player.status = 'retired'` where `age >= 35` or `overall < 60`.
  4. Generate youth prospect replacements **ONLY for contracted domestic club retirees** (`status === 'contracted'`). Do NOT generate youth replacements for players retiring from `'free_agent'` or `'world'`.
* **Rationale**: Keeps domestic club rosters balanced between 18 and 30 players while preventing the Free Agent and World pools from accumulating unassigned youth prospects.

## Risks / Trade-offs

* **[Risk: DB Inflation over 50+ Seasons]** → **Mitigation**: Strict retirement sweep at age 35 or OVR < 60 during Week 51 rollover ensures the `world` and `free_agents` pools stay capped (< 100 players total).
* **[Risk: UI Filters Exposing World / Retired Players]** → **Mitigation**: Update `TransferMarketComponent` and `PlayerAttributesComponent` filters so `status === 'world'` or `status === 'retired'` players are excluded from standard squad lists and transfer market search.

## Migration Plan

1. Increment `version` in `package.json` and sync `src/app/generated/data-schema-version.ts`.
2. Update `TransferService` window bounds for 52-week calendar.
3. Update `GeneratorService` fixture week assignments (W7–W25, W30–W48).
4. Update `GameService` for `PlayerStatus` management, World Market buyout evaluation, and Week 51 rollover transitions.
