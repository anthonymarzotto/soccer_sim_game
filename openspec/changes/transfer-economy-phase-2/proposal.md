## Why

The current transfer economy experiences market stagnation due to short 3-week transfer windows and an incomplete transfer sink mechanism. Specifically, listed players rarely receive domestic bids before windows close, and hard-deleting players who leave the league breaks career continuity. Transitioning to a **52-week annual schedule**, establishing a **Tiered World Market Sink**, and introducing an explicit **Player Status (`status: PlayerStatus`)** eliminates market deadwood, doubles domestic transfer volume, and creates a realistic, sustainable multi-season circular economy.

## What Changes

* **52-Week Schedule Engine**: Expand the annual schedule from 38 match weeks to a full 52-week calendar year, comprising 38 fixture weeks (19 home, 19 away) and 14 dedicated management/break weeks.
* **Extended Transfer Windows**: 
  * **Summer Pre-Season Window**: Weeks 1–6 (6 weeks).
  * **Winter Break Window**: Weeks 26–29 (4 weeks).
  * **Post-Season Pre-Turnover Window**: Weeks 49–50 (2 weeks).
  * **Post-Turnover Kickoff Window**: Weeks 52 & 1–6.
* **Tiered Asking Prices & World Market Liquidity Valve**:
  * **Unlisted Players**: Asking price = 115%–160% Market Value (MV).
  * **Listed Players (Week 1)**: Asking price = 100% MV (Domestic CPU & User priority).
  * **Listed Players (Week 2+)**: World Market active with a 25%/week buyout probability at a discounted **75%–85% Market Value**.
* **Explicit Player Status (`PlayerStatus`) & Circular Economy**:
  * Introduce `player.status`: `'contracted' | 'free_agent' | 'world' | 'retired'`.
  * `teamId` strictly holds an active domestic club UUID when `status === 'contracted'` (and `''` when `free_agent`, `world`, or `retired`). Historical club tracking continues to leverage `careerStats` and `transferHistory`.
  * Players purchased by foreign clubs transition to `status = 'world'` with a 1–3 season contract abroad.
  * During annual Season Rollover (Week 51), `world` player contract years remaining decrement, and aging/attribute progression runs.
  * When a `world` player's contract expires (0 years remaining), they transition to `status = 'free_agent'`.
  * The World Market also signs unassigned Free Agents (`status = 'free_agent'`) to contracts abroad (10–15%/week probability).
  * Automatic retirement transitions players with `status === 'world'` or `status === 'free_agent'` to `status = 'retired'` if `age >= 35` or `overall < 60` during Week 51 rollover.

## Capabilities

### New Capabilities
- `season-schedule-engine`: Covers the 52-week annual schedule engine, fixture week mapping vs non-match management weeks, and window phase transitions.
- `world-market-economy`: Covers the Tiered World Market sink, discounted foreign buyout logic, `PlayerStatus` lifecycle, Free Agent re-entry, and retirement sweeps.

### Modified Capabilities
<!-- None -->

## Impact

- **Affected Systems**: `GameService`, `TransferService`, `GeneratorService`, `LeagueAssemblyService`, `AppDbService` / `NormalizedDbService`.
- **UI Impacts**: Updates to `TransferMarketComponent`, `PlayerProfileComponent`, and season timeline navigation to display 52-week calendar context, `status` badges, and foreign transfer inbox notifications.
- **Persistence / Schema**: Requires updating player model interfaces with `PlayerStatus` and bumping `dataSchemaVersion`.
