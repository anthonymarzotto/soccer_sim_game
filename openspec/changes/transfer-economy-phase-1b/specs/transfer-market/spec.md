## Purpose

Manages the squad roster transfers, CPU automated listings, free agency recruitment, and financial valuation rules across weekly match simulation cycles.

## ADDED Requirements

### Requirement: Displaced Position Backup Auto-Listing
When a CPU-controlled team signs a player who is integrated into the starting XI and the team remains under the maximum roster cap of 30 players, the system SHALL automatically place the lowest OVR/value non-prospect backup player at that specific position onto the transfer list.

#### Scenario: CPU team signs a new starter at ST
- **WHEN** a CPU team signs a new striker who becomes a starting ST in their formation while under the 30-player cap
- **THEN** the system auto-lists the lowest OVR/value non-prospect backup ST from their roster onto the transfer list

### Requirement: High-Wage and High-Value CPU Auto-Listing
When a CPU-controlled team exceeds its allocated wage cap, the system SHALL prioritize listing their highest wage-earning and highest market value players first to facilitate rapid wage debt resolution through high-value buyer interest.

#### Scenario: CPU team exceeds wage cap
- **WHEN** a CPU team's wage points used exceeds their wage points cap during weekly evaluation
- **THEN** auto-listing candidate players are sorted by highest wage cost descending (and market value descending) for transfer listing

### Requirement: Unified Candidate Pool Free Agent Recruitment
During weekly transfer evaluation windows, CPU-controlled teams SHALL evaluate both transfer-listed players and free agents in a single unified candidate pass, selecting candidates based on overall quality (OVR) and position weakness fit so higher-OVR listed players are preferred over lower-OVR free agents when affordable.

#### Scenario: CPU team evaluates listed players and free agents
- **WHEN** a CPU team with transfer budget and wage headroom evaluates candidates for a position weakness
- **THEN** free agents ($0 fee) and transfer-listed players (market fee) are evaluated together, and the candidate with the highest overall rating meeting financial constraints is selected

#### Scenario: Cash-strapped CPU team signs free agent
- **WHEN** a CPU team lacks transfer budget for listed players but has wage headroom and a position weakness
- **THEN** the team selects an eligible free agent at $0 transfer fee who meets position quality floor requirements

### Requirement: Transfer Market Free Agent Visibility and Sorting
The Transfer Market page SHALL display available free agents from `league.freeAgents` alongside transfer-listed team players. Free agents SHALL be sortable by name, position, overall rating, age, market value, and wage cost, and filterable by team/status and position.

#### Scenario: Human player views transfer market with free agents
- **WHEN** a human player navigates to the Transfer Market page
- **THEN** both transfer-listed team players and free agents are listed in the table, sortable by overall rating and position
