# Mobile Portrait Gameboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a dedicated responsive mobile portrait layout for the UNO Show 'Em No Mercy gameboard (`LiveGameScreen` and `GameBoard`) on branch `chore/mobile-responsive`.

**Architecture:** Reorganize the board into three stacked vertical zones on mobile portrait screens: a compact opponent strip across the top, centered draw and discard piles with status rail in the middle, and a horizontally scrollable player hand with thumb-accessible action controls at the bottom. The desktop layout retains its classic 4-sided table view using `display: contents` for the opponent wrapper on wide screens, and the flight animation layer tracks live bounding rects seamlessly.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tailwind CSS / Vanilla CSS (`frontend/src/index.css`), Motion (`motion/react`).

**Spec:** [`docs/superpowers/specs/2026-10-16-mobile-portrait-gameboard-design.md`](file:///c:/Users/rubel/Documents/GitHub/uno-no-mercy/docs/superpowers/specs/2026-10-16-mobile-portrait-gameboard-design.md)

## Global Constraints

- Branch: `chore/mobile-responsive`
- Mobile viewport height must use dynamic viewport units (`100dvh` / `100svh`) to prevent mobile browser navigation bar clipping.
- Do NOT enforce or lock orientation to landscape with a blocking overlay; the game must be genuinely playable in portrait.
- Desktop and wide-screen landscape experience must not be degraded.
- Cards in hand have zero hover elevation, tilt, or idle floating animations.
- No modifications to websocket messages, backend rules, or scoring logic.

## Review Focus

1. **Extreme Hand Size (20+ Cards):** When drawing multiple penalties up to 24 cards, the hand container must remain scrollable without clipping cards or causing table-level overflow.
2. **Opponent Count Scaling (1 to 5 Opponents):** The top opponent strip must scale cleanly whether there is 1 opponent or 5 opponents, with no text wrapping collisions.
3. **UNO Button Placement in Portrait:** The UNO call button must remain visible, clickable, and clear of the center play area and scrollable hand on small screens.
4. **Card Flight Trajectory in Portrait:** Flying cards drawn or played while elements are positioned in portrait mode must accurately track source and target element bounding boxes.
5. **Desktop Layout Regression:** Ensure desktop displays identical 4-sided seat layout with no shifted positioning or broken layout.

---

### Task 1: Opponents Strip Container & PlayerSeat Portrait Card Count

**Files:**
- Modify: `frontend/src/components/PlayerSeat.tsx`
- Modify: `frontend/src/components/LiveGameScreen.tsx`
- Modify: `frontend/src/components/GameBoard.tsx`
- Test: `frontend/src/components/PlayerSeat.test.tsx`
- Test: `frontend/src/components/LiveGameScreen.test.tsx`

**Interfaces:**
- `PlayerSeatProps`: Already includes `count: number`.
- `PlayerSeat`: Renders `.player-seat__card-count` inside `.player-seat__meta` for opponents (`position !== "bottom"`), displaying the numeric card count badge.
- `LiveGameScreen` and `GameBoard`: Wraps opponent seats in `<div className="opponents-strip" aria-label="Opponent players" role="region">`.

- [ ] **Step 1: Write the failing test for opponent card count badge and opponents strip**

In `frontend/src/components/PlayerSeat.test.tsx`, add test:
```tsx
it("renders opponent card count badge for non-bottom seats", () => {
  render(
    <PlayerSeat
      count={9}
      name="Dex"
      orientation="vertical"
      points={40}
      position="left"
    />,
  );
  const badge = screen.getByLabelText("9 cards");
  expect(badge).toBeInTheDocument();
  expect(badge).toHaveTextContent("9");
});
```
In `frontend/src/components/LiveGameScreen.test.tsx`, add test verifying the presence of `.opponents-strip`:
```tsx
it("wraps opponent seats within an opponents-strip container", () => {
  render(
    <LiveGameScreen
      onCommand={vi.fn()}
      onLeaveRoom={vi.fn()}
      snapshot={sampleSnapshot}
    />,
  );
  expect(document.querySelector(".opponents-strip")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test frontend/src/components/PlayerSeat.test.tsx frontend/src/components/LiveGameScreen.test.tsx`
Expected: FAIL due to missing `9 cards` label and `.opponents-strip`.

- [ ] **Step 3: Implement opponent card count badge and wrap opponents in `opponents-strip`**

In `PlayerSeat.tsx`:
Add card count badge in `.player-seat__meta`:
```tsx
{position !== "bottom" && (
  <span className="player-seat__card-count" aria-label={`${count} cards`} title={`${count} cards in hand`}>
    <span className="player-seat__card-count-icon" aria-hidden="true">🂠</span>
    <b>{count}</b>
  </span>
)}
```
In `LiveGameScreen.tsx`:
Wrap the `opponents.map` in:
```tsx
<div className="opponents-strip" aria-label="Opponent players" role="region">
  {opponents.map((player, index) => {
    ...
  })}
</div>
```
In `GameBoard.tsx`:
Wrap Maya, Dex, and Nova in `<div className="opponents-strip" aria-label="Opponent players" role="region">`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test frontend/src/components/PlayerSeat.test.tsx frontend/src/components/LiveGameScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PlayerSeat.tsx frontend/src/components/LiveGameScreen.tsx frontend/src/components/GameBoard.tsx frontend/src/components/PlayerSeat.test.tsx frontend/src/components/LiveGameScreen.test.tsx
git commit -m "feat: add opponents strip container and opponent card count badge"
```

---

### Task 2: Horizontally Scrollable Player Hand with High Card Count Support

**Files:**
- Modify: `frontend/src/components/PlayerSeat.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/components/PlayerSeat.test.tsx`

**Interfaces:**
- `PlayerSeat`: For `position="bottom"`, ensure the hand container `.player-seat__hand` supports scrolling, has role `region` with `aria-label="Your cards"`, and does not truncate high card counts.

- [ ] **Step 1: Write failing test for 20-card hand rendering in player seat**

In `frontend/src/components/PlayerSeat.test.tsx`, add test:
```tsx
it("renders all cards cleanly without truncation when hand size is large (20 cards)", () => {
  const cards = Array.from({ length: 20 }, (_, i) => findCard("blue-0"));
  const cardIds = Array.from({ length: 20 }, (_, i) => `card-${i}`);
  render(
    <PlayerSeat
      active
      cards={cards}
      cardIds={cardIds}
      count={20}
      name="You"
      orientation="horizontal"
      points={0}
      position="bottom"
    />,
  );
  const handContainer = screen.getByRole("region", { name: "Your cards" });
  expect(handContainer).toBeInTheDocument();
  expect(handContainer.querySelectorAll(".player-seat__card").length).toBe(20);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test frontend/src/components/PlayerSeat.test.tsx`
Expected: FAIL with missing region "Your cards".

- [ ] **Step 3: Update `PlayerSeat.tsx` and CSS for scrollable hand**

In `PlayerSeat.tsx`:
Add role and aria-label to `.player-seat__hand` for `position === "bottom"`:
```tsx
<div
  className="player-seat__hand"
  role={position === "bottom" ? "region" : undefined}
  aria-label={position === "bottom" ? "Your cards" : undefined}
  aria-hidden={position !== "bottom" ? "true" : undefined}
>
```
In `frontend/src/index.css`:
Add styles for `.player-seat--bottom .player-seat__hand` to support smooth horizontal scroll and contain oversized hands:
```css
.player-seat--bottom .player-seat__hand {
  max-width: 100vw;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  scroll-behavior: smooth;
  padding: 10px 24px 4px;
}
.player-seat--bottom .player-seat__hand::-webkit-scrollbar {
  display: none;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test frontend/src/components/PlayerSeat.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PlayerSeat.tsx frontend/src/components/PlayerSeat.test.tsx frontend/src/index.css
git commit -m "feat: enable scrollable hand container for large player hands"
```

---

### Task 3: Dedicated Mobile Portrait Responsive CSS Layout

**Files:**
- Modify: `frontend/src/index.css`
- Test: `frontend/src/components/LiveGameScreen.test.tsx`

**Interfaces:**
- Desktop (`min-width: 769px`):
  `.opponents-strip` is `display: contents;`, so desktop seats keep exact absolute coordinates (`.player-seat--top`, `.player-seat--left`, etc.).
- Portrait Mobile (`@media (max-width: 768px) and (orientation: portrait), (max-width: 600px)`):
  - `.game-table` adopts `display: flex; flex-direction: column; justify-content: space-between; height: calc(100dvh - 70px); min-height: 520px; overflow: hidden; padding: 6px 4px;`.
  - `.opponents-strip` becomes `display: flex; flex-direction: row; justify-content: center; align-items: center; gap: 6px; width: 100%; overflow-x: auto; z-index: 10; padding: 4px 6px;`.
  - Opponents in portrait reset absolute positioning (`position: relative; top: auto; left: auto; right: auto; transform: none; flex: 0 0 auto; min-width: 0;`).
  - Opponents mini card backs in portrait are compact or hidden so the opponent badge (`.player-seat__meta`) takes precedence.
  - `.table-center` resets absolute positioning (`position: relative; top: auto; left: auto; transform: none; margin: auto 0; display: flex; align-items: center; justify-content: center; gap: 12px;`).
  - `.pile--draw` and `.pile--discard` scale with `clamp(76px, 20vw, 105px)`.
  - `.uno-button` in portrait floats on the bottom right above the hand (`position: absolute; right: 12px; bottom: clamp(100px, 22vh, 130px); z-index: 20; width: 62px; height: 62px;`).
  - `.player-seat--bottom` occupies the bottom flex row (`position: relative; bottom: auto; left: auto; transform: none; width: 100%;`).

- [ ] **Step 1: Write responsive layout tests in `LiveGameScreen.test.tsx`**

Add tests in `frontend/src/components/LiveGameScreen.test.tsx`:
```tsx
describe("mobile responsive portrait layout", () => {
  it("renders all three key board zones (opponents, center table, player hand)", () => {
    render(
      <LiveGameScreen
        onCommand={vi.fn()}
        onLeaveRoom={vi.fn()}
        snapshot={sampleSnapshot}
      />,
    );
    expect(document.querySelector(".opponents-strip")).toBeInTheDocument();
    expect(document.querySelector(".table-center")).toBeInTheDocument();
    expect(document.querySelector(".player-seat--bottom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Declare UNO" })).toBeInTheDocument();
  });

  it("handles 5 opponents inside opponents-strip without error", () => {
    const fiveOpponentSnapshot = {
      ...sampleSnapshot,
      players: [
        { id: "viewer", name: "You", online: true, eliminated: false, cardCount: 7 },
        { id: "p1", name: "Alice", online: true, eliminated: false, cardCount: 4 },
        { id: "p2", name: "Bob", online: true, eliminated: false, cardCount: 5 },
        { id: "p3", name: "Charlie", online: true, eliminated: false, cardCount: 6 },
        { id: "p4", name: "Dave", online: true, eliminated: false, cardCount: 2 },
        { id: "p5", name: "Eve", online: true, eliminated: false, cardCount: 9 },
      ],
    };
    render(
      <LiveGameScreen
        onCommand={vi.fn()}
        onLeaveRoom={vi.fn()}
        snapshot={fiveOpponentSnapshot}
      />,
    );
    const opponentStrip = document.querySelector(".opponents-strip");
    expect(opponentStrip).toBeInTheDocument();
    expect(opponentStrip?.querySelectorAll(".player-seat").length).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it passes or check baseline**

Run: `bun run test frontend/src/components/LiveGameScreen.test.tsx`

- [ ] **Step 3: Implement CSS styling for `.opponents-strip` and portrait media queries in `index.css`**

Add in `frontend/src/index.css`:
```css
/* Opponent Strip desktop default */
.opponents-strip {
  display: contents;
}

.player-seat__card-count {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 0.65rem;
  font-weight: 800;
  color: #fff;
}
.player-seat__card-count-icon {
  font-size: 0.75rem;
  line-height: 1;
}

/* Dedicated Portrait / Mobile Layout */
@media (max-width: 768px) and (orientation: portrait), (max-width: 600px) {
  .game-table {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    height: calc(100dvh - 70px);
    min-height: 520px;
    padding: 6px 4px 10px;
    overflow: hidden;
  }

  .game-table::before {
    inset: 4px;
    border-radius: 16px;
  }

  .opponents-strip {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 100vw;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding: 4px 8px;
    z-index: 10;
  }
  .opponents-strip::-webkit-scrollbar {
    display: none;
  }

  /* Reset opponent seats from desktop absolute coords */
  .opponents-strip .player-seat {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    transform: none !important;
    flex: 0 0 auto;
    margin: 0;
  }

  .opponents-strip .player-seat__meta {
    min-height: auto !important;
    writing-mode: horizontal-tb !important;
    transform: none !important;
    padding: 4px 8px;
    gap: 6px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.14);
  }

  .opponents-strip .player-seat__hand {
    display: none; /* In compact portrait strip, the card count badge represents the hand */
  }

  /* Center table area */
  .table-center {
    position: relative;
    top: auto;
    left: auto;
    transform: none;
    margin: auto 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(10px, 3vw, 18px);
    width: 100%;
    z-index: 5;
  }

  .play-zone {
    padding: 10px 14px;
    gap: clamp(8px, 2.5vw, 16px);
  }

  .game-card--large {
    --card-w: clamp(74px, 19vw, 98px);
  }

  .game-status-rail {
    min-width: 54px;
    padding: 8px 6px;
    gap: 6px;
  }

  .uno-button {
    position: absolute;
    right: 14px;
    bottom: clamp(110px, 20vh, 150px);
    width: 60px;
    aspect-ratio: 1;
    z-index: 20;
  }

  .player-seat--bottom {
    position: relative;
    bottom: auto;
    left: auto;
    transform: none;
    width: 100%;
    margin-top: auto;
    z-index: 15;
  }

  .player-seat--bottom .player-seat__meta {
    column-gap: 20px;
    padding: 4px 10px;
    margin: 0 auto;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test frontend/src/components/LiveGameScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css frontend/src/components/LiveGameScreen.test.tsx
git commit -m "feat: implement dedicated mobile portrait responsive layout"
```

---

### Task 4: Card Flight Overlay & Coordinate Continuity in Portrait

**Files:**
- Modify: `frontend/src/components/LiveGameScreen.tsx`
- Test: `frontend/src/components/LiveGameScreen.test.tsx`
- Test: `frontend/src/components/CardFlightOverlay.test.tsx`

**Interfaces:**
- `getElementCoordinates`: Uses dynamic `getBoundingClientRect()`.
- When an opponent plays a card from `.opponents-strip`, the query selector `.player-seat[data-player-id="..."]` targets the opponent seat in the top strip, providing accurate source coordinates for the flight animation into the discard pile.
- When the viewer draws or plays a card, source/target rects resolve accurately.

- [ ] **Step 1: Write integration test for flight animation source detection in opponent strip**

In `frontend/src/components/LiveGameScreen.test.tsx`, add test:
```tsx
it("correctly locates opponent seat in opponents-strip for card flight coordinates", () => {
  render(
    <LiveGameScreen
      onCommand={vi.fn()}
      onLeaveRoom={vi.fn()}
      snapshot={sampleSnapshot}
    />,
  );
  const opponentSeat = document.querySelector('.opponents-strip [data-player-id="p1"]');
  expect(opponentSeat).toBeInTheDocument();
  expect(opponentSeat?.closest(".opponents-strip")).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun run test frontend/src/components/LiveGameScreen.test.tsx`
Expected: PASS.

- [ ] **Step 3: Ensure card fallback coordinates work cleanly in portrait**

In `LiveGameScreen.tsx`:
Verify fallback rect values for viewport measurements in `handlePlayCard` and snapshot diff tracking provide reasonable vertical fallbacks if elements are transitioning.

- [ ] **Step 4: Run test suite to verify no regressions**

Run: `bun run test frontend/src/components/CardFlightOverlay.test.tsx frontend/src/components/LiveGameScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LiveGameScreen.tsx frontend/src/components/LiveGameScreen.test.tsx
git commit -m "test: verify card flight coordinate resolution in portrait strip"
```

---

### Task 5: Mobile Dialog Sizing, Polish & Full Build Verification

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/GameChoiceDialog.tsx`
- Test: `frontend/src/components/RoomFlow.test.tsx`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- `GameChoiceDialog`: Sizing on mobile screens (`max-width: calc(100vw - 32px)`), ensuring color choice swatches and player swap target lists fit within mobile viewports without horizontal scrolling or dialog clipping.

- [ ] **Step 1: Write test for mobile dialog responsiveness**

In `frontend/src/components/RoomFlow.test.tsx` or `App.test.tsx`:
Verify dialogs and modal overlays render cleanly without errors when mounted.

- [ ] **Step 2: Add responsive polish to `GameChoiceDialog` and header in `index.css`**

Add CSS rules:
```css
@media (max-width: 600px) {
  .dialog-card {
    width: min(92vw, 420px);
    padding: 20px 16px;
  }
  .color-choice-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
}
```

- [ ] **Step 3: Run full typecheck and build**

Run: `bun run --cwd frontend check` and `bun run check`
Expected: All tests pass (135+ tests) and build succeeds with 0 TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css frontend/src/components/GameChoiceDialog.tsx
git commit -m "polish: optimize modal dialogs for mobile portrait screens"
```
