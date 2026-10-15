# Authoritative Multiplayer Game Design

## Objective

Turn the existing UNO Show 'Em No Mercy visual prototype into a playable private-room game for two to six human players using separate browsers.

The Bun/Hono backend will own all room, player, and game state in memory. It will validate and resolve every game action according to `GAME_RULES.md`, then send each browser a player-specific view of the authoritative state. No database, bots, accounts, matchmaking, spectators, or cross-restart recovery are required.

Success means players can create or join a room, start and finish a complete rules-correct game, disconnect and reconnect within the defined grace period, and leave without abandoned room data remaining in server memory.

## Architecture

The existing repository remains split into independently deployable frontend and backend applications:

- The React frontend handles room forms, lobby presentation, player input, reconnect behavior, and rendering.
- The Bun/Hono backend handles room lifecycle, player identity, command validation, hidden information, turn sequencing, and all game rules.
- REST endpoints create and join rooms.
- One WebSocket connection per player carries gameplay commands, state snapshots, and connection events.

The backend must run as a single process and a single deployment instance because the room store is process-local. Restarting or redeploying the backend intentionally ends all active rooms.

### Backend components

The backend will keep focused modules with narrow responsibilities:

- **Card manifest and deck factory:** Defines card faces, multiplicities, unique physical card IDs, deck creation, and shuffle behavior.
- **Pure game engine:** Accepts a game state and a validated command, applies one deterministic transition, and returns the next state plus domain events.
- **Player view projector:** Converts authoritative state into a personalized snapshot that exposes the recipient's cards while exposing only opponent card counts.
- **Room store:** Owns room codes, player tokens, lobby state, game state, connections, reconnect deadlines, timers, and cleanup.
- **Room routes:** Create and join rooms, validate input, and return a room code plus private player token.
- **Realtime gateway:** Authenticates WebSocket upgrades, serializes commands per room, rejects invalid input, and broadcasts personalized results.

### Frontend components

The frontend will add:

- A typed room API client.
- A typed WebSocket protocol client with reconnect handling.
- A session controller that stores the room code and player token in `sessionStorage`.
- Create-room, join-room, and lobby interfaces connected to the existing home actions.
- A live-game container that maps server snapshots and pending choices onto the existing game board.
- Small dialogs or overlays for choosing a color or swap target.

The existing frontend-only dev mode remains isolated and continues to render static fixtures without requiring the backend.

## Cards and Deck

The deck contains exactly 168 physical card instances:

| Family | Multiplicity | Total |
| --- | ---: | ---: |
| Numbers 0–9 | Two of each number in each of four colors | 80 |
| Skip | Three per color | 12 |
| Reverse | Three per color | 12 |
| Draw 2 | Three per color | 12 |
| Discard All | Three per color | 12 |
| Colored Draw 4 | Two per color | 8 |
| Skip Everyone | Two per color | 8 |
| Wild Reverse Draw 4 | Eight | 8 |
| Wild Color Roulette | Eight | 8 |
| Wild Draw 6 | Four | 4 |
| Wild Draw 10 | Four | 4 |

There is no basic Wild card or conventional Wild Draw 4 in this deck. The current frontend catalog must be corrected so its logical definitions match the physical No Mercy deck and existing artwork.

Each physical card receives an opaque instance ID distinct from its reusable face definition. Tests can inject a seeded or fixed shuffle while production uses an unbiased random shuffle.

## Authoritative Game State

The server state includes:

- Room and game identifiers.
- Ordered players with connection and elimination state.
- Private hands containing physical card instance IDs.
- Draw and discard piles.
- Current turn, play direction, active color, and turn counter.
- Pending draw stack value and the value of the most recently stacked card.
- Pending mandatory decision, including color, swap target, or roulette choice.
- UNO vulnerability and the command boundary at which it expires.
- Winner and completion status.
- A monotonically increasing state revision.

The engine uses explicit phases so unrelated commands cannot run while a mandatory decision is pending. Every accepted transition increments the revision. Commands include a unique command ID and the revision on which the client acted, allowing the server to reject duplicates and stale actions safely.

## Setup and Turn Flow

The host may start when two to six players are in the lobby. Joining closes once the game starts.

The server shuffles the complete deck, deals seven cards to every player, and flips cards into the discard pile until a non-action card becomes the top card. Ignored setup action cards remain in the discard pile. A randomized dealer determines the first player to the dealer's left, and play begins clockwise.

