## 1. Displaced Position Backup Auto-Listing

- [x] 1.1 Implement position-specific backup auto-listing in `executeTransfer` within `src/app/services/game.service.ts` to identify and list the lowest OVR/value non-prospect backup at position `pos` when a new starter at `pos` is signed under the 30-player cap.

## 2. Intelligent CPU Listing (High-Wage / High-Value Focus)

- [x] 2.1 Update `runCpuAutoListingForTeam` in `src/app/services/game.service.ts` to sort candidate players by wage cost descending (and market value descending) when `capExceeded` is true.

## 3. Unified Candidate Pool & Free Agent Signings

- [x] 3.1 Add `saveFreeAgentSigning` persistence helper method to `src/app/services/normalized-db.service.ts`.
- [x] 3.2 Implement `executeFreeAgentSigning` in `src/app/services/game.service.ts` to handle free agent player assignment, contract generation (1-4 seasons), and database persistence.
- [x] 3.3 Update `runCpuToCpuTransferPass` in `src/app/services/game.service.ts` to evaluate `league.freeAgents` ($0 fee) alongside `transferListings` in a single unified candidate pass, sorting all valid candidates by OVR rating descending to prioritize player quality.
- [x] 3.4 Update `TransferMarketComponent` (`src/app/pages/transfer-market/`) to include `league.freeAgents` in the Transfer Market view, enabling human players to view, filter, sort, and sign free agents alongside team-listed players.

## 4. Test Suite Alignment & Verification

- [x] 4.1 Update mock seller squad sizes in `src/app/services/game.service.transfers.spec.ts` to 19+ players to satisfy `CPU_TRANSFER_MIN_ROSTER_SIZE = 18`.
- [x] 4.2 Update tier wage cap assertions in `src/app/services/generator.service.spec.ts`.
- [x] 4.3 Add new unit tests for displaced position backup auto-listing, high-wage auto-listing prioritization, unified pool free agent CPU signings, and Transfer Market UI free agent visibility in `game.service.transfers.spec.ts`.
- [x] 4.4 Run full unit test suite to verify 100% clean test execution (`npm.cmd run test -- --watch=false`).
