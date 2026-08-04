## Context

See proposal.md for motivation and background. We are extending `GameService`, `NormalizedDbService`, and `TransferMarketComponent` to implement Phase 1B of the transfer economy plan.

## Goals / Non-Goals

**Goals:**
- Implement position-based backup auto-listing (selecting lowest OVR/value non-prospect backup at position `pos` when a new starter at `pos` is signed under the 30-player cap).
- Implement high-wage/high-value auto-listing prioritization when CPU teams exceed wage caps.
- Integrate free agents into the single unified CPU transfer pass without creating a separate pass or giving free agents unfair priority over higher-OVR listed players.
- Display free agents on the human player's Transfer Market UI page (`/transfer-market`), enabling sorting, filtering, and contract negotiation for free agents alongside team-listed players.
- Fix broken unit test suites in `game.service.transfers.spec.ts` (roster size floor test setup) and `generator.service.spec.ts` (tier wage caps assertions).

**Non-Goals:**
- External World Market shadow buyers (Phase 2).
- Dynamic wage cap indexing across multi-season progressions (Phase 3).

## Decisions

### 1. Position-Specific Backup Auto-Listing (Refined User Request)
- **Approach**: When `executeTransfer` completes and a new starter is placed at position `pos`:
  1. We identify all non-starting players at position `pos` on the buyer team.
  2. We filter out young prospects (`age <= 21` with top percentile value for age bracket).
  3. Out of the remaining backup candidates at position `pos`, we select the one with the lowest OVR (breaking ties with lowest market value) and add their ID to `transferListings`.
- **Rationale**: Blindly listing the exact player who was displaced from the starting XI could list a high-potential 21-year-old superstar who was temporarily benched. Finding the lowest OVR/value non-prospect backup at that specific position ensures deadwood is transferred while protecting core prospects.

### 2. High-Wage Prioritization in Auto-Listing
- **Approach**: In `runCpuAutoListingForTeam`, when `capExceeded` is true, sort `contractCandidates` by `calculatePlayerWageCost` descending, breaking ties with `calculateMarketValue` descending.
- **Rationale**: Listing high-wage/high-value players puts players on the market that top-tier clubs actually want to buy, resolving wage cap debt rapidly.

### 3. Unified Candidate Pool for Free Agents & Listed Players (Refined User Request)
- **Approach**:
  - In `runCpuToCpuTransferPass`, candidate selection for a position weakness gathers BOTH `transferListings` (asking price from market value) AND `freeAgents` (asking price = $0).
  - Free agent candidates are skipped if the buyer team is at or above the 30-player cap (`isAtRosterCap`).
  - Standard quality checks (OVR floor, prospect improvement, starter quality if at cap, wage headroom) apply equally to both listed players and free agents.
  - All valid candidates are sorted strictly by **Overall Rating descending** (`validCandidates.sort((a, b) => b.overall - a.overall)`).
  - **Quality Priority Guarantee**: A team with transfer budget will naturally prefer a higher-OVR listed player over a lower-OVR free agent because candidates are sorted by OVR, not by cost.
  - **Budget Safety**: Cash-strapped teams failing transfer budget checks for listed players will still find $0 asking price free agents as valid candidates, enabling depth recruitment without bypassing quality filters.
  - Implement `executeFreeAgentSigning` on `GameService` and `saveFreeAgentSigning` on `NormalizedDbService`.

### 4. Transfer Market UI Integration for Human Players (Refined User Request)
- **Approach**:
  - In `TransferMarketComponent` (`src/app/pages/transfer-market/transfer-market.ts`), update `allListedPlayers` computed signal to merge `league.transferListings` and `league.freeAgents`.
  - For free agents, map them into `TransferRow` objects with a synthetic team object (`{ id: 'free_agents', name: 'Free Agent' }`).
  - Free agents will naturally participate in all existing sorting (name, position, overall rating, age, market value, wage cost) and position/search filtering.
  - Human players can click "Make Offer" / "Sign Free Agent" to open the offer modal with $0 transfer fee pre-filled.

### 5. Unit Test Fix Strategy
- Update `game.service.transfers.spec.ts` mock seller team generation loops to populate 19+ players so seller teams pass the `CPU_TRANSFER_MIN_ROSTER_SIZE = 18` floor.
- Update `generator.service.spec.ts` to assert against calibrated wage caps (`tier 3: 33`, `tier 4: 25`, `tier 5: 22`).

## Risks / Trade-offs

- **[Risk]** Roster pool depletion at specific positions.
  - **Mitigation**: Existing `POSITION_SELL_FLOOR` checks in `runCpuAutoListingForTeam` prevent teams from dropping below minimum position depth.
