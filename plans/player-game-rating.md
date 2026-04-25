# Player Game Rating Plan

## Scope

This plan covers five related changes:

1. Expand the `calculatePlayerRating` formula to reflect all meaningful event types.
2. Persist a per-player, per-season average match rating and star nomination counts in `PlayerCareerStats`.
3. Surface "Stars of the Game" on the Match Summary.
4. Live per-player rating in Watch Mode roster cards, with current top-3 highlighted.
5. Surface rating and star data on the Player Profile, Player Stats, and Team Details pages.

Items are ordered so each step builds cleanly on the previous one.

---

## Implementation Order

### ~~Step 1 — Fix and expand the rating formula (`statistics.service.ts`)~~ ✅ DONE

**Completed.** Changes landed in `statistics.service.ts`, `post.match.analysis.service.ts`, `match.simulation.ab.spec.ts`, and the new `statistics.service.spec.ts` (13 tests, all passing).

Key changes delivered:
- Fixed base of `50` replaces the overall-ability anchor; `getCurrentPlayerSeasonAttributes` call and `seasonYear` parameter removed entirely.
- `minutesPlayed` now derived per-player via new private helper `calculateMinutesPlayed` using `SUBSTITUTION` and `RED_CARD` events. Bench players who never entered get `0` and a `rating` of `0`.
- New event coverage added: `SAVE` (+4, GK only), `INTERCEPTION` (+2), shot on target (+1), `CORNER` (+0.5), `FREE_KICK` (+0.5), `PENALTY` (+3), `MISS` (−1).
- `generatePlayerStatistics` no longer takes a `seasonYear` parameter.

---

### Step 1 — Fix and expand the rating formula (`statistics.service.ts`)

#### Three existing bugs to fix first

**Bug 1: The formula anchors on the player's overall ability, not on match performance.**

`calculatePlayerRating` starts from `seasonAttrs.overall.value`. This means an 80-overall player who has a completely quiet game returns a rating of `80 → 8.0`, outranking a 50-overall player who scores and assists regardless of events. A bench player who never enters also silently receives their full overall.

Fix: **replace the overall anchor with a fixed base of `50` for every player who takes the field.** Ratings become purely event-driven — a 50-overall forward who scores a hat-trick will legitimately outscore an 80-overall midfielder who barely touches the ball. The `seasonAttrs.overall` read in the formula is removed entirely. Players who never take the field are excluded from the rated list before ranking so bench players who never entered cannot appear. In Watch Mode, starters are considered rateable immediately at kickoff and should display `5.0` at minute 0; bench/reserve players show `--` until they enter the match.

**Bug 2: `minutesPlayed` is wrong for every player.**

In `generatePlayerStatistics`, `minutesPlayed` is hard-coded to `matchState.currentMinute` (typically 90) for every player regardless of when they were subbed on or off, or whether they played at all. A player dismissed at minute 30 and a substitute who entered at minute 80 both show 90 minutes.

Fix: derive actual minutes played per player from the event log. `SUBSTITUTION` events encode `playerIds[0]` (player going off) and `playerIds[1]` (player coming on) at `event.time`. The derivation for each player in a team is:

- **Starters who were never substituted:** `matchState.currentMinute` (played full match).
- **Starters who were substituted out:** the `time` of the `SUBSTITUTION` event where `playerIds[0] === player.id`.
- **Substitutes who came on:** `matchState.currentMinute − subOnMinute`, where `subOnMinute` is the `time` of the `SUBSTITUTION` event where `playerIds[1] === player.id`.
- **Bench/reserve players who never entered:** `0`.
- **Dismissed players (red card):** the minute of their `RED_CARD` event.

Extract a private helper `calculateMinutesPlayed(playerId, allEvents, matchCurrentMinute): number` in `StatisticsService` so this logic is testable.

**Bug 3: Deltas are not scaled to minutes played.**

With the fixed-base approach from Bug 1, this is significantly less of a problem — a substitute who played 10 minutes and scored starts at the same `50` as a full-match starter, so their final rating reflects only their actual contributions. A goal in 10 minutes should legitimately produce a high rating. However, volume-dependent stats (passes, tackles) still slightly favour players with more minutes. This is tracked as a deferred calibration item; Bugs 1 and 2 eliminate the egregious cases.

---

#### New event coverage

The current formula only handles goals, assists, successful passes, successful tackles, fouls, yellow cards, and red cards. Every other event type is ignored.

**Proposed additions**

