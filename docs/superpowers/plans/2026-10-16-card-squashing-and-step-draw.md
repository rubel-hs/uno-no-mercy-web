# Hand Squashing, Name Bar Count, and Step-by-Step Draw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix hand card clipping via dynamic squashing, display live card counts with Mercy warnings on player name bars, and implement interactive click-by-click drawing with auto-throw for Draw-Until-Playable and Wild Color Roulette.

**Architecture:** Frontend calculates dynamic horizontal negative margins in `PlayerSeat` based on hand size to guarantee visible 34px corner badges. Player name bars render live card count badges with animated danger pulses when approaching 25 cards. The backend game engine updates `choose-roulette-color` to place the final matching card on the discard pile. `LiveGameScreen` orchestrates an interactive step-by-step click reveal queue with auto-throw animation.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Motion (motion/react), Bun, Bun Test.

**Spec:** `docs/superpowers/specs/2026-10-16-card-squashing-and-step-draw-design.md`

## Global Constraints

- Do not alter card height or aspect ratio; squashing is strictly horizontal overlap.
- Ensure the top-left index (number/symbol and color identity) retains at least 34px visible width on every card.
- Player name strip must show live count for all seats, triggering hazard styling at $\ge 20$ cards (Mercy limit is 25).
- In Wild Color Roulette, the auto-thrown card updates the top discard and active color to end the turn without triggering secondary action effects.
- In Draw-Until-Playable, the auto-thrown card resolves standard play card effects.
- Keep tests deterministic without timing flakes; use mock timers or explicit step assertions where animation timeouts occur.

## Review Focus

- Hand squashing must preserve at least 34px visible left margin even with 24 cards in hand; test in Task 1.
- Hovering any squashed card must lift it above neighboring cards via z-index without jitter; test in Task 1.
- Name bar card badge must show standard styling below 20 cards and switch to pulsing danger alert at 20–24 cards; test in Task 2.
- `choose-roulette-color` on the backend must discard the final matching card to `topDiscard` and not leave it in the hand; test in Task 3.
- Step-by-step drawing must require user deck clicks per card and trigger auto-throw on the final qualifying card; test in Task 4.

---

### Task 1: Implement Dynamic Hand Squashing in `PlayerSeat` & CSS

**Files:**
- Modify: `frontend/src/components/PlayerSeat.tsx`
- Modify: `frontend/src/index.css`
- Create: `frontend/src/components/PlayerSeat.test.tsx`

**Interfaces:**
- `PlayerSeatProps`: already receives `cards`, `cardIds`, `count`, `orientation`, `position`.
- Dynamic offset formula:
  $$\text{marginOffset} = -\min(W_{\text{card}} - 34, \max(35, ((N \times W_{\text{card}}) - W_{\text{container}}) / (N - 1)))$$
- Injected via CSS variable `--dynamic-card-overlap` or inline `marginLeft` style on `.player-seat__card + .player-seat__card`.

- [ ] **Step 1: Write failing tests in `PlayerSeat.test.tsx`** asserting:
  - For $N \le 7$, card overlap uses standard baseline margin (approx -35px to -42px).
  - For $N = 18$ and $N = 24$, card overlap increases dynamically so total width fits within container, but visible card portion does not drop below 34px.
  - Hovering a card applies elevation class/styles.
- [ ] **Step 2: Run focused test**
  Run: `bun run --cwd frontend test src/components/PlayerSeat.test.tsx`
  Expected: FAIL because dynamic overlap is not yet implemented.
- [ ] **Step 3: Implement dynamic card squashing in `PlayerSeat.tsx` and hover rules in `index.css`**
  - Compute `cardOverlap` based on `visibleCards.length` and pass as inline style `marginLeft` on non-first cards (or `--dynamic-card-overlap`).
  - Add CSS hover elevation (`transform: translateY(-24px) scale(1.08); z-index: 50;`) to `.player-seat--bottom .player-seat__card:hover`.
- [ ] **Step 4: Run focused test**
  Run: `bun run --cwd frontend test src/components/PlayerSeat.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/PlayerSeat.tsx frontend/src/index.css frontend/src/components/PlayerSeat.test.tsx
  git commit -m "feat: implement dynamic card squashing in player hand"
  ```

---

### Task 2: Display Live Card Count and Mercy Warning on Name Strip Bar

**Files:**
- Modify: `frontend/src/components/PlayerSeat.tsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/PlayerSeat.test.tsx`

**Interfaces:**
- In `PlayerSeat.tsx`, inside `.player-seat__identity`:
  - Render a `.player-seat__count-badge` showing `🂠 {count} / 25 CARDS` for bottom viewer, and `🂠 {count} / 25` for opponents.
  - Apply `is-danger` class when `count >= 20`.

- [ ] **Step 1: Add failing tests in `PlayerSeat.test.tsx`** asserting:
  - Card count badge is rendered with correct count text.
  - When `count < 20`, standard badge styling is present.
  - When `count >= 20`, `is-danger` class and warning indicator (`⚠️`) are present.
