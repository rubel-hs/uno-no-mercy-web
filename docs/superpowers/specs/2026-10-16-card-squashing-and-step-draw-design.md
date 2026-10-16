# UNO No Mercy: Hand Squashing, Name Bar Card Count & Step-by-Step Draw Design

## Objective

Enhance the player interface and turn suspense in UNO Show 'Em No Mercy by addressing three core UX problems:
1. **Dynamic Hand Squashing:** Hands with large card counts (up to the 24-card Mercy limit) become unreadable and clip off-screen. Hand spacing will dynamically calculate negative card margins so that the top-left rank/number and color badge always remain visible and hoverable.
2. **Name Strip Total Cards & Mercy Warning:** Display the player's live card count directly on the name strip bar for both the viewer and opponents, adding visual alerts as players near the 25-card Mercy elimination limit.
3. **Interactive Step-by-Step Drawing & Auto-Throw:** Replace instantaneous batch draws for both Wild Color Roulette and Draw-Until-Playable with a suspenseful, click-by-click deck draw experience. Non-matching cards slide into hand one by one; once the target playable/matching card is revealed, it highlights and is automatically thrown onto the discard pile.

---

## 1. Dynamic Hand Squashing

### Problem
In `PlayerSeat.tsx` and `index.css`, cards in `.player-seat--bottom .player-seat__hand` use a static margin offset (`calc(var(--card-w) * -.42)`). When a player holds 12+ cards (and up to 24), the cards spread beyond viewport bounds or overlap so tightly that the top-left index (number, symbol, and color identity) is obscured.