| Event type | Contribution | Notes |
|---|---|---|
| `SAVE` | Large positive (GK only) | Currently zero; biggest omission for GKs |
| `INTERCEPTION` | Moderate positive | Tracked in career stats but not in rating |
| `SHOT` (on target, no goal) | Small positive | Rewards attacking output |
| `MISS` | Small negative | Penalises wasteful finishing; `SHOT` on-target bonus offsets for good attempts |
| `CARRY` (successful dispossession of opponent) | Small positive | TACKLE event is emitted when a carry is stopped; counter-side player earned that tackle |
| `CORNER` (winning a corner) | Small positive | Represents attacking pressure |
| `FREE_KICK` (winning one) | Small positive | Same reasoning |
| `PENALTY` (winning / scoring) | Positive | Large if scored, moderate if won |
| `INJURY` | No rating impact | Out-of-control event |
| `SUBSTITUTION` | No rating impact at event level | Minutes played is now derived from sub events, not this delta |

#### Deferred: contextual event weighting

A goal scored in the 92nd minute to win 1-0 is objectively more impactful than the 5th goal of a 5-0 rout. Similarly, a save to hold a 1-0 lead in the 88th minute is worth more than a routine save when the score is 4-0. The current flat-weight model treats both identically.

This is architecturally feasible: every `PlayByPlayEvent` has a `time` field, and the scoreline at the moment of any event can be reconstructed by counting `GOAL` events with `time <= event.time` from the static event array (already available in `calculatePlayerRating`). A context multiplier could be applied per event:

- **Time weight:** 1.0× for minutes 1–74, rising to ~1.3× for minutes 75–95.
- **Game-state weight:** based on score differential at the moment of the event — tied or one-goal game scores higher than a lopsided scoreline. For example: tied (1.3×), ±1 goal (1.1×), ±2 goals (0.9×), ±3+ goals (0.7×).
- **Combined multiplier:** `delta × timeWeight × gameStateWeight`.

This is **deferred** — the weighting constants require calibration and the feature is independent of the rest of this plan. It should be implemented as a follow-up once the base formula is live and observable.

---

### ~~Step 2 — Persist per-season average match rating and star nominations (`types.ts`, `game.service.ts`, schema)~~ ✅ DONE

**Completed.** Changes landed in `types.ts`, `player-career-stats.ts`, `game.service.ts`, `package.json`, `generated/data-schema-version.ts`, and the new `match-stars.ts` (191 tests, all passing).

Key changes delivered:
- `PlayerCareerStats` extended with `totalMatchRating: number` and `starNominations: { first, second, third }`.
- `createEmptyPlayerCareerStats` factory initializes both new fields to zero.
- `dataSchemaVersion` bumped `E` → `F`; `sync-data-schema-version` regenerated the generated file.
- New pure helper `rankThreeStars` in `match-stars.ts` — shared by persistence, Match Summary, and Watch Mode. Full tie-break chain: rating → winning team → goals → saves → assists → fewer cards → playerId.
- `updatePlayerCareerStats` in `game.service.ts` now takes `matchState` directly; after clean-sheets, calls `generatePlayerStatistics` for both teams, accumulates `totalMatchRating`, calls `rankThreeStars`, and increments the correct `starNominations` field.
- `getAggregatedCareerStats` initializes and sums the two new fields across seasons.

---

### Step 2 — Persist per-season average match rating and star nominations (`types.ts`, `game.service.ts`, schema)

Add the following two fields to `PlayerCareerStats`:

```ts
totalMatchRating: number;      // running sum of per-match ratings; average = totalMatchRating / matchesPlayed
starNominations: { first: number; second: number; third: number };
```

Accumulating in `PlayerCareerStats` is the correct approach here because match records are subject to retention pruning (oldest-season buckets are deleted on season rollover). Any approach that scans match records would silently lose historical star data once those matches are pruned. Storing running totals alongside every other season stat (goals, assists, saves) keeps reads O(1) and historical seasons fully intact.

#### Schema bump

Adding fields to `PlayerCareerStats` is a persistence contract change. Required work:
- Add `totalMatchRating: number` and `starNominations: { first: number; second: number; third: number }` to `PlayerCareerStats` in `types.ts`.
- Review `createEmptyPlayerCareerStats` factory to initialize new fields to zero.
- Bump `dataSchemaVersion` in `package.json`.
- Run `sync-data-schema-version` to regenerate `src/app/generated/data-schema-version.ts`.
- Do **not** add migrations or silent backfills for old persisted leagues/players. After the schema bump, old persisted data is treated as incompatible, should fail loudly, and the league must be regenerated/reset.
- Add tests that outdated persisted payloads trigger the schema-mismatch/reset-required path instead of silently defaulting missing fields to zero.

