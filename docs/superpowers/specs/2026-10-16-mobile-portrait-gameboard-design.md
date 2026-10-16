# Mobile Portrait Gameboard Design

## Objective

Deliver a dedicated, responsive mobile portrait layout for the UNO Show 'Em No Mercy gameboard (`LiveGameScreen` and `GameBoard`) on branch `chore/mobile-responsive`. When players join or play the game on mobile smartphones in portrait orientation, the board reorganizes into a fluid vertical layout that maximizes play area, keeps opponent statuses glanceable at the top, places the draw/discard piles centrally, and anchors the player hand and critical action buttons within easy thumb reach.

---

## 1. Intent & The Why

UNO No Mercy is an intense, fast-action party card game. Mobile players expect to pick up their phones and play comfortably one-handed or two-handed in vertical (portrait) orientation without being forced to rotate their devices or squint at tiny, cramped elements.

On desktop, the classic 4-sided table layout pins opponents along the left, right, and top edges. On a narrow mobile screen (360px–430px wide), that horizontal pinned arrangement causes severe spatial collisions: opponents squeeze the center table into an unplayable sliver, and the player hand cannot fit cleanly.

By reorganizing portrait mobile into three distinct stacked zones:
1. **Top Zone:** Opponent status strip.
2. **Center Zone:** Table play area with draw/discard piles, active color, stack counter, direction, and pass controls.
3. **Bottom Zone:** Active player hand with smooth horizontal scroll and thumb-accessible UNO call button.

Players get a clean, native mobile experience while desktop and wide-screen landscape players retain the full 4-sided table view.

---

## 2. Requirements & Scope

### In-Scope (Goals)

1. **Dedicated Portrait Layout Structure (`LiveGameScreen` & `GameBoard`):**
   - Automatically activates on mobile portrait screens (`@media (max-width: 768px) and (orientation: portrait)` or general mobile widths `max-width: 768px`).
   - Uses modern dynamic viewport units (`100dvh` / `100svh`) to prevent mobile browser address bar clipping.

