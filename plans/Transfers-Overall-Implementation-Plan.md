## Revised Implementation Plan: Transfers & Finances

---

### Increment 1 — Player Market Value (Pure Computation)

No schema changes. A deterministic function:

```
calculateMarketValue(player, seasonYear) → number
```

Inputs from existing data: `overall`, `age`, `phase`, `position`. Peak-phase young players command a premium; Decline-phase players depreciate sharply. Display this on player profiles and team details immediately.

**Why first:** Every subsequent feature references this value — transfer fees, wage point costs, renewal demands all derive from it. Get the curve right against real player data before building anything that depends on it.

---

### Increment 2 — Team Tiers & Wage Points

Add tier assignment to team generation and a wage points system to replace raw wage tracking.

```typescript
type TeamTier = 1 | 2 | 3 | 4 | 5;

interface TeamFinances {
  tier: TeamTier;
  wagePointsCap: number;    // derived from tier, never changes (for now)
  wagePointsUsed: number;   // sum of all player wage costs
  transferBudget: number;   // cash available for fees only
}
```

Tier is derived from initial squad quality at generation — teams that generated high `teamQuality` get high tiers. The distribution across 20 teams is fixed:

| Tier | Teams | Wage Cap |
|------|-------|----------|
| 1 | 2–3 | 60 pts |
| 2 | 4–5 | 45 pts |
| 3 | 6–8 | 32 pts |
| 4 | 5–6 | 22 pts |
| 5 | 2–3 | 14 pts |

Each player gets a wage point cost derived from their `overall` and `phase` — a pure function, not stored. Transfer budgets are seeded at generation proportional to tier. Tier 1 clubs start with meaningfully more spending power; Tier 5 clubs start lean.

**Why second:** Tier is the foundation everything else sits on. It needs to exist before windows, listings, or contracts mean anything.

---

### Increment 3 — Transfer Windows

Derive window state from `currentWeek`, no new data needed:

```typescript
type TransferWindowPhase = 'summer' | 'winter' | 'closed';

function getTransferWindowPhase(week: number): TransferWindowPhase
// summer: weeks 1–3, winter: weeks 20–22, otherwise closed
```

All transfer actions are blocked outside a window. This is a single pure utility function that immediately adds calendar rhythm without any calendar infrastructure.

---

### Increment 4 — Transfer Market (Listings)

Add a transfer market to `League`:

```typescript
interface TransferListing {
  playerId: string;
  teamId: string;
  askingPrice: number;    // ~110–120% of market value
  listedInWeek: number;
}
```

At window opening, CPU teams auto-list players based on simple heuristics: surplus at a position, players in Decline phase, players whose wage point cost has become awkward relative to their output. The user can manually list their own players too.

Listings expire when the window closes. Any player not sold comes off the market and the situation persists into the next window.

---

### Increment 5 — Transfer Offers & Execution

The actual movement mechanic:

```typescript
interface TransferOffer {
  id: string;
  buyerTeamId: string;
  sellerTeamId: string;
  playerId: string;
  fee: number;
  week: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}
```

CPU sellers accept if the fee meets the asking price and the sale doesn't leave them critically short at that position. No haggling — one offer, binary outcome.

When a transfer completes, four things happen atomically:
- Buyer's `transferBudget` decreases by the fee
- Buyer's `wagePointsUsed` increases by the player's wage cost
- Seller's `transferBudget` increases by the fee
- Seller's `wagePointsUsed` decreases by the player's wage cost

The user sees incoming offers as notifications they can accept or decline. The buying flow checks both conditions before allowing a purchase: enough transfer budget for the fee, and enough wage point headroom for the ongoing cost.

---

### Increment 6 — CPU Transfer AI

Wire up CPU-to-CPU activity during window processing alongside `simulateCurrentWeek`. CPU teams scan listings for players that address a weak position, bid if they have both budget and wage point headroom, and prioritize best value relative to cost. Limit to 1–2 transfers per club per window to keep churn realistic.

This makes the league feel alive — the user opens the winter window and finds deals have already happened between CPU clubs, with ripple effects on standings and squad strengths.

---

### Increment 7 — Season Prize Money

At season end, distribute prize money by final standing:

```typescript
income[rank] = BASE_PRIZE + (totalTeams - rank) * RANK_BONUS
```

This credits `transferBudget` directly — it's the only income source for now, deliberately simple. It prevents rich-getting-richer lock-in because lower-ranked Tier 1 clubs get less of a top-up than a Tier 4 club that over-performed. It also gives small-market clubs a meaningful reward for a good season that they can spend in the next summer window.

---

### Increment 8 — Contracts

Add a minimal contract record to `Player`:

```typescript
interface PlayerContract {
  agreedWageCost: number;       // wage points, locked at signing
  expiresAfterSeason: number;
}
```

The key insight here is that `agreedWageCost` is stored rather than derived. When a player signs, their wage point cost is locked in. This is what creates the interesting tension: a player you signed three seasons ago at 4 points is now 82 overall and worth 6 points on the open market. They're a bargain. Conversely, a player signed at peak who has declined now costs you more points than their performance justifies.

At `startNewSeason()`, the season transition logic runs contract checks:

- Players entering their final year are flagged in `SeasonTransitionLog` as contract alerts
- CPU teams evaluate each flagged player: can they afford the renewal demand? If not, auto-list in the summer window
- Renewal demands are calculated as a function of current market value — typically higher than the expiring rate for good players, sometimes lower for declining ones

Contract expiry is handled conservatively at first: an expired contract auto-renews at the new market rate rather than creating a free agent. This avoids the complexity of stateless players while still creating financial pressure — the team either absorbs the higher cost or lists the player.

**Why eighth:** Contracts are the payoff feature. Everything before this made transfers work mechanically. Contracts make them emotionally interesting — the superstar in his last year, the bargain signing that aged into dead weight, the Tier 4 club that has to sell their best player because they can't meet his renewal demands.

---

### Deferred (explicitly)

- **True free agency** — requires modeling unattached players, too disruptive to the current `player.teamId` assumption
- **Contract negotiation / back-and-forth** — auto-accept/reject is sufficient; negotiation is a separate minigame
- **Tier mobility** — static tiers for now; a slow drift mechanic (±1 tier based on sustained performance) is a natural extension when promotion/relegation arrives
- **Matchday / commercial income** — the season prize money is the only income source until a fuller economy is warranted
- **Loan deals** — interesting but complicates roster rules significantly
- **Release clauses** — good flavour but adds edge cases throughout the transfer logic

---

### Implementation order summary

```
1. calculateMarketValue()          → pure function, no schema change, visible immediately
2. TeamTier + TeamFinances         → schema change, drives generator, wage points cap
3. getTransferWindowPhase()        → pure utility, gates all transfer UI
4. TransferListing on League       → schema change, CPU listing heuristics
5. TransferOffer + execution       → schema change, user flow, atomic swap logic
6. CPU transfer AI                 → logic only, no new schema
7. Season prize money              → hooks into startNewSeason()
8. PlayerContract                  → schema change, contract lifecycle in season transition
```

Each increment ships independently. Schema changes land at steps 2, 4, 5, and 8 — each a natural version bump for `GENERATED_APP_DATA_SCHEMA_VERSION`. The emotional payoff of the whole system — the contract drama, the small-market club punching above its weight, the superstar who has to be sold — arrives at step 8, but the league already feels financially alive well before that.