#### Accumulation logic

In `game.service.ts` `updatePlayerCareerStats`, after computing each player's per-match `PlayerStatistics`:

1. Add the match rating to `stats.totalMatchRating`.
2. Determine the top-3 players across both teams combined using **one shared pure helper** that is reused by persistence, Match Summary, and Watch Mode so star ranking is consistent everywhere.
3. Tie-break order for the shared helper: higher rating, then players on the winning team, then goals, then saves, then assists, then fewer cards, then stable `playerId` ordering.
4. Increment `stats.starNominations.first`, `.second`, or `.third` for the relevant players.

The shared ranking helper should accept the home and away player-stat arrays plus the match winner/team result context, and return the ranked cross-team top 3.

---

### ~~Step 3 — Surface "Stars of the Game" on the Match Summary (`match-summary.html`, `match-summary.ts`)~~ ✅ DONE

**Completed.** Changes landed in `types.ts`, `post.match.analysis.service.ts`, `match-summary.ts`, `match-summary.html`, and `match-summary.spec.ts` (194 tests, all passing).

Key changes delivered:
- Canonical `MatchReport` in `types.ts` extended with `matchStats`, `homePlayerStats`, and `awayPlayerStats` — now matches what `PostMatchAnalysisService` produces.
- Duplicate local `MatchReport` interface removed from `post.match.analysis.service.ts`; it now imports from `types.ts`.
- `matchStars` computed signal added to `MatchSummaryComponent` — derives winning team from scores, calls shared `rankThreeStars` helper.
- `formatRating` helper added (internal 1–100 ÷ 10, one decimal place).
- Stars of the Game section added to `match-summary.html` after Match Statistics; visible when `showStats() && matchStars().length > 0`. Each card shows medal emoji, team badge, player name (linked to profile), 1–10 rating, and non-zero key stats (goals, assists, saves).

---

### Step 3 — Surface "Stars of the Game" on the Match Summary (`match-summary.html`, `match-summary.ts`)

The `MatchReport` (on the `Match` record) already contains `playerPerformances.homeTeam.mvp`, `topPerformers`, and `playerPerformances.awayTeam.*`. The component does not currently render any of this.

**Design**

Render a "Stars of the Game" section after the Match Statistics block, visible when `showStats()` is true. The top 3 players are determined **cross-team** by calling the shared ranking helper from Step 2. The best player in the match wins first star regardless of which team they played for.

Each of the three cards shows:
- Star rank badge (🥇 / 🥈 / 🥉)
- Player name (linked to player profile)
- Team badge
- Rating displayed on a **1–10 scale** (one decimal place, e.g. `8.4`)
- Key stat highlights (goals, assists, saves as applicable)

**Data source:** The `MatchReport` already carries `homePlayerStats` and `awayPlayerStats` full arrays (from `post.match.analysis.service.ts`). Feed those arrays into the shared ranking helper rather than duplicating merge/sort logic in the component.

> **Note:** The `types.ts` `MatchReport` interface is leaner than the service-local one. The `homePlayerStats` / `awayPlayerStats` arrays will need to be added to the canonical `types.ts` interface (or the match-summary component can access them via the service-local type). This alignment should be resolved as part of this step.

---

~~### Step 4 — Watch Mode live rating display (`watch-game.ts`, `watch-game.html`)~~ ✅ DONE

**Delivered:**
- Injected `StatisticsService` into `WatchGameComponent`. Added `liveHomePlayerStats` and `liveAwayPlayerStats` signals (reset on each new simulation start).
- Added `liveStars = computed(...)` — calls `rankThreeStars` with live stats and current score context.
- Added `private recomputeLivePlayerStats(upToMinute)` — filters matchState events `<= upToMinute`, calls `generatePlayerStatistics` for both teams, updates signals. Called at kickoff (minute 0) after match result arrives, and on every `addNextCommentary` tick.
- Added `getLiveRating(playerId, side): string` — returns `"--"` for unplayed/bench, formatted 1–10 scale otherwise.
- Added `getLiveStarRank(playerId): 1|2|3|null`.
- On-field lineup rows in both HOME and AWAY panels now show a rating pill (amber text) and optional medal emoji (🥇/🥈/🥉).
- `watch-game.spec.ts` updated with `StatisticsService` mock.