2. **Top Zone (Opponent Strip):**
   - Renders 1 to 5 opponents in a compact horizontal strip or rail across the top of the table.
   - For each opponent, displays:
     - Player name (truncated gracefully if long).
     - Online / offline connection indicator.
     - Active turn highlight (distinct border/glow when it is that player's turn).
     - Card count badge and mini-card fan / count representation.
     - Score / point total.
     - KO / Eliminated status banner when eliminated under Mercy rules (25+ cards).

3. **Center Zone (Table Play Area):**
   - Prominently positions Draw Pile and Discard Pile.
   - Piles scale proportionally (`clamp(80px, 22vw, 120px)`) to ensure comfortable touch targets (minimum 48px target size).
   - Discard pile displays top discard card, discard echo effect, and stacked power cards (+4, +6, +10) if present.
   - Draw pile displays remaining deck count.
   - Status rail houses:
     - Active stack penalty counter (`+X`) with pulsing accent.
     - Active color indicator circle.
     - Game direction icon.
     - "Pass" turn button or "Take +X" stack acceptance button.

4. **Bottom Zone (Player Hand & Thumb Actions):**
   - Anchors the viewer's hand at the bottom of the screen.
   - Enables smooth horizontal scrolling with touch momentum (`-webkit-overflow-scrolling: touch`) and scroll padding, allowing hands with 7 to 25+ cards to be browsed without table clipping.
   - Playable cards maintain clear visual cues (green border / lift indicator).
   - "Call UNO!" floating action button positioned above or alongside the hand within easy thumb reach.

5. **Animation & Flight Layer Continuity:**
   - Retains full compatibility with `CardFlightOverlay`.
   - Because `getElementCoordinates` dynamically queries `getBoundingClientRect()`, flying card animations (draws, plays, opponent plays) automatically adapt to portrait element locations without coordinate desync.

6. **Modal Dialogs & Overlays Responsiveness:**
   - `GameChoiceDialog` (color picker, 7-0 hand swap target dialog, roulette color picker) adapts cleanly to narrow mobile screens without overflow.
   - Match results screen and reconnecting banner scale cleanly.

### Explicit Non-Goals & Anti-Goals

- **No Landscape Forced Lock:** We do NOT force or lock orientation to landscape with a blocking rotate-device screen. The game must be genuinely playable in portrait.
- **No Degradation of Desktop / Landscape Experience:** Desktop view remains intact with the full table border, scars, and 4-sided seat layout.
- **No Hand Hover/Tilt Animations:** Cards in hand remain static, preserving the Apple-style motion design principles established in the animation spec.
- **No Game Engine / Protocol Changes:** No modifications to websocket messages, backend rules, or scoring logic.

---

## 3. Architecture & Responsive Layout Details

### 3.1 Layout Breakdown

```
+---------------------------------------------------+
|  Header (Room Code, Turn Timer, Sound, Leave)     |
+---------------------------------------------------+
|  TOP ZONE: Opponents Strip                        |
|  [ Player 1: 5 ]  [*Player 2: 7*]  [ Player 3: 2 ] |
+---------------------------------------------------+
|                                                   |
|  CENTER ZONE: Table Play Area                     |
|                                                   |
|      +---------+      +---------+                 |
|      |  DRAW   |      | DISCARD |  [ Status Rail ]|
|      |  (42)   |      | (Red 7) |  [ Color/Dir/  ]|
|      +---------+      +---------+  [ Stack/Pass ] |
|                                                   |
+---------------------------------------------------+
|  [ UNO! Button ]                                  |
|  BOTTOM ZONE: Player Hand                         |
|  < [Card 1] [Card 2] [Card 3] [Card 4] ... >      |
+---------------------------------------------------+
```

### 3.2 CSS Responsive Strategy

1. **Root & Board Height:**
   ```css
   .game-table {
     height: calc(100dvh - 100px);
     min-height: 560px;
   }
   ```
2. **Portrait Media Query:**
   ```css
   @media (max-width: 768px) and (orientation: portrait), (max-width: 600px) {
     /* Switch table to flex column or grid layout */
     .game-table {
       display: flex;
       flex-direction: column;
       justify-content: space-between;
       padding: 8px;
       height: calc(100dvh - 72px);
     }
   }
   ```
3. **Opponent Strip:**
   - In portrait mode, `.player-seat--top`, `.player-seat--left`, `.player-seat--right`, `.player-seat--top-left`, `.player-seat--top-right` reset absolute positioning.
   - Rendered inside an `.opponents-strip` flex container at the top of `.game-table`, with `flex-direction: row`, `overflow-x: auto`, and compact badges.
4. **Center Area:**
   - `.table-center` takes `flex: 1` in portrait mode, centering `.play-zone` and `.game-status-rail` with compact gaps.
5. **Player Hand:**
   - `.player-seat--bottom` occupies the bottom flex row.
   - Hand container `.player-seat__hand` allows horizontal scrolling with `overflow-x: auto` and scrollbar hidden for a clean app feel.
   - Individual cards scale with `clamp(68px, 19vw, 92px)`.

---

## 4. Edge Cases & Builder Decisions

1. **Large Hand Sizes (No Mercy High Stacks):**
   - In Uno No Mercy, players can accumulate 15–24 cards before being eliminated at 25.
   - In portrait mode, negative card margin squashing alone would render 20 cards unreadable.
   - **Decision:** Use horizontal scrolling container for player hand with scroll snapping and momentum on mobile, ensuring cards stay legible and tap targets remain accurate.
2. **Opponent Count Variations (1 to 5 Opponents):**
   - For 1 opponent: Centered at top.
   - For 2–3 opponents: Evenly spaced across the top strip.
   - For 4–5 opponents: Compact flex with horizontal scroll or auto-wrapping strip so no opponent is cut off.
3. **UNO Call Button Placement:**
   - On desktop, `.uno-button` is fixed on the right table edge.
   - In portrait mode, placing it fixed might cover cards or center piles.
   - **Decision:** Position the UNO button floating just above the player hand on the right side, so the right thumb can quickly tap it without reaching to the top or middle of the screen.
4. **Header Navigation on Mobile:**
   - Game header bar (`.game-header`) should collapse secondary info (e.g. detailed room info) to maintain table vertical real estate.

---

## 5. Verification & Acceptance Criteria

1. **Visual & Responsive Verification:**
   - Chrome / Safari mobile device emulation: iPhone 14/15/16 Pro (393x852), Pixel 7 (412x915), iPhone SE (375x667).
   - Layout does not overflow horizontally (no horizontal screen jank).
   - All 3 zones (Opponents, Center Table, Hand) are visible simultaneously without vertical scrolling of the entire page.
2. **Interactive Gameplay Verification:**
   - Cards in hand can be scrolled horizontally and selected/played with a tap.
   - Draw pile is tappable to draw.
   - "Pass" and "Take +X" buttons are clearly clickable.
   - "Call UNO" button pulses and registers clicks.
3. **Flight Animation Verification:**
   - Thrown cards fly smoothly from hand to discard pile in portrait mode.
   - Drawn cards fly smoothly from draw pile into hand.
   - Opponent card plays fly from top strip to discard pile.
4. **Test Suite:**
   - Existing unit and integration tests (`LiveGameScreen.test.tsx`, `App.test.tsx`, `PlayerSeat.test.tsx`) pass cleanly with no regressions.
