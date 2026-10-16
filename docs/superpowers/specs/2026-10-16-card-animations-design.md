# Smooth Apple-Style Card Flight & Board Animation Design

## Objective

Deliver clean, Apple-style interactive card movement across the UNO Show 'Em No Mercy game board on branch `future-animation`. When a player draws a card or throws a card into the discard pile, the card glides smoothly between source and destination using refined physical easing and subtle opacity transitions. Cards resting in the player's hand remain completely static with no hover or lift animations.

---

## 1. Intent & The Why

In fast-paced tabletop card games, cards appearing or disappearing instantaneously can feel abrupt and disorienting. A smooth, subtle flight animation provides visual continuity, allowing players to naturally track where cards originate and where they land. 

Following Apple's human interface motion principles:
- **Restraint:** Motion serves orientation and clarity, not decorative excess.
- **Fluid Physics:** Natural deceleration and subtle opacity shifts give cards physical weight without cartoonish bouncing.
- **Responsiveness:** Animations never stall gameplay; durations are kept crisp (260ms–300ms) and can overlap cleanly.

---

## 2. Requirements & Scope

### In-Scope (Goals)
1. **Smooth Throw Animation (Play Card):**
   - When a card is played from the viewer's hand, it animates from its position in hand directly to the center discard pile.
   - The card transitions along a gentle arc, settling onto the discard pile with subtle rotation alignment and smooth opacity.
   - When an opponent plays a card, a card similarly glides from that opponent's seat into the center discard pile.
2. **Smooth Draw Animation (Draw Card):**
   - When a card is drawn from the draw pile, a card emerges from the draw pile and glides across the board into the receiving player's hand.
   - Viewer draws glide into the viewer's bottom hand slot.
   - Opponent draws glide towards the corresponding opponent's seat.
3. **Multi-Card Penalties & Consecutive Draws:**
   - When drawing multiple cards (such as Stacking +4/+6/+10 penalties or Step-by-Step draws), flights are smoothly staggered (50ms–70ms gap) so cards stream naturally into the hand without visual clutter.
4. **Clean Decoupled Flight Layer:**
   - Flying cards render in a dedicated top-level overlay (`CardFlightOverlay`), tracking exact viewport coordinates via `getBoundingClientRect()`. This prevents layout jumps, z-index clipping, or awkward flexbox repositioning in the hand.
5. **Accessibility:**
   - Respects `prefers-reduced-motion`: if active, card animations resolve instantaneously.

### Explicit Non-Goals & Anti-Goals
- **NO Hand Interaction:** As explicitly specified, cards sitting in the player's hand have **zero hover elevation, tilt, or idle floating animations**. Cards in hand remain entirely static.
- **No Heavy Physics / Bouncing:** No spring oscillations, no exaggerated 3D flips, no screen shakes, and no particle sparkles.
- **No Turn Blocking:** Animations must never block the client command queue or freeze user input. If another event arrives, the system handles it without desync.

---

## 3. Motion Architecture & Specifications

### 3.1 Easing & Timing Curves
- **Duration:** 280ms (standard flight), 220ms (during rapid multi-draw stream).
- **Easing Curve:** Cubic bezier `[0.22, 1, 0.36, 1]` (Apple standard ease-out curve).
- **Scale & Opacity:**
  - Starts at `opacity: 0.9` and scales slightly during mid-flight (`scale: 1.04`), easing to `scale: 1` and `opacity: 1` as it lands.
- **Rotation:**
  - Slight natural tilt during flight ($\pm 2^{\circ}$ to $4^{\circ}$) settling to the target orientation of the discard pile or hand fan.

### 3.2 Coordinate Tracking & The Flight Layer
1. **Source & Target Geometry:**
   - **Throw Source:** The DOM element of the card being played (`.player-seat__card` at viewer or opponent seat).
   - **Throw Target:** The center discard pile (`.pile--discard`).
   - **Draw Source:** The center draw pile (`.pile--draw`).
   - **Draw Target:** The player's hand container or opponent's seat indicator.
2. **Execution Flow:**
   - Action triggered (e.g. `onPlayCard` or state snapshot update indicating new top discard or card count change).
   - Flight token registered with `sourceRect` and `targetRect`.
   - `motion.div` rendered within `CardFlightOverlay` at fixed viewport layer (`position: fixed; inset: 0; pointer-events: none; z-index: 1000`).
   - On animation finish, the flight token is pruned from active flight state, leaving the newly arrived card seamlessly rendered in the real DOM.

### 3.3 State Reconciliation & Network Latency
- Optimistic play support: When the viewer clicks a playable card, the throw animation begins immediately towards the discard pile while the command is transmitted to the server.
- Opponent plays: Detected via snapshot diffs (`topDiscard` change accompanied by active player card count decrease).
- Opponent draws: Detected via snapshot diffs (player card count increase and `drawCount` decrease).

---

## 4. Component Boundaries & Responsibilities

1. **`frontend/src/components/CardFlightOverlay.tsx` (New Component):**
   - High-performance fixed overlay managing active card flight instances.
   - Uses `motion` (`motion/react`) for GPU-accelerated transforms (`translate3d`, `rotate`, `scale`, `opacity`).
2. **`frontend/src/components/PlayerSeat.tsx`:**
   - Strictly keeps cards static—ensures no hover translateY/scale rules apply to cards in hand.
   - Exposes element refs or stable data attributes (`data-card-id={cardId}`) so flight origin coordinates can be calculated accurately.
3. **`frontend/src/components/LiveGameScreen.tsx`:**
   - Coordinates flight events between game snapshot updates, user actions, and the overlay manager.
   - Ref targets for `.pile--draw` and `.pile--discard`.
4. **`frontend/src/index.css`:**
   - Remove any remaining hover elevation on hand cards to ensure static presentation.
   - Styling for flight overlay elements.

---

## 5. Verification & Testing Strategy

1. **Unit & Component Tests:**
   - Verify `CardFlightOverlay` mounts and animates cleanly with valid rect coordinates.
   - Verify hand cards have zero hover transform classes or styles.
   - Test snapshot diff detection triggers expected draw and throw flights.
2. **Visual & Interaction Verification:**
   - Play card: Card glides from clicked slot to discard pile without flicker.
   - Draw card: Card glides from draw deck into hand without layout jitter.
   - Opponent play/draw: Cards travel between opponent seats and central piles smoothly.
   - Accessibility check: Verify instant placement when `prefers-reduced-motion` is simulated.
3. **Performance Check:**
   - CSS transforms run on compositor thread (`will-change: transform`).
   - Zero memory leaks: completed animations are immediately unmounted.