On a normal turn, a card is playable when it matches the top discard by color, number, or symbol. Wild action cards are playable regardless of the current color. The server rejects attempts to pass or draw while a legal card exists.

When no card in the active hand is playable, one command draws cards until a playable card appears and immediately plays it. If the drawn card requires a player choice, the automatic play transitions into the corresponding pending-choice phase before the turn can continue.

## Rule Resolution

### Draw stacking

Draw 2, colored Draw 4, Wild Draw 6, Wild Draw 10, and Wild Reverse Draw 4 participate in stacking. While a penalty is pending, the active player may stack only a draw card whose printed value is equal to or greater than the most recently played draw card. Color and symbol matching do not constrain a legal stack.

If the player cannot or chooses not to stack, they take the full accumulated penalty and lose their turn. Mercy elimination is evaluated during the draw. The penalty then clears and play advances to the next eligible player.

### Colored and wild action cards

- **Draw 2 / Draw 4:** Starts or extends the pending draw penalty.
- **Skip:** Advances past the next eligible player.
- **Reverse:** Reverses direction. With two active players, it skips the opponent and returns play to the player who used it.
- **Discard All:** Discards every remaining card in the player's hand that matches the action card's color. Extra cards are placed beneath the Discard All card so it remains the visible top discard.
- **Skip Everyone:** Keeps the turn with the player who used it.
- **Wild Draw 6 / Draw 10:** The player chooses the continuing color and starts or extends the corresponding penalty.
- **Wild Reverse Draw 4:** Reverses direction, chooses the continuing color, and applies a four-card penalty to the next player in the new direction. The official two-player exception applies: the card skips the opponent and directs the penalty back to its user, who may stack an equal-or-higher draw card.
- **Wild Color Roulette:** The next eligible player chooses a color. The server reveals cards until a non-wild card of that color appears, adds every revealed card to that player's hand, evaluates Mercy elimination, and skips that player's turn.

### Special number rules

- Playing a 7 requires selecting another active player and swaps the two complete hands.
- Playing a 0 passes every active player's hand to the next active player in the current direction.
- Mercy elimination is checked after hand swaps or passes.

### UNO and winning

When a player reaches one card, they may declare UNO as part of the play command or immediately afterward. If they have not declared it, the player is vulnerable until the next player begins a valid gameplay action. Any other active player may submit a catch command during that window, causing the offender to draw two cards. Accepted commands are serialized by the server, so competing UNO and catch actions have an unambiguous order.

A player wins immediately when their accepted play empties their hand, including through Discard All. That terminal win takes precedence over any remaining effect on the final card. A player also wins when every opponent has been eliminated.

If the draw pile empties, the server preserves the visible top discard and shuffles the remaining discard pile into a new draw pile. In accordance with `GAME_RULES.md`, cards belonging to Mercy-eliminated players are removed from the game rather than returned to the reshuffle.

## Room and Player Lifecycle

Creating a room returns a short unique room code and an unguessable player token. Joining requires the room code and a display name. Names must be non-empty, length-limited, normalized for comparison, and unique within the room.

The browser keeps the room code and token in `sessionStorage`, which permits refresh recovery in the same browser tab without creating a second seat. The token is never broadcast to other players.

Before play, an intentional host departure transfers host authority to the next player. An intentionally departing player is removed from the lobby. An empty lobby is deleted immediately.

During play, an intentional leave eliminates the player immediately. Their cards follow the same removal behavior as Mercy elimination. If their departure leaves one active player, that player wins.

An unexpected WebSocket closure marks the player offline and starts a 50-second grace period. The client attempts reconnection ten times at five-second intervals. A valid reconnect restores the existing seat and private hand, cancels the expiry timer, replaces any stale socket, and sends a fresh personalized snapshot.

When the grace period expires, the player is eliminated. If it was their turn, the server advances to the next active player after clearing or resolving any pending interaction that can no longer complete. Winner detection runs after elimination.

A completed room remains only while at least one player is connected or inside their reconnect grace period. It is deleted once all players intentionally leave or all remaining grace periods expire. Timers are cancelled when their room is deleted.

## Protocol and Data Flow

REST provides room setup:

