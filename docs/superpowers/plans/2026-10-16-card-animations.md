# Apple-Style Card Flight & Board Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver smooth, Apple-style card flight animations for drawing and playing cards on the UNO No Mercy game board while ensuring cards resting in hand remain strictly static with no hover or lift effects.

**Architecture:** A top-level viewport overlay (`CardFlightOverlay`) renders ephemeral `motion.div` card flight clones between bounding client rectangles of source and target elements. `LiveGameScreen` manages visual staging—holding hand card placeholders during flight and delaying top-discard replacement until landing—while snapshot diffing triggers opponent flight vectors and auto-flushes on user action.

**Tech Stack:** React 19, TypeScript, Motion (`motion/react` v14), Tailwind CSS v4, Vitest, Testing Library (`@testing-library/react`).

**Spec:** [`docs/superpowers/specs/2026-10-16-card-animations-design.md`](file:///c:/Users/rubel/Documents/GitHub/uno-no-mercy/docs/superpowers/specs/2026-10-16-card-animations-design.md)

## Global Constraints

- Must be implemented on branch `future-animation`.
- Cards in hand must remain strictly static with zero hover elevation, tilt, or idle floating animations.
- Animation timing: standard flight 280ms with cubic-bezier `[0.22, 1, 0.36, 1]` ease-out curve.
- Multi-card draw flight stagger: 50ms–70ms gap between consecutive card flights.
- Accessibility: respect `prefers-reduced-motion` by resolving animations immediately (0ms).
- Zero user turn blocking: flights must never lock input or stall client command dispatch.

## Review Focus

1. **Played card slot collapses prematurely during flight:** surrounding hand cards shift while card is mid-air. Behavior: card slot stays in DOM with `visibility: hidden` until the 280ms flight lands.
2. **Discard pile prematurely updates before thrown card lands:** top discard card changes at t=0 while flight is still in mid-air. Behavior: visual discard pile buffers the previous top discard until the flight lands.
3. **Rapid multi-draw queue locks user input:** player cannot click or play cards during a +6 or +10 penalty stream. Behavior: any user play or draw command instantly flushes all pending flights and settles state.
4. **Initial deal triggers a flood of 28 animations:** transition from `lobby` to `round-active` floods screen with flights. Behavior: initial round deal explicitly skips diffing and populates instantly.
5. **Opponent plays Discard All card:** multiple cards leave opponent hand. Behavior: only the played top card flies to discard; the remaining matching cards discard cleanly without cluttering the screen.

---

### Task 1: Enforce Static Hand Cards (Remove Hover & Lift Interactions)

**Files:**
- Modify: `frontend/src/components/PlayerSeat.tsx`
- Modify: `frontend/src/components/GameCard.tsx`
- Modify: `frontend/src/index.css:649-700`
- Create: `frontend/src/components/PlayerSeat.test.tsx`

**Interfaces:**
- Consumes: `PlayerSeatProps` in `frontend/src/components/PlayerSeat.tsx`
- Produces: `PlayerSeat` component rendering static cards in hand with `data-card-instance-id={instanceId}` attribute and zero hover translation/scaling.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/PlayerSeat.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findCard } from "../game/cards";
import { PlayerSeat } from "./PlayerSeat";

