## Why

The current transfer market lacks intelligent roster circulation, leaving high-quality backups rotting on CPU benches while teams in wage debt list low-OVR reserves that no other clubs want to buy. Additionally, cash-strapped CPU clubs cannot acquire depth because they lack free agency signing mechanisms. Implementing Phase 1B creates an active transfer loop where high-wage earners are prioritized for listing, displaced position backups are transfer-listed (preferring lowest OVR/value at that position), and free agents are included in the available player pool for both CPU recruitment and human player discovery on the Transfer Market page.

## What Changes

- **Displaced Backup Auto-Listing**: When a CPU team signs a starting player at a position (under the 30-player cap), they auto-list the lowest OVR/value non-prospect backup at that specific position rather than blindly listing the exact player who was displaced from the XI.
- **High-Wage / High-Value Auto-Listing**: When a CPU team exceeds its wage cap, auto-listing sorts candidates by highest wage points cost (and market value) first so top-tier clubs actually bid on them.
- **Unified Player Pool Free Agent Recruitment**: In the existing weekly CPU transfer pass, CPU teams evaluate free agents alongside transfer-listed players in a single unified pool. Candidates are selected based on position fit and overall quality (OVR), ensuring clubs with budget prefer higher-quality listed players while cash-strapped clubs can acquire free agents for $0.
- **Human Player Free Agent Visibility & Sorting**: Free agents are displayed on the Transfer Market UI page alongside team-listed players, allowing human players to view, filter, sort, and negotiate contracts with free agents.

## Capabilities

### New Capabilities
- `transfer-market`: Roster displacement auto-listing, intelligent high-wage listings for over-cap teams, unified-pool CPU free agent recruitment, and Transfer Market UI free agent visibility/sorting.

### Modified Capabilities
*(None)*

## Impact

- `src/app/services/game.service.ts`: Update `executeTransfer`, `runCpuAutoListingForTeam`, and `runCpuToCpuTransferPass`.
- `src/app/services/normalized-db.service.ts`: Add `saveFreeAgentSigning` for database persistence.
- `src/app/pages/transfer-market/`: Update `TransferMarketComponent` to include `league.freeAgents` in `allListedPlayers`.
- `src/app/services/game.service.transfers.spec.ts` & `src/app/services/generator.service.spec.ts`: Update unit tests for roster floors and wage caps.
