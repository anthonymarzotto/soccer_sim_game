## Purpose

Establishes a Tiered World Market sink, discounted foreign buyout mechanics, explicit PlayerStatus ('contracted' | 'free_agent' | 'world' | 'retired'), and automated retirement sweeps to sustain a circular transfer economy.

## ADDED Requirements

### Requirement: Tiered Asking Price Structure
The system SHALL evaluate asking prices based on listing status:
- **Unlisted Players**: 115%–160% Market Value (MV).
- **Listed Players (Week 1)**: 100% MV (Domestic CPU and User priority).
- **World Market Buyers (Week 2+)**: Discounted buyout offer at 75%–85% MV.

#### Scenario: Domestic CPU evaluation of listed player
- **WHEN** a CPU team evaluates a player listed in Week 1
- **THEN** the asking price is set to 100% of the player's Market Value.

#### Scenario: World Market evaluation of listed player
- **WHEN** a listed player reaches Week 2 or later without a domestic purchase
- **THEN** the World Market generates a foreign purchase offer between 75% and 85% of Market Value.

### Requirement: World Market Buyout Execution
The system SHALL roll a 25% weekly probability for listed players eligible for the World Market (listed for >= 2 weeks).

#### Scenario: CPU team accepting World Market buyout
- **WHEN** a CPU team owns a listed player receiving a World Market offer and the CPU team is over its wage cap or in negative transfer budget
- **THEN** the CPU team automatically accepts the foreign offer, clears the player's wage cost, and receives the discounted transfer fee.

#### Scenario: User team receiving World Market offer
- **WHEN** a user-owned player receives a World Market buyout offer
- **THEN** the system posts a foreign transfer offer to the user's transfer inbox matching standard transfer notification formats.

### Requirement: World Market Player State ('world')
The system SHALL assign `player.status = 'world'`, clear `player.teamId = ''`, and set a 1–3 season contract duration when a player is transferred to the World Market, keeping the player in active state storage.

#### Scenario: Foreign transfer execution
- **WHEN** a player is sold to the World Market
- **THEN** `player.status` is updated to `'world'`, `player.teamId` is set to `''`, the seller receives the fee, and the player remains in active storage.

### Requirement: Contract Expiration and Free Agent Re-Entry
During the Week 51 Season Rollover, the system SHALL decrement `yearsRemaining` for all players with `player.status === 'world'`. When `yearsRemaining` reaches 0, the player's `status` SHALL be set to `'free_agent'`.

#### Scenario: World player returning to domestic free agency
- **WHEN** a player with `status === 'world'` reaches 0 contract years remaining during Week 51 rollover
- **THEN** `player.status` transitions to `'free_agent'` and the player becomes available on the domestic Transfer Market UI for $0 transfer fee.

### Requirement: World Market Free Agent Acquisition
During open transfer windows, the system SHALL roll a 10%–15% weekly probability for unassigned Free Agents (`player.status === 'free_agent'`) to be signed by the World Market to a 1–3 season contract abroad.

#### Scenario: World Market signing a free agent
- **WHEN** an unassigned free agent is selected by the World Market weekly roll
- **THEN** `player.status` transitions from `'free_agent'` to `'world'` with a new contract duration.

### Requirement: Retirement Pruning Sweep & Replacement Scoping
During Week 51 Season Rollover, the system SHALL transition players with `status === 'world'` or `status === 'free_agent'` to `status === 'retired'` if `age >= 35` or `overall < 60`.
The system SHALL generate a youth prospect replacement ONLY when a player retires from a domestic club (`status === 'contracted'`). The system SHALL NOT generate youth replacement prospects for players retiring from `status === 'free_agent'` or `status === 'world'`.

#### Scenario: Retiring a contracted club player
- **WHEN** a contracted player on a domestic team roster retires
- **THEN** `player.status` transitions to `'retired'` and a new 16–18 year old youth prospect is added to the club's roster.

#### Scenario: Retiring a free agent or world player without replacement
- **WHEN** a player with `status === 'free_agent'` or `status === 'world'` retires during Week 51 rollover
- **THEN** `player.status` transitions to `'retired'` and NO replacement youth prospect is generated into the pool.
