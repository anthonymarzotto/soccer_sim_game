# Proposed Player Attributes for Set Pieces & Simulation Realism

This document outlines a proposal to add specialized player attributes to the simulation engine, enhancing realism for set pieces, aerial duels, and goalkeeping actions.

---

## 1. Executive Summary
Currently, the soccer simulation uses generalized attributes to resolve specialized events:
* **Corners & Free-Kicks** are taken by players with high `longPassing` and `flair`.
* **Penalties** are taken by players with high `composure` and `shooting`.
* **Aerial Duels** are decided by `heading` and `strength` plus flat position-based bonuses, ignoring player height.
* **Goalkeepers** defend penalties using only `reflexes`.

Adding dedicated attributes will allow for realistic player profiles (e.g. set-piece specialists, penalty experts, and aerially dominant players who aren't necessarily physically strong).

---

## 2. Proposed Attributes

### A. Set-Piece Specialization (Skill Category)
* **`setPieces` (or `freeKicks`)**:
  * **Description**: A player's ability to deliver accurate corners, cross indirect free-kicks, or shoot direct free-kicks.
  * **Simulation Impact**: Replaces `longPassing + flair` and `shooting + longPassing + flair` when choosing corner and free-kick takers, and directly influences delivery score and direct free-kick shot-on-target probability.
* **`penalties`**:
  * **Description**: Technical penalty taking skill, representing penalty placement and penalty-taker tricks.
  * **Simulation Impact**: Combines with `composure` to determine the shooter's penalty success probability, separating pure penalty specialists from standard high-shooting forwards.

### B. Physical & Aerial Realism (Physical Category)
* **`jumpingReach`**:
  * **Description**: A player's maximum vertical jump height.
  * **Simulation Impact**: Replaces or supplements `strength` in aerial duels.
* **Integration of Player Height (`PlayerPersonal.height`)**:
  * **Description**: Factors the player's physical height (already stored in the database but currently ignored in simulation) into the aerial weight calculation.
  * **Formula Mod**:
    ```ts
    const heightBonus = Math.max(0, (player.personal.height - 170) * 0.5); // 0.5 points per cm above 170cm
    const aerialWeight = attrs.heading.value * 0.4 + attrs.jumpingReach.value * 0.4 + heightBonus + positionBonus;
    ```

### C. Goalkeeping Depth (Goalkeeping Category)
* **`positioning`**:
  * **Description**: A goalkeeper's ability to read the play and position themselves to cut off crosses or intercept passes before shots occur.
  * **Simulation Impact**: Acts as a defensive check during corners and crosses to intercept deliveries before the attacker can win a header.
* **`penaltySaving`**:
  * **Description**: A goalkeeper's penalty-saving instincts, anticipation, and mind games.
  * **Simulation Impact**: Replaces `reflexes` as the primary defense rating during penalty shots.

---

## 3. Implementation Blueprint

### Step 1: Schema Updates
Define the new attributes on `StatKey` and `PlayerSeasonAttributes` in `src/app/models/types.ts`:
```typescript
export type StatKey =
  // Existing keys...
  | 'setPieces' | 'penalties' | 'jumpingReach' | 'positioning' | 'penaltySaving';

export interface PlayerSeasonAttributes {
  // Existing blocks...
  // skill
  setPieces: Stat;
  penalties: Stat;
  // physical
  jumpingReach: Stat;
  // goalkeeping
  positioning: Stat;
  penaltySaving: Stat;
}
```

### Step 2: Simulation Logic Integration
Modify the set-piece methods inside `src/app/services/match.simulation.variant-b.service.ts`:

1. **`executeVariantBCorner`**:
   * **Taker Selection**: Sort by `setPieces` instead of `longPassing + flair`.
   * **Aerial Weight**: Factor in `jumpingReach` and `heightBonus` instead of `strength`.

2. **`executeVariantBFreeKick`**:
   * **Taker Selection**: Sort by `setPieces` instead of `shooting + longPassing + flair`.
   * **Direct Shot On Target**: Factor in `setPieces` and `shooting` vs goalkeeper `positioning`.

3. **`executeVariantBPenalty`**:
   * **Shooter Selection**: Sort by `penalties + composure`.
   * **Contest**: Compare `(penalties + composure) / 2` vs goalkeeper `penaltySaving`.

### Step 3: Database & Migration
* Increment persistence version in `package.json` and sync schema version.
* Update player generator templates in `generator.service.ts` to assign appropriate default values based on the player's position (e.g. high `penaltySaving` for GKs, high `jumpingReach` for CBs).