describe("PlayerSeat static cards", () => {
  it("renders hand cards with data-card-instance-id and static styling", () => {
    const card = findCard("blue-0");
    render(
      <PlayerSeat
        active
        cardIds={["c1"]}
        cards={[card]}
        count={1}
        name="You"
        orientation="horizontal"
        points={0}
        position="bottom"
      />
    );
    const cardElement = screen.getByRole("article", { name: /blue 0/i });
    expect(cardElement).toHaveAttribute("data-card-instance-id", "c1");
    expect(cardElement.className).not.toContain("game-card--interactive-lift");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/components/PlayerSeat.test.tsx`
Expected: FAIL with `data-card-instance-id` missing.

- [ ] **Step 3: Implement static cards and data attributes**

- In `PlayerSeat.tsx`, pass `data-card-instance-id={instanceId}` to `.player-seat__card`.
- In `PlayerSeat.tsx` and `GameCard.tsx`, ensure hand cards do not receive hover elevation or tilt transitions.
- In `index.css`, ensure `.player-seat--bottom .player-seat__card` has no `:hover` translation or scale.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/components/PlayerSeat.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PlayerSeat.tsx frontend/src/components/GameCard.tsx frontend/src/index.css frontend/src/components/PlayerSeat.test.tsx
git commit -m "style: enforce static hand cards with zero hover lift"
```

---

### Task 2: Build `CardFlightOverlay` Component and Motion Controller

**Files:**
- Create: `frontend/src/components/CardFlightOverlay.tsx`
- Create: `frontend/src/components/CardFlightOverlay.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface FlightRequest {
    id: string;
    card: CardDefinition;
    fromRect: { x: number; y: number; width: number; height: number };
    toRect: { x: number; y: number; width: number; height: number };
    duration?: number;
    delay?: number;
    onComplete?: () => void;
  }

  export interface CardFlightOverlayProps {
    flights: FlightRequest[];
    onFlightEnd: (id: string) => void;
  }
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/CardFlightOverlay.test.tsx
import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cardBack, findCard } from "../game/cards";
import { CardFlightOverlay, type FlightRequest } from "./CardFlightOverlay";

describe("CardFlightOverlay", () => {
  it("renders active card flights in a fixed overlay layer", () => {
    const onFlightEnd = vi.fn();
    const flight: FlightRequest = {
      id: "f1",
      card: findCard("red-7"),
      fromRect: { x: 100, y: 100, width: 80, height: 120 },
      toRect: { x: 300, y: 200, width: 80, height: 120 },
      duration: 0.28,
      onComplete: vi.fn(),
    };

    render(<CardFlightOverlay flights={[flight]} onFlightEnd={onFlightEnd} />);
    const overlay = screen.getByTestId("card-flight-overlay");
    expect(overlay).toBeInTheDocument();
    expect(screen.getByRole("article", { name: /red 7/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/components/CardFlightOverlay.test.tsx`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `CardFlightOverlay.tsx`**

- Render fixed layer with `pointer-events-none fixed inset-0 z-50 overflow-hidden`.
- Render each `FlightRequest` as a `motion.div` with initial `{ x: fromRect.x, y: fromRect.y, scale: 1, opacity: 0.9 }`, animate to `{ x: toRect.x, y: toRect.y, scale: 1, opacity: 1 }` with ease `[0.22, 1, 0.36, 1]` over 280ms.
- Support `delay` for staggered multi-draws.
- Call `onFlightEnd(id)` and `flight.onComplete?.()` on `onAnimationComplete`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/components/CardFlightOverlay.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CardFlightOverlay.tsx frontend/src/components/CardFlightOverlay.test.tsx
git commit -m "feat: add CardFlightOverlay component for card animations"
```

---

### Task 3: Implement Throw Flight & DOM Staging in `LiveGameScreen`

**Files:**
- Modify: `frontend/src/components/LiveGameScreen.tsx`
- Modify: `frontend/src/components/PlayerSeat.tsx`
- Modify: `frontend/src/components/LiveGameScreen.test.tsx`

**Interfaces:**
- Consumes: `CardFlightOverlay`, `FlightRequest` from Task 2, `data-card-instance-id` from Task 1.
- Produces: Optimistic throw flight on player card click; opponent throw flight on snapshot diff; staging of hand slot and top discard.

- [ ] **Step 1: Write the failing test**

```tsx
// in frontend/src/components/LiveGameScreen.test.tsx
it("triggers throw flight animation and buffers top discard when card is played", async () => {
  // test that clicking a legal card invokes onCommand and triggers flight without instant layout collapse
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/components/LiveGameScreen.test.tsx -t "triggers throw flight animation"`
Expected: FAIL.

- [ ] **Step 3: Implement throw flight and visual staging**

- In `LiveGameScreen.tsx`:
  - Attach ref to discard pile element (`discardPileRef`).
  - Track `hiddenCardInstanceId`: when viewer clicks a card, set `hiddenCardInstanceId = cardId` and compute `getBoundingClientRect()` of card vs `discardPileRef`.
  - Add flight to `activeFlights` state in `CardFlightOverlay`.
  - When flight completes, clear `hiddenCardInstanceId` so hand collapses naturally, and sync visual `topDiscard`.
  - On snapshot update from opponent play (detected when `snapshot.topDiscard` changes and active opponent's card count decreased), compute opponent seat rect to discard pile rect and animate card back or revealed card to discard pile.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/components/LiveGameScreen.test.tsx -t "triggers throw flight animation"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LiveGameScreen.tsx frontend/src/components/LiveGameScreen.test.tsx
git commit -m "feat: implement throw card flight animation and staging"
```

---

### Task 4: Implement Draw Flight, Multi-Draw Staggering & Fast-Forward in `LiveGameScreen`

**Files:**
- Modify: `frontend/src/components/LiveGameScreen.tsx`
- Modify: `frontend/src/components/LiveGameScreen.test.tsx`

**Interfaces:**
- Consumes: `CardFlightOverlay`, `drawPileRef`, `handRef`, and snapshot diffs.
- Produces: Staggered draw flights from draw pile to target hand; staging of incoming hand cards; instant flush on player action.

- [ ] **Step 1: Write the failing test**

```tsx
// in frontend/src/components/LiveGameScreen.test.tsx
it("animates draw flight from draw pile into player hand with staging", async () => {
  // test that when snapshot has new hand cards, draw flights are created from draw pile to hand
});

it("immediately flushes pending flights when player initiates a play action", async () => {
  // test fast-forward mechanism during active stream
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/components/LiveGameScreen.test.tsx -t "animates draw flight"`
Expected: FAIL.

- [ ] **Step 3: Implement draw flights, multi-draw stagger, and fast-forward flush**

- Attach ref to draw pile button (`drawPileRef`).
- Detect new cards drawn in `snapshot.hand` compared to previous snapshot:
  - If previous snapshot was lobby phase, skip flights (initial deal is instant).
  - Otherwise, for each newly added card, calculate flight from `drawPileRef` to bottom hand slot with 60ms stagger.
  - Reveal each drawn card in hand upon flight completion.
- Opponent draws: detect when opponent `cardCount` increases and `drawCount` decreases; animate card back flight from `drawPileRef` to opponent seat.
- Implement `flushFlights()`: whenever `onPlayCard` or draw button is pressed, immediately settle all active flights and reveal all staged cards.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/components/LiveGameScreen.test.tsx`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LiveGameScreen.tsx frontend/src/components/LiveGameScreen.test.tsx
git commit -m "feat: implement draw flights, multi-card stagger, and fast-forward flush"
```

---

### Task 5: Accessibility, Visual Polish & Full Test Suite Verification

**Files:**
- Modify: `frontend/src/components/GameBoard.tsx`
- Modify: `frontend/src/index.css`
- Verify: Full test suite, TypeScript check, and production build.

- [ ] **Step 1: Verify reduced motion handling**

- Verify `window.matchMedia('(prefers-reduced-motion: reduce)')` is respected in `CardFlightOverlay` (duration set to 0s / immediate resolution).
- Add test in `CardFlightOverlay.test.tsx` for reduced motion mode.

- [ ] **Step 2: Run all frontend tests and typechecks**

Run: `bun run check`
Expected: `bun run test` (all tests pass) and `bun run build` (tsc and vite build pass).

- [ ] **Step 3: Run backend test suite to verify no regressions**

Run: `bun run test` in `backend`
Expected: ALL backend tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/GameBoard.tsx frontend/src/components/CardFlightOverlay.tsx frontend/src/components/CardFlightOverlay.test.tsx
git commit -m "chore: verify reduced motion, clean build and full test suite passing"
```
