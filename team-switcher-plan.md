# Team Switcher — Feature Plan

## Overview

Add a team selector to the Team Details page so the user can navigate to any team in the league without leaving the page.

---

## How It Works

1. **Data source**: `gameService.league()?.teams` already provides all teams. The list will be sorted alphabetically by team name.
2. **Selecting a team**: Navigating to `/team/<selectedTeamId>` is all that's needed. The component's `teamId` computed signal reacts to route param changes naturally.
3. **"Your Team" distinction**: `isUserTeam` is already computed — the selector will visually highlight the user's team with a ★ prefix.
4. **Read-only vs. editable**: The drag-and-drop formation editor is already gated on `isUserTeam`, so opponent teams will automatically be view-only.

---

## Recommended UI: Dropdown in the Page Header

Place a compact dropdown in the Team Details page header, near the team name and overall rating.

```
┌─────────────────────────────────────────────────────────┐
│  [ ← Back ]   Team Details                              │
│                                                         │
│  Viewing: [ FC Barcelona ▼ ]                            │
│  ★ Your Team                                            │
│                                                         │
│  OVR 78  |  Formation: 4-4-2  |  [Bio] [Stats] [History]│
└─────────────────────────────────────────────────────────┘
```

**Dropdown contents:**
- All teams in the league, sorted **alphabetically** by name
- User's team marked with a ★ prefix
- Currently viewed team is the selected value

**Behavior:**
- Selecting a team calls `router.navigate(['/team', selectedTeamId])`
- Angular route change triggers the component to recompute all signals naturally
- No page reload required

---

## Implementation Steps

1. Add a `allTeamsSorted` computed to `TeamDetailsComponent` that reads `gameService.league()?.teams` and sorts alphabetically by `name`.
2. Inject `Router` into `TeamDetailsComponent`.
3. Add an `onTeamChange(teamId: string)` method that calls `router.navigate(['/team', teamId])`.
4. Add a `<select>` dropdown in the header bound to `teamId()`, using the `(change)` handler to call `onTeamChange`.
5. Style the user's team entry with a ★ prefix using `isUserTeam` logic per option.

---

## Alternative UI Options Considered

| Option | Pros | Cons |
|---|---|---|
| **Dropdown (chosen)** | Compact, familiar, scales to any number of teams | Less visual |
| Prev / Next arrows | Clean, minimal | Can't jump directly to a specific team |
| Full team list sidebar | Always visible | Takes up significant screen space |
| Modal team picker | Rich UI with crests and records | Overkill, more complex to implement |

---

## Files to Change

| File | Change |
|---|---|
| `src/app/pages/team-details/team-details.ts` | Add `allTeamsSorted` computed, inject `Router`, add `onTeamChange()` |
| `src/app/pages/team-details/team-details.html` | Add dropdown to page header |