### Solution & Layout Algorithm
1. **Dynamic Negative Margin Calculation:**
   Instead of fixed CSS margin, compute card overlap dynamically based on current hand size ($N$) and available hand container width ($W_{\text{container}}$, standard max-width ~860px to 960px):
   - For $N \le 7$: use default standard overlap (`-35px` to `-42px`).
   - For $N > 7$: compute the overlap needed to fit all $N$ cards into $W_{\text{container}}$:
     $$\text{overlap} = \min\left(W_{\text{card}} - W_{\text{min-badge}}, \max\left(\text{minOverlap}, \frac{N \times W_{\text{card}} - W_{\text{container}}}{N - 1}\right)\right)$$
   - $W_{\text{min-badge}}$ is fixed at 34px–36px. This guarantees that the leftmost 34px (which contains the card's top-left rank number or symbol and color edge) is always exposed.
2. **Hover & Focus Elevation:**
   When a player hovers or focuses on any card in the squashed hand:
   - Elevate the card with `transform: translateY(-24px) scale(1.08)`.
   - Set `z-index: 50` so the full card face lifts completely above adjacent overlapping cards.
   - Smooth CSS transition (`0.15s ease`) prevents jitter when moving the mouse across the hand.
3. **Opponent Hands:**
   Opponent seats display card backs capped at 7 cards (`Math.min(count, 7)`); their hands do not need squashing beyond current layouts, but their total card counts will be clearly displayed on their name strips.

---

## 2. Name Strip Total Cards & Mercy Alert

### Placement & Visual Hierarchy
In `PlayerSeat.tsx`, the `.player-seat__meta` bar displays player identity, current player label, and cumulative match points. We add a live card count badge between the player identity and the score.

### Badge Design & States
1. **Standard State (< 20 cards):**
   - Pill badge: `🂠 {count} / 25 CARDS` (viewer seat) and `🂠 {count} / 25` (opponent seats).
   - Semi-transparent background with muted white/silver border (`rgba(255, 255, 255, 0.15)`).
2. **Mercy Warning State ($\ge 20$ cards):**
   - When a player reaches 20 or more cards, they are within 5 cards of instant elimination.
   - The badge transitions to an urgent hazard state:
     - Background: `rgba(220, 44, 27, 0.35)`.
     - Border: `1px solid rgba(255, 75, 53, 0.7)`.
     - Text: `#ff6854` with subtle pulse animation (`@keyframes mercy-pulse`).
     - Text content: `⚠️ {count} / 25 CARDS`.
3. **Accessibility:**
   - The seat's `aria-label` incorporates the count: `"[Name], [Points] points, [Count] cards..."`.

---

## 3. Step-by-Step Drawing & Auto-Throw

### Scenarios
1. **Draw-Until-Playable:**
   - Triggers when the active player has no playable cards on their turn.
   - The draw pile highlights with a prompt ("Click to draw").
   - Each click draws one card from the draw pile:
     - If the card is not playable: it slides face-up into the player's hand with dynamic squashing. The prompt remains active.
     - If the card IS playable: it pauses in center for ~0.4s with a golden/white highlight halo, then automatically animates onto the discard pile (`auto-throw`).
     - The played card's action resolves (e.g. wild color choice dialog if wild, reverse, skip, etc.) and turn advances.
2. **Wild Color Roulette:**
   - Triggered when an opponent plays Wild Color Roulette.
   - The victim first chooses a color via `GameChoiceDialog` (`choose-roulette-color`).
   - The victim then clicks the draw pile card-by-card:
     - Each card drawn that does not match the chosen color slides into their hand.
     - The first card matching the chosen color is revealed in the center with a highlight, then automatically thrown onto the discard pile to establish the new top discard and active color.
   - Card Action Resolution Decision:
     - In Wild Color Roulette, the auto-thrown card is discarded to conclude the roulette draw penalty, ending the victim's turn without triggering cascading action effects (e.g. 7 swaps or skips), preventing unfair double-punishment while honoring the auto-throw visual and discard update.
     - In Draw-Until-Playable, because this was the player's natural turn play, full card effects (actions, skips, swaps) resolve normally.
3. **Mercy Elimination During Draw:**
   - If the player accumulates 25 cards before hitting the target card, the draw sequence terminates immediately, and the Mercy elimination banner triggers.

### Synchronization & Multiplayer Concurrency
- **Multiplayer Integrity:**
  - The server holds the active player's turn state during the draw interaction. Subsequent players cannot act prematurely until the final card is thrown and the turn officially transfers.
  - As cards are drawn, the server broadcasts card-drawn transitions so opponents' tables reflect the card count increase and suspense live.
  - A safety inactivity timeout (15 seconds) automatically completes remaining draws if a player disconnects or stalls mid-draw.

---

## 4. Non-Goals & Anti-Goals

- **Non-Goals:**
  - Changing the standard `draw-and-pass` action (when a player already holds a playable card and chooses to draw 1 card and pass, that remains a single draw-and-pass).
  - Changing stacking penalty draws (stacked draw cards are penalty draws, drawn in batch according to existing penalty rules).
- **Anti-Goals:**
  - Do not introduce multi-second unskippable animations that slow the game to a crawl. The suspense pause is kept snappy (~0.4s).
  - Do not let cards shrink in height or aspect ratio; squashing is purely horizontal overlap so card artwork and numbers maintain crisp fidelity.

---

## 5. Implementation Boundaries & Calls Left to Builder

1. **Card Squashing Component Integration:**
   - Compute squashing in `PlayerSeat.tsx` dynamically via inline style `marginLeft` on `.player-seat__card + .player-seat__card` based on `visibleCards.length` and container constraints.
2. **Draw Stage Machine in `LiveGameScreen.tsx`:**
   - Maintain a local reveal queue state when a draw sequence is in progress.
   - While `drawQueue.length > 0`, the draw pile shows an active pulse cursor. Clicking deck advances `drawQueueIndex`.
   - When reaching the final playable/matching card, trigger the auto-throw animation and commit the final discard.
3. **Backend `choose-roulette-color` Auto-Play:**
   - In `backend/src/modules/game/game.engine.ts`, update `choose-roulette-color` resolution so that the final matching card is discarded onto the discard pile (updating `topDiscard` and `activeColor`) rather than staying in the victim's hand.