- [ ] **Step 2: Run focused test**
  Run: `bun run --cwd frontend test src/components/PlayerSeat.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Implement card count badge and CSS styling in `PlayerSeat.tsx` and `index.css`**
  - Add the badge element with appropriate conditional classes and aria-label updates.
  - Add `.player-seat__count-badge` CSS and `@keyframes mercy-pulse` for the danger state.
- [ ] **Step 4: Run focused test**
  Run: `bun run --cwd frontend test src/components/PlayerSeat.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/PlayerSeat.tsx frontend/src/index.css frontend/src/components/PlayerSeat.test.tsx
  git commit -m "feat: add card count badge and mercy alert to player name strip"
  ```

---

### Task 3: Backend Engine: Auto-Throw Matching Card in Wild Color Roulette

**Files:**
- Modify: `backend/src/modules/game/game.engine.ts`
- Modify: `backend/src/modules/game/game.engine.test.ts`

**Interfaces:**
- In `applyGameCommand` when `command.type === "choose-roulette-color"`:
  - Cards are drawn one by one into hand until the matching color card is drawn.
  - The final matching card is discarded: pushed to `next.discardPile`, updating `next.activeColor = command.color`, and excluded from the player's final hand.
  - `events.push({ type: "card-played", playerId: command.playerId, cardId: drawn.instanceId })`.
  - Turn advances to the next player.

- [ ] **Step 1: Write failing test in `backend/src/modules/game/game.engine.test.ts`** asserting:
  - In `choose-roulette-color`, drawn non-matching cards stay in hand.
  - The final matching card is on top of `discardPile`.
  - The matching card is NOT in the player's hand.
  - Turn advances.
- [ ] **Step 2: Run focused test**
  Run: `bun test backend/src/modules/game/game.engine.test.ts`
  Expected: FAIL (because previously the matching card was left in the hand).
- [ ] **Step 3: Update `choose-roulette-color` resolution in `game.engine.ts`**
  - Do not push the final matching card into `player.hand`.
  - Push it onto `next.discardPile` and set `next.activeColor = command.color`.
  - Record `card-played` event for the thrown card.
- [ ] **Step 4: Run focused test and game test suite**
  Run: `bun test backend/src/modules/game/game.engine.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add backend/src/modules/game/game.engine.ts backend/src/modules/game/game.engine.test.ts
  git commit -m "fix(game): auto-throw matching card to discard in wild color roulette"
  ```

---

### Task 4: Interactive Step-by-Step Drawing & Auto-Throw in Frontend

**Files:**
- Modify: `frontend/src/components/LiveGameScreen.tsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/LiveGameScreen.test.tsx`

**Interfaces:**
- Draw Stage State in `LiveGameScreen.tsx`:
  - `drawRevealQueue`: stores the sequential cards to be revealed by clicks.
  - `activeDrawStep`: index of the currently drawn card.
  - When `drawQueue` is active, clicking the draw pile increments `activeDrawStep` and reveals the card into the visible hand.
  - When reaching the final playable or roulette-matching card:
    - Display brief highlight animation (`.pile--discard .is-auto-thrown` or center popover).
    - Auto-throw card to discard pile after ~0.4s and commit the new state.

- [ ] **Step 1: Write failing tests in `LiveGameScreen.test.tsx`** asserting:
  - When a draw is initiated, the draw pile invites click-by-click drawing.
  - Clicking the draw pile steps through the drawn cards.
  - The final qualifying card triggers auto-throw and concludes the turn.
- [ ] **Step 2: Run focused test**
  Run: `bun run --cwd frontend test src/components/LiveGameScreen.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Implement step-by-step drawing and auto-throw animation in `LiveGameScreen.tsx` and `index.css`**
  - Add draw queue management in `LiveGameScreen`.
  - Add prompt visual on the draw pile ("Click to draw").
  - Connect auto-throw sequence with brief suspense highlight before advancing.
- [ ] **Step 4: Run focused test**
  Run: `bun run --cwd frontend test src/components/LiveGameScreen.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/LiveGameScreen.tsx frontend/src/index.css frontend/src/components/LiveGameScreen.test.tsx
  git commit -m "feat: implement interactive step-by-step draw and auto-throw"
  ```

---

### Task 5: End-to-End Test Suite & Build Verification

**Files:**
- Test: all backend tests
- Test: all frontend tests
- Build: frontend production build

- [ ] **Step 1: Run all backend tests**
  Run: `bun test`
  Expected: ALL PASS.
- [ ] **Step 2: Run all frontend tests**
  Run: `bun run --cwd frontend test --run`
  Expected: ALL PASS.
- [ ] **Step 3: Run frontend typecheck and build**
  Run: `bun run --cwd frontend typecheck && bun run --cwd frontend build`
  Expected: Build succeeds with 0 errors.
- [ ] **Step 4: Commit any integration polish**
  ```bash
  git add -A
  git commit -m "chore: verify test suite and build output"
  ```
