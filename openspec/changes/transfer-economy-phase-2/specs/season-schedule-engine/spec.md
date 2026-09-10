## Purpose

Provides a 52-week annual league schedule structure that segregates competitive match weeks from pre-season, mid-season break, and post-season squad management phases.

## ADDED Requirements

### Requirement: 52-Week Schedule Allocation
The simulation engine SHALL manage each league season across a 52-week calendar year, comprising 38 fixture weeks and 14 non-match management weeks.

#### Scenario: Advancing a non-match management week
- **WHEN** the user or automated simulation advances a week with zero scheduled fixtures (e.g. Weeks 1–6, 26–29, 49–50, 52)
- **THEN** the system advances financial ticks and transfer market evaluations without running match simulations.

#### Scenario: Advancing a match week
- **WHEN** the user advances a week with scheduled fixtures (Weeks 7–25, 30–48)
- **THEN** the system executes match simulations for all scheduled league fixtures before advancing the week counter.

### Requirement: Transfer Window Scheduling
The system SHALL control transfer window phases based on the 52-week calendar year:
- **Summer Pre-Season Window**: Open during Weeks 1–6.
- **Winter Break Window**: Open during Weeks 26–29.
- **Post-Season Pre-Turnover Window**: Open during Weeks 49–50.
- **Post-Turnover Kickoff Window**: Open during Weeks 52 & 1–6.
- **Closed Window**: Closed during fixture weeks 7–25 and 30–48.

#### Scenario: Transfer window status during winter break
- **WHEN** the current season week is Week 27
- **THEN** the transfer window phase is evaluated as `winter` and transfer bids are permitted.

#### Scenario: Transfer window status during mid-season matches
- **WHEN** the current season week is Week 12
- **THEN** the transfer window phase is evaluated as `closed` and CPU transfer passes are skipped.

### Requirement: Pre-Turnover and Post-Turnover Windows
The system SHALL provide a two-stage season transition around Week 51:
- **Pre-Turnover (Weeks 49–50)**: Standings and end-of-season finances are finalized, but player ages and attributes remain at season-ending values.
- **Rollover Event (Week 51)**: Player ages increment, attribute progression/regression runs, and contract years decrement.
- **Post-Turnover (Week 52 & Weeks 1–6)**: Player ages and attributes reflect updated values for the new season.

#### Scenario: Trading before player age regression
- **WHEN** a transfer occurs during Weeks 49–50
- **THEN** player market value and attributes are calculated based on their un-regressed season stats before Week 51 rollover.