### Step 4 — Watch Mode live rating display (`watch-game.ts`, `watch-game.html`)

**How it works today**

Watch mode pre-simulates the full match, then replays events in UI time via a commentary timer. The `matchState` (all events) is stored in a signal at the start and never changes.

**Live rating approach**

On **every commentary item processed** (the most responsive option), recompute home and away player stats separately by calling `StatisticsService.generatePlayerStatistics` with the full event array filtered to `event.time <= currentMinute`. Because the match is pre-simulated and the event array is static, this is a pure O(n_events) re-scan — no simulation work. At 90 minutes with ~200–300 events total, this is fast enough to run synchronously on every tick.

Add signals:
```ts
liveHomePlayerStats = signal<PlayerStatistics[]>([]);
liveAwayPlayerStats = signal<PlayerStatistics[]>([]);
```

And a derived signal for the current top-3 (cross-team, using the same shared helper as persistence and Match Summary):
```ts
liveStars = computed(() => rankThreeStars(liveHomePlayerStats(), liveAwayPlayerStats(), currentResultContext));
```

Ratings in Watch Mode are displayed on the **1–10 scale** (divide internal 1–100 value by 10, one decimal place).

**Display location**

In the left/right roster panel, add a small rating pill (e.g. `8.4`) next to each player name in the on-field lineup, alongside the existing fatigue bar. Starters should show `5.0` immediately at kickoff because they are already on the field; players who do not yet have a rating (typically bench/reserve players before entering) should show `--` until a rating becomes available.

Highlight the current top-3 cross-team players with a rank badge (🥇/🥈/🥉) on their roster card regardless of which team panel they appear in.

---

~~### Step 5 — Player Profile and Player Stats page (`player-profile.ts/html`, `player-stats.ts/html`), Team Details page (`team-details.ts/html`)~~ ✅ DONE

**Delivered:**
- **Player Profile** — added "Ratings" tab button to the Career Stats card tab bar; header columns (`Avg Rating / 🥇 / 🥈 / 🥉`), per-season data rows, and total row (stars summed via `totalStarNominations` computed, avg shows `--`). Added `currentSeasonRatingChip` computed (avg rating + three star counts). Added `totalStarNominations` computed. Extended `seasonStatsView` signal type to include `'ratings'`. Added header chip with `avgRating` + medal counts beside the overall OVR badge.
- **Player Stats** — extended `SortColumn` type with `'averageRating' | 'starsFirst' | 'starsSecond' | 'starsThird'`. Added sort handling and `getColumnValue` branches for all four. Added four columns to the `columns` array. Added four `<td>` cells per row to the HTML.
- **Team Details** — widened `TeamDetailsRowStats` Pick to include `totalMatchRating` and `starNominations`. Updated both zero-value fallbacks (`getRowStats`, `getCurrentSeasonStats`). Added `formatAvgRating(stats)` helper. Added `Rating` column header (Bio mode only). Added rating cell + conditional star badges (non-zero only) after OVR for starters, bench, and reserves rows.

### Step 5 — Player Profile and Player Stats page (`player-profile.ts/html`, `player-stats.ts/html`), Team Details page (`team-details.ts/html`)

#### Player Profile

**New "Ratings" tab in the Career Stats card**

Add a "Ratings" tab alongside the existing Offensive / Defensive / Discipline tabs inside the Career Stats card. No new component is needed — the same season-rows table is reused; the tab switch simply changes which columns are rendered. Each row represents one season with the following columns:

| Column | Source | Notes |
|---|---|---|
| Season | year | |
| Avg Rating | `totalMatchRating / matchesPlayed` | 1–10 scale, e.g. `7.4`; `--` if no rated matches |
| 🥇 | `starNominations.first` | Always shown, even if 0 |
| 🥈 | `starNominations.second` | Always shown, even if 0 |
| 🥉 | `starNominations.third` | Always shown, even if 0 |

Star columns always show the count regardless of whether it is zero — this is a dedicated ratings tab, so zero values are expected and informative. Do not suppress zeros here.

**Season rating chip (header area)**

Beside the player's overall rating displayed at the top-right of the player profile page, add a small chip showing:
- Current season average rating (e.g. `7.4`; `--` if no rated matches yet this season)
- Current season star counts: 🥇 N  🥈 N  🥉 N

The chip is always rendered, even when the current season has no rated matches. It reads from the player's current-season `careerStats` record.

#### Player Stats page

