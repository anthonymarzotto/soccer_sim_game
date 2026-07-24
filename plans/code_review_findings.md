# Code Review Findings — July 2026

Review scope covers changes in recent commits up to `afa3e15` (season summary dashboard, player rating updates, and player OVR calibration).

---

## 🔴 High Severity

### 1. ~~Stale Score State in Clutch Context Causes Wrong Clutch Bonus~~ [FIXED]
* **Location:** [statistics.service.ts L507–531](file:///C:/Repos/soccer_sim_game/src/app/services/statistics.service.ts#L507-L531) (`calculateClutchAndDefenseInfo`)
* **Why it matters:** The outer `for` loop tracks `ourScore`/`oppScore` cumulatively as goals are processed. When a `GOAL` event is reached and `isActor` is true, the code derives `ourScoreBefore = ourScore - 1`. However, `ourScore` is only incremented **inside the same `if (e.type === EventType.GOAL)` block** — before the clutch-bonus block runs. This works correctly for goals but the clutch-bonus check for **saves** (L537) uses `ourScore`/`oppScore` post-increment. That means if the player scores a goal and later in the same event iteration a save check fires, `ourScore` already reflects the scored goal. The result is clutch bonuses calculated against incorrect running totals for events that appear close together in the event stream. More critically, if the match has already produced `ourScore > oppScore + 1` by the time an early goal event is processed, a goal in a garbage-time situation could still match `ourScoreBefore === oppScoreBefore`, producing an undeserved clutch bonus.
* **Suggested direction:** Decouple the running-score tracking from the clutch-bonus evaluation. Make a first pass to build a `scoreAtTime: Map<number, {home, away}>` lookup, then use that to read context for each event.
* **Status:** Resolved by shifting score increments to the end of the event loop iteration and evaluating clutch criteria using the pre-event score directly. Added unit test verification.

### 2. ~~`computeRatingBreakdown` Duplicates Weights/Group Logic Diverged from `calculatePlayerRating`~~ [FIXED]
* **Location:** [statistics.service.ts L687–750](file:///C:/Repos/soccer_sim_game/src/app/services/statistics.service.ts#L687-L750) vs. [L571–685](file:///C:/Repos/soccer_sim_game/src/app/services/statistics.service.ts#L571-L685)
* **Why it matters:** Both `calculatePlayerRating` and `computeRatingBreakdown` contain identical inline `if/else` chains to derive `weights` and `group`. They are **separate copies** — any future calibration change to one requires a matching change to the other. There is no enforcement of this invariant. The breakdown shown in the UI will silently drift from the actual rating calculation. Given this codebase actively tunes weights, this is a maintenance time-bomb that will produce misleading "rating breakdown" UI.
* **Suggested direction:** Extract the weight/group lookup into a single private helper (or a static constant keyed by `Position`) and call it from both methods.
* **Status:** Resolved by extracting private helper method `getRatingWeightsAndGroup(pos: Position)` in `StatisticsService` and using it in both methods.

---

## 🟡 Medium Severity

### 3. ~~`calculatePlayerRating` Uses `stats.minutesPlayed / 90` as Time Ratio, but Base is 60~~ [REJECTED]
* **Location:** [statistics.service.ts L597–600](file:///C:/Repos/soccer_sim_game/src/app/services/statistics.service.ts#L597-L600)
* **Why it matters:** A player who plays 45 minutes produces `timeRatio = 0.5`. For a GK with `EXPECTED_RATES.GK.saves = 4.3`, `expected(4.3) = 2.15`. If the GK makes 2 saves (meeting expectation at half-time), the save contribution is `3.0 * (2 - 2.15) = -0.45`, so the GK is **penalised for meeting positional expectation at half-time**, since the model assumes they played 90 minutes worth of events. The base was raised from 50 to 60, but the expected-rate scaling was not recalibrated for common sub-90 playing times. A 45-min sub who does nothing gets 60, but a 45-min GK who makes 2 saves gets ~59.5. The test at [statistics.service.spec.ts L207](file:///C:/Repos/soccer_sim_game/src/app/services/statistics.service.spec.ts#L207) confirms a bench player gets 60, but there's no test for a sub-entered GK performing at expectation.
* **Suggested direction:** Consider whether the base should remain at 60 for zero-minute players (squad list filler), or whether the expected rate normalisation should key off `minutesPlayed` more carefully for starters. An alternative: only apply the expected-rate penalty if `minutesPlayed > threshold` (e.g., 30 min).
* **Status:** Rejected / Invalid. 60 is the baseline rating score (representing a 6.0/10 average performance) while 90 represents regulation match duration in minutes. Scaling expected per-90 benchmark stats by `minutesPlayed / 90` is standard football analytics rate normalization.

### 4. `RECOVERY` Pass-Failure Mode Silently Counted as a Turnover in Rating
* **Location:** [statistics.service.ts L499](file:///C:/Repos/soccer_sim_game/src/app/services/statistics.service.ts#L499) and [match.simulation.variant-b.service.ts L1602](file:///C:/Repos/soccer_sim_game/src/app/services/match.simulation.variant-b.service.ts#L1602)
* **Why it matters:** `RECOVERY` was introduced in the sim to represent a **recovered/partially-saved** pass — semantically, possession was retained. Despite this, the stats service counts both `RECOVERY` **and** `OVERHIT` as `passingTurnovers++`. A player who benefits from a "recovery" (possession not lost) still gets penalised in their rating as though they lost the ball. This is internally inconsistent with the design intent of the new mode, and will systematically deflate ratings for players who attempt long passes in recoverable situations.
* **Suggested direction:** Either exclude `RECOVERY` from `passingTurnovers` entirely, or model it as a reduced penalty (e.g., `passingTurnovers += 0.5`), consistent with the intent that a recovery is not a full turnover.

### 5. `biggestWinsLosses` (`teamId === 'all'`) Silently Suppresses Losses
* **Location:** [season-summary.ts L257](file:///C:/Repos/soccer_sim_game/src/app/pages/season-summary/season-summary.ts#L257)
* **Why it matters:** When `teamId === 'all'`, the comment acknowledges losses are skipped and returns `losses: []`. But the UI presumably renders a "biggest losses" section — it will silently be empty, with no indication to the user that data was suppressed. The comment says "or we can just show them" but didn't, making this a latent display bug if the template ever shows the losses list for `all`.
* **Suggested direction:** Either populate losses symmetrically for the `all` case (using each match's losing side), or conditionally hide the losses panel in the template when `teamId === 'all'`. The current half-way implementation risks a silent empty state.

### 6. `streaks` in `all` Mode Iterates All Teams × All Matches for Each Team (O(T×M))
* **Location:** [season-summary.ts L295–310](file:///C:/Repos/soccer_sim_game/src/app/pages/season-summary/season-summary.ts#L295-L310)
* **Why it matters:** `streaks` in the `all` path calls `matches.filter(m => m.homeTeamId === team.id || ...)` inside a `for (const team of league.teams)` loop. `matches` here is already filtered by season but is otherwise unsorted per team. For N teams and M matches: O(N×M) scans per recompute. With 20 teams and 380 matches this is fine for now, but `calculated()` memoisation will not help if `league()` is reactive and changes frequently. The more immediately actionable issue: the `tMatches` fed to `calculateStreaksForMatches` in the `teamId !== 'all'` branch is **not filtered to the team** — it passes all matches for the season regardless of team (L303), relying on `calculateStreaksForMatches` to use `isHome/isLoss` correctly, which it does. But a match between two other teams where neither is `teamId` will still be iterated and produce `isWin=false, isDraw=false, isLoss=false` silently, not incrementing any counter. This is harmless but wasteful and fragile.
* **Suggested direction:** In the single-team branch, pre-filter `tMatches` to `m.homeTeamId === teamId || m.awayTeamId === teamId` before passing to `calculateStreaksForMatches`.

### 7. OVR Tertiary Stat Pool Includes GK-Only Stats for GK Position, but Excludes Them for Outfield
* **Location:** [player-progression.ts L176–185](file:///C:/Repos/soccer_sim_game/src/app/models/player-progression.ts#L176-L185)
* **Why it matters:** The pool filter excludes `goalkeeping` type stats for non-GK positions. However for a GK, `isGk = true` and the filter becomes `!def.hidden && def.type !== 'misc'` — GK-specific stats are included in the pool. The `tertiaryKeys` for GK then includes all outfield stats (`speed`, `shooting`, etc.) that a GK legitimately has values for, but those being averaged into "tertiary" for a GK may produce unexpected OVR compression. The `POSITION_OVR_CONFIG[GK].core` only lists `handling` and `reflexes`; `commandOfArea` (which was previously double-weighted) is now a tertiary, meaning a GK with poor `commandOfArea` but good handling/reflexes will see a small OVR drag. This may be intentional, but there's no test covering a GK with an extreme `commandOfArea` spread to validate the expected OVR range hasn't changed. The old formula gave GK OVR from 15 stats; the new formula's tertiary pool for GK may include a different count.
* **Suggested direction:** Add a test fixture asserting GK OVR for known attribute values before/after the change, to validate the calibration hasn't drifted unexpectedly.

---

## 🔍 Testing Gaps

- No test for the rating of a sub who enters and then has meaningful events (only zero-minute sub is tested).
- No test asserting `RECOVERY` pass failures do **not** count as full turnovers.
- No test for `calculateStreaksForMatches` with a team-id that matches neither home nor away (the filtering gap above).
- No regression test for GK OVR values post-formula change.