- `POST /api/rooms` creates a room and its host player.
- `POST /api/rooms/:roomCode/players` joins an open room.

The WebSocket endpoint authenticates with the room code and private player token. After connection it sends the latest personalized snapshot. Client messages use a versioned envelope containing a command ID, expected revision, command type, and command-specific payload.

Gameplay commands cover starting, playing a card, drawing until playable, accepting a stacked penalty, choosing colors, choosing a swap target, declaring UNO, catching UNO, and leaving. Mandatory choices may be collected by the frontend before the play command when the choice is known to the acting player. Roulette remains a separate command because the affected next player makes that choice.

Server responses are one of:

- A personalized state snapshot for accepted state changes or synchronization.
- A structured command rejection with a stable error code and safe message.
- A connection/lifecycle event such as reconnecting player, player eliminated, or room closed.

Only safe public information is projected into snapshots. Opponent card identities, draw-pile order, other players' tokens, and server timers are never exposed.

## Frontend Behavior

The existing home actions open create and join flows. After success, players enter a lobby showing room code, host, player list, and online state. Only the host sees an enabled start control, and only when the player count is valid.

In the live game:

- The local player always occupies the bottom seat.
- Opponents are distributed across top, side, and upper-corner positions for two to six players while preserving the existing four-player layout where possible.
- The local hand shows actual card faces; opponent seats show card backs and counts.
- Legal cards are interactive and illegal cards are visibly disabled.
- The draw pile is interactive only when the rules permit drawing.
- During a stack, the control rail shows the accumulated amount and offers legal stack cards or a `Take +N` action.
- Wild and 7 plays open the required choice interface before submission.
- Roulette opens a color choice for the affected player.
- The UNO control declares UNO for the local player and changes to a catch action when an opponent is vulnerable.
- Turn, direction, active color, draw count, stack total, connection state, elimination, and winner are derived from the server snapshot.

During reconnect attempts, the board remains visible but read-only and shows the current attempt. After ten failed attempts, the client reports that the seat was forfeited and returns to the home screen. A stale-state rejection triggers a fresh snapshot before another action is allowed.

## Errors, Concurrency, and Security

Each room serializes commands to prevent simultaneous state mutations. The server validates message shape, token ownership, room membership, game phase, expected revision, command ID, active turn, card ownership, card legality, and choice legality before mutation.

Expected failures return stable error codes for invalid room codes, duplicate names, full or started rooms, bad tokens, stale revisions, duplicate commands, invalid turns, illegal cards, unavailable choices, and closed rooms. Unexpected backend errors are logged server-side and return a generic message without stack traces.

Room codes are convenience identifiers rather than authentication secrets. Player tokens carry seat authority and must be generated with cryptographically secure randomness. CORS and WebSocket origin checks use the configured frontend origins.

## Testing and Verification

The engine will be tested as pure deterministic state transitions with injected shuffle, ID, and clock behavior. Backend coverage includes:

- The exact 168-card manifest and setup behavior.
- Every normal matching rule and action-card effect.
- Draw stacking thresholds and accumulated penalties.
- Two-player Reverse and Wild Reverse Draw 4 behavior.
- 0-pass, 7-swap, Discard All, Skip Everyone, Roulette, Mercy elimination, reshuffling, UNO timing, and both win conditions.
- Invalid, duplicate, stale, and out-of-turn commands.
- Player-specific projection and prevention of hidden-hand leakage.
- Lobby limits, host transfer, reconnect recovery, expiry elimination, turn recovery, timer cleanup, and room deletion.
- REST and WebSocket protocol contracts.

Frontend Vitest coverage includes room forms, lobby controls, legal-card affordances, mandatory-choice interfaces, UNO/catch controls, state-driven board rendering, reconnection attempts, and structured error recovery. Existing dev-mode visual tests remain intact.

Completion requires the backend and frontend checks, TypeScript compilation, production frontend build, and a manual two-browser smoke game that covers room creation, join, start, a legal play, an invalid play rejection, reconnect, leave, and final room cleanup.

## Explicitly Out of Scope

- Computer-controlled players.
- User accounts or profiles.
- Public matchmaking.
- Spectators or chat.
- Database or distributed cache persistence.
- Recovery after backend restart or deployment.
- Optional multi-round scoring to 1,000 points.
- Multiple backend instances or horizontal scaling.
- Production infrastructure changes.