Add "Avg Rating" as a sortable column sourced from `totalMatchRating / matchesPlayed`. Because this value is computed rather than a direct `PlayerCareerStats` field, add an explicit synthetic sort key (for example `averageRating`) and custom sort/display logic for that column. Also add three columns for star nomination counts using the same medal emoji used everywhere else in this feature: 🥇, 🥈, 🥉 as column headers. Those medal columns are direct persisted fields and can use the existing `keyof PlayerCareerStats` sort path.

#### Team Details page — Bio tab

The Bio tab player table currently shows columns: OVR · Age · Nat. Add a **Rating** column (current-season average, displayed on the 1–10 scale) after OVR. Players who have not yet played any rated match (i.e. `matchesPlayed === 0` or `totalMatchRating === 0`) display `--`. The column header, cell width, and alignment should match the existing OVR column style. No new service method is needed, but the local `TeamDetailsRowStats` type and its zero-value fallback should be widened to include the rating fields needed for `totalMatchRating / matchesPlayed`.

Also show star nomination counts inline after the Rating cell for each player row. Display each non-zero count with its medal emoji: 🥇 N, 🥈 N, 🥉 N. Counts of zero are hidden — no empty badge is rendered. Players who have no star nominations at all show nothing in this space. This keeps the Bio tab clean for the majority of players.

#### Test coverage

Add focused tests for the highest-risk pieces of this feature:
- `StatisticsService`: fixed base-50 rating, bench players who never enter excluded from ranking, starters rateable at kickoff, substitution minute calculation, red-card minute calculation, and MISS penalty behavior.
- Shared ranking helper: deterministic top-3 ordering with the tie-break sequence `rating > winning team > goals > assists > saves > fewer cards > playerId`.
- Persistence/schema behavior: after the schema bump, outdated persisted payloads should be treated as incompatible and require reset/regeneration rather than being silently normalized.
- UI coverage: Match Summary stars render from shared ranking, Watch Mode shows `5.0` for starters at kickoff and `--` for unrated bench players, Player Profile Ratings tab always shows medal columns regardless of count (including zeros), Player Profile header chip renders `--` rating and zero star counts before any matches are played, Player Stats sorts `Avg Rating` correctly via the synthetic sort key, Team Details shows `--` when no season rating is available, and Team Details Bio tab hides star nomination badges when the count is 0.

---

## Decisions Recorded

| # | Question | Decision |
|---|---|---|
| 1 | Cross-team or per-team stars? | **Cross-team top 3** — best players in the match win stars regardless of team |
| 2 | Watch Mode update frequency | **Every commentary item** — most responsive; fast enough given static event array |
| 3 | Rating display scale | **1–10** (one decimal, e.g. `8.4`) in all UI; internals stay 1–100 |
| 4 | MISS events | **Small negative** — penalises wasteful finishing |
| 5 | Minimum minutes threshold for star eligibility | **None** — any player is eligible on pure rating |
| 6 | Rating anchor | **Fixed base of 50** — overall ability removed from formula; ratings are purely event-driven |
| 7 | Bench player ratings | **Excluded if they never take the field** — starters are rateable at kickoff; bench/reserve players show `--` until they enter |
| 8 | `minutesPlayed` accuracy | **Fix in Step 1** — derive per-player minutes from `SUBSTITUTION` and `RED_CARD` events |
| 9 | Delta scaling by minutes | **Deferred** — fixed base (decision 6) and minutes fix (decision 8) eliminate egregious cases; proportional scaling is a follow-up calibration item |
| 10 | Contextual event weighting (late-game, close scoreline multipliers) | **Deferred** — architecturally feasible, documented in Step 1; implement as a follow-up once base formula is live |
| 11 | Cross-surface consistency | **Use one shared top-3 ranking helper** for persistence, Match Summary, and Watch Mode |
| 12 | Star tie-break order | **Winning team first after rating**, then goals, assists, saves, fewer cards, then stable `playerId` |
| 13 | Schema bump behavior for existing saved data | **No migration/backfill** — old persisted data is incompatible after the schema change and requires reset/regeneration |
| 14 | Player Profile season scope | **Ratings tab inside Career Stats card** — added alongside Offensive/Defensive/Discipline; same season-rows table, different columns; no new component; star columns always shown even if 0 |
| 15 | Player Profile header chip | **Always rendered** — shows current-season avg rating (`--` if none) and all three star counts beside the overall rating badge |
| 16 | Team Details Bio tab stars | **Show only non-zero counts** — star badges are hidden when count is 0 to keep the Bio tab clean |
