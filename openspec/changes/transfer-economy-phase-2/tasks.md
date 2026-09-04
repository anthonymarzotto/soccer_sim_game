## 1. 52-Week Calendar & Schedule Engine

- [x] 1.1 Update `TransferService` window bounds for 52-week calendar (Summer W1–W6, Winter W26–W29, Post-Season W49–W50, Kickoff W52 & W1–W6).
- [x] 1.2 Update `GeneratorService.generateSchedule()` to map 38 round-robin match weeks into Weeks 7–25 and Weeks 30–48.
- [x] 1.3 Add unit tests verifying 52-week schedule generation, empty management week behavior, and transfer window phase calculations.

## 2. World Market Sink & Tiered Pricing

- [x] 2.1 Update `calculateAskingPrice` in `GameService` for tiered pricing (100% MV for listed W1, unlisted 115%–160% MV).
- [x] 2.2 Add World Market buyout generation in `runCpuToCpuTransferPass` for listed players where `weeksListed >= 2` (25%/week roll at 75%–85% MV).
- [x] 2.3 Implement auto-accept logic for CPU teams in financial distress receiving World Market offers.
- [x] 2.4 Add user transfer inbox notification integration for World Market offers on user-owned listed players.

## 3. PlayerStatus Enum & Circular Economy Rollover

- [x] 3.1 Define `PlayerStatus` enum (`'contracted' | 'free_agent' | 'world' | 'retired'`) and update `Player` model interfaces.
- [x] 3.2 Update transfer execution logic to assign `player.status = 'world'` and `player.teamId = ''` with a 1–3 season contract upon foreign sale.
- [x] 3.3 Update Week 51 Season Rollover in `GameService` to decrement `world` player contracts and transition expired contracts to `status = 'free_agent'`.
- [x] 3.4 Add World Market Free Agent acquisition roll (10%–15%/week) for unassigned free agents (`status === 'free_agent'`).
- [x] 3.5 Implement automated retirement sweep transitioning `world` and `free_agent` players to `status = 'retired'` if `age >= 35` or `overall < 60` during Week 51 rollover.
- [x] 3.6 Bump package version in `package.json` and sync `src/app/generated/data-schema-version.ts`.

## 4. UI Adjustments & Telemetry Verification

- [x] 4.1 Update `TransferMarketComponent` and `PlayerAttributesComponent` filters to handle `PlayerStatus` values and display 52-week timeline status.
- [x] 4.2 Run unit tests and financial simulation diagnostics to verify 52-week transfer volume, World Market clearance rates, and retirement sweep stability.
