# Authoritative Multiplayer Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing UNO Show 'Em No Mercy board playable by two to six human players in separate browsers through an authoritative, in-memory Bun/Hono server.

**Architecture:** REST creates and joins private rooms; one authenticated WebSocket per player carries versioned commands and personalized snapshots. A deterministic pure game engine owns rules, while a room store owns identity, connection grace periods, command ordering, and cleanup; React renders only server-derived playable state while preserving frontend-only dev mode.

**Tech Stack:** Bun 1.4.x, TypeScript 7, Hono 4.13, native Bun WebSockets through `hono/bun`, React 19, Vite 8, Vitest 5, Testing Library, Motion, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-15-authoritative-multiplayer-game-design.md`

## Global Constraints

- Support two to six human players; do not add bots, accounts, matchmaking, spectators, chat, or database persistence.
- Keep all room and game state in one backend process; a restart intentionally ends every room.
- Use exactly 168 cards with the multiplicities in the spec; there is no basic Wild or conventional Wild Draw 4.
- The server is authoritative for turns, hidden hands, legal actions, mandatory choices, UNO timing, eliminations, and wins.
- Store room credentials only in browser `sessionStorage`; never broadcast a player token or another player's card identities.
- Retry unexpected disconnects ten times at five-second intervals, with a matching 50-second server grace period.
- Trim display names and require 1–24 characters; compare names case-insensitively within a room.
- Use six-character room codes from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` and 32 cryptographically random bytes encoded as base64url for player tokens.
- Reject WebSocket messages larger than 16,384 bytes, cap command IDs at 64 characters, and retain only the newest 256 accepted command IDs per player for duplicate detection.
- Delete empty rooms and cancel their timers; preserve the existing frontend-only dev mode.
- Preserve unrelated and pre-existing working-tree edits, especially the current `frontend/src/App.test.tsx` and `frontend/src/components/GameBoard.tsx` changes.
- Add no production dependency unless an existing platform or framework API cannot satisfy the requirement.

## Review Focus

- Malformed REST or WebSocket input, including non-JSON messages and overlong names, must return a safe structured rejection rather than throw or mutate a room (Tasks 6–8).
- Exhausting the draw pile with zero or one recyclable discard must either rebuild correctly or reject the impossible draw without losing cards (Task 2).
- A disconnect during a pending choice or draw stack must preserve the state during grace, then recover the turn deterministically on expiry (Task 6).
- Racing UNO declarations, catches, duplicate command IDs, and stale revisions must resolve in serialized command order exactly once (Tasks 4 and 6).
- Turn traversal with six seats and multiple eliminated/disconnected players must never select an ineligible player or loop forever (Tasks 3, 4, and 11).

---

### Task 1: Canonical Card Domain and 168-Card Deck

**Files:**
- Create: `backend/src/modules/game/game.types.ts`
- Create: `backend/src/modules/game/deck.ts`
- Create: `backend/src/modules/game/deck.test.ts`

**Interfaces:**
- Consumes: No game-domain code.
- Produces: `CardColor`, `CardKind`, `CardFace`, `PhysicalCard`, `CARD_FACES`, `createDeck(idFactory: () => string): PhysicalCard[]`, and `shuffleDeck(cards: readonly PhysicalCard[], random?: () => number): PhysicalCard[]`.

- [ ] **Step 1: Write the failing deck-manifest tests**

  Add tests named `creates the canonical 168-card deck`, `assigns a unique instance id to every physical card`, `contains no basic wild or conventional wild draw four`, and `shuffles without mutating or losing cards`. Assert the exact family totals from the spec and two copies of every colored number 0–9.

- [ ] **Step 2: Run the focused tests and verify failure**

  Run: `bun test src/modules/game/deck.test.ts` from `backend`.

  Expected: FAIL because `deck.ts` and its exports do not exist.

- [ ] **Step 3: Define the card types and immutable face manifest**

  In `game.types.ts`, define colors as `"red" | "yellow" | "green" | "blue"`, kinds for every number/action family, `CardFace { faceId; color: CardColor | "wild"; kind; value?; drawValue? }`, and `PhysicalCard { instanceId; faceId }`.

- [ ] **Step 4: Implement deck creation and Fisher-Yates shuffle**

  In `deck.ts`, export the exact face catalog and multiplicities, generate opaque instance IDs through `idFactory`, and return a cloned shuffled array from `shuffleDeck`.

- [ ] **Step 5: Run the focused tests and typecheck**

  Run: `bun test src/modules/game/deck.test.ts && bun run typecheck` from `backend`.

  Expected: all deck tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the card domain**

  ```bash
  git add backend/src/modules/game/game.types.ts backend/src/modules/game/deck.ts backend/src/modules/game/deck.test.ts
  git commit -m "feat: add canonical no mercy deck"
  ```

### Task 2: Game Setup and Normal Turn Engine

**Files:**
- Modify: `backend/src/modules/game/game.types.ts`
- Create: `backend/src/modules/game/game.engine.ts`
- Create: `backend/src/modules/game/game.engine.test.ts`

**Interfaces:**
- Consumes: `CARD_FACES`, `createDeck`, `shuffleDeck`, `PhysicalCard` from Task 1.
- Produces: `CreateGameInput { playerIds: string[]; deck: PhysicalCard[]; dealerIndex: number }`, `GameState`, `GameCommand`, `GameErrorCode`, `GameTransition`, `createGameState(input: CreateGameInput): GameState`, `getPlayableCardIds(state: GameState, playerId: string): string[]`, and `applyGameCommand(state: GameState, command: GameCommand): GameTransition`.

- [ ] **Step 1: Write failing setup tests**

  Test `deals seven cards to two through six players`, `chooses the player left of the injected dealer`, `starts clockwise`, and `moves setup action cards into discard until a number is visible`. Use a fixed deck and assert exact hands, draw count, discard order, current player, direction, and revision `0`.

- [ ] **Step 2: Write failing normal-turn tests**

  Test legal color/number/symbol matching, wild playability, rejection codes for out-of-turn and illegal plays, revision increment on success, drawing until the first playable card, and immediate play of that drawn card.

- [ ] **Step 3: Add the draw-pile boundary tests from Review Focus**

  Test `rebuilds the draw pile while preserving the visible discard`, `does not duplicate the sole visible discard`, and `returns deck-exhausted without mutating state when no card can be recycled`.

- [ ] **Step 4: Run the focused tests and verify failure**

  Run: `bun test src/modules/game/game.engine.test.ts` from `backend`.

  Expected: FAIL because the engine exports do not exist.

- [ ] **Step 5: Define complete state and command discriminated unions**

  `GameState` must include ordered players and hands, draw/discard piles, direction, current player, active color, phase, pending choice, draw stack, UNO window, winner, and revision. Define commands for `play-card`, `draw-until-playable`, `accept-draw`, `choose-color`, `choose-swap-target`, `choose-roulette-color`, `declare-uno`, and `catch-uno`; later tasks fill the special-rule branches without changing these public names.

- [ ] **Step 6: Implement setup, matching, ordinary play, draw-until-playable, and safe reshuffle**

  Keep transitions immutable. Return `{ ok: false, code, state }` without changing object contents on rejection and `{ ok: true, state, events }` on acceptance.

- [ ] **Step 7: Run focused tests and typecheck**

  Run: `bun test src/modules/game/game.engine.test.ts && bun run typecheck` from `backend`.

  Expected: setup and normal-turn tests PASS; no TypeScript errors.

- [ ] **Step 8: Commit the engine foundation**

  ```bash
  git add backend/src/modules/game/game.types.ts backend/src/modules/game/game.engine.ts backend/src/modules/game/game.engine.test.ts
  git commit -m "feat: add authoritative turn engine"
  ```

### Task 3: Action Cards, Turn Traversal, and Draw Stacking

**Files:**
- Create: `backend/src/modules/game/turn-order.ts`
- Create: `backend/src/modules/game/turn-order.test.ts`
- Modify: `backend/src/modules/game/game.engine.ts`
- Modify: `backend/src/modules/game/game.engine.test.ts`

**Interfaces:**
- Consumes: `GameState` and `applyGameCommand` from Task 2.
- Produces: `getNextEligiblePlayerId(state: GameState, options?: { steps?: number; fromPlayerId?: string }): string | null`; extends `applyGameCommand` without changing its signature.

- [ ] **Step 1: Write failing turn-order tests**

  Cover clockwise and counterclockwise movement, wraparound, two-player traversal, six players with multiple eliminated players, and a state with no eligible next player. Assert the helper never returns an eliminated player and returns `null` instead of looping.

- [ ] **Step 2: Write failing action-rule tests**

  Add table-driven tests for Skip, Reverse, two-player Reverse, Skip Everyone, colored Draw 2/4, Wild Draw 6/10, Wild Reverse Draw 4, and its official two-player self-penalty exception.

- [ ] **Step 3: Write failing stack tests**

  Assert that only an equal-or-higher printed draw value may stack, color does not restrict stacking, penalties accumulate, `accept-draw` draws the total and skips the penalized player, and the latest draw value—not the accumulated total—sets the next threshold.

- [ ] **Step 4: Run focused tests and verify failure**

  Run: `bun test src/modules/game/turn-order.test.ts src/modules/game/game.engine.test.ts` from `backend`.

  Expected: new action and traversal cases FAIL.

- [ ] **Step 5: Implement eligible-player traversal**

  Use player order plus direction and a bounded iteration count. Keep disconnected-but-within-grace players eligible; only `eliminated` players are skipped by the game engine.

- [ ] **Step 6: Implement action effects and draw-stack resolution**

  Keep color and roulette choices in explicit pending phases. Reverse direction when the card is accepted; after mandatory choices resolve, calculate the next eligible player using `getNextEligiblePlayerId`.

- [ ] **Step 7: Run focused tests and all backend tests**

  Run: `bun test src/modules/game && bun test` from `backend`.

  Expected: all tests PASS.

- [ ] **Step 8: Commit action rules**

  ```bash
  git add backend/src/modules/game/turn-order.ts backend/src/modules/game/turn-order.test.ts backend/src/modules/game/game.engine.ts backend/src/modules/game/game.engine.test.ts
  git commit -m "feat: implement no mercy action cards"
  ```

### Task 4: Hand Effects, Mercy, UNO, and Winning

**Files:**
- Create: `backend/src/modules/game/hand-rules.ts`
- Create: `backend/src/modules/game/hand-rules.test.ts`
- Modify: `backend/src/modules/game/game.engine.ts`
- Modify: `backend/src/modules/game/game.engine.test.ts`

**Interfaces:**
- Consumes: `GameState`, `GameCommand`, and eligible-player traversal from Tasks 2–3.
- Produces: `applyMercyRule(state: GameState): GameState`, `passHands(state: GameState): GameState`, and `swapHands(state: GameState, firstId: string, secondId: string): GameState`; extends `applyGameCommand` with final special-rule behavior.

- [ ] **Step 1: Write failing 0, 7, and Discard All tests**

  Assert 7 requires another active target and swaps complete hands; 0 passes hands in both directions; eliminated players are excluded; Discard All moves all matching cards under the visible action card and can empty the hand.

- [ ] **Step 2: Write failing Roulette and Mercy tests**

  Assert the affected next player chooses the roulette color, wilds never satisfy the color search, all revealed cards enter the hand, 25 or more cards immediately eliminates a player, eliminated cards leave play, and traversal continues correctly with up to six seats.

- [ ] **Step 3: Write failing UNO race tests from Review Focus**

  Assert declaration as part of a play closes vulnerability, a separate declaration before the next valid action succeeds, a catch first adds exactly two cards, a late catch is rejected, and replaying the same accepted command cannot apply the penalty twice at the engine boundary.

- [ ] **Step 4: Write failing win-precedence tests**

  Cover final ordinary card, final Discard All, final 7/0 taking immediate victory before any remaining card effect, and the last non-eliminated player winning.

- [ ] **Step 5: Run focused tests and verify failure**

  Run: `bun test src/modules/game/hand-rules.test.ts src/modules/game/game.engine.test.ts` from `backend`.

  Expected: the new special-rule cases FAIL.

- [ ] **Step 6: Implement hand transformations and Mercy checks**

  Keep helper functions immutable. Run Mercy after every draw, transfer, swap, roulette result, and UNO penalty, then run winner detection.

- [ ] **Step 7: Implement UNO windows and terminal win precedence**

  Represent the catch deadline as the next accepted gameplay-command sequence, not wall-clock time. End the game immediately after an accepted play empties the actor's hand.

- [ ] **Step 8: Run all game tests and typecheck**

  Run: `bun test src/modules/game && bun run typecheck` from `backend`.

  Expected: all game rules PASS and TypeScript exits 0.

- [ ] **Step 9: Commit complete game rules**

  ```bash
  git add backend/src/modules/game/hand-rules.ts backend/src/modules/game/hand-rules.test.ts backend/src/modules/game/game.engine.ts backend/src/modules/game/game.engine.test.ts
  git commit -m "feat: complete no mercy game rules"
  ```

### Task 5: Personalized Snapshots and Versioned Wire Contract

**Files:**
- Create: `backend/src/modules/game/game.protocol.ts`
- Create: `backend/src/modules/game/game.projector.ts`
- Create: `backend/src/modules/game/game.projector.test.ts`

**Interfaces:**
- Consumes: completed `GameState` and card definitions from Tasks 1–4.
- Produces: `ParseResult<T>`, `ClientCommand`, `ClientEnvelope`, `ServerMessage`, `PlayerSnapshot`, `CommandErrorCode`, `parseClientMessage(value: unknown): ParseResult<ClientEnvelope>`, and `projectPlayerSnapshot(state: GameState, viewerId: string): PlayerSnapshot`.

- [ ] **Step 1: Write failing privacy projection tests**

  Assert the viewer receives their card instance IDs and face IDs; every opponent exposes only ID, name, order, card count, online/eliminated state; draw order, tokens, and other hands are absent even after JSON serialization.

- [ ] **Step 2: Write failing protocol parser tests**

  Cover protocol version `1`, all command discriminants, missing or over-64-character command IDs, invalid revisions, unknown fields/types, and malformed values. Assert invalid values return `INVALID_MESSAGE` without throwing.

- [ ] **Step 3: Run focused tests and verify failure**

  Run: `bun test src/modules/game/game.projector.test.ts` from `backend`.

  Expected: FAIL because projector and protocol exports do not exist.

- [ ] **Step 4: Define the versioned protocol and safe parser**

  `ClientEnvelope` must be `{ version: 1; type: "command"; commandId: string; revision: number; command: ClientCommand }`. Define `ClientCommand` as room commands `start-game | leave-room` plus the public payloads corresponding to every `GameCommand`, with actor identity omitted. Keep `authenticate` as a separate first-message shape for Task 8. Do not accept a client-supplied player ID.

- [ ] **Step 5: Implement the personalized projector**

  Include public turn/action data, pending choices only when safe, and a viewer-specific list of legal card instance IDs and allowed controls.

- [ ] **Step 6: Run focused tests and backend check**

  Run: `bun test src/modules/game/game.projector.test.ts && bun run check` from `backend`.

  Expected: privacy/protocol tests and the backend check PASS.

- [ ] **Step 7: Commit protocol and projections**

  ```bash
  git add backend/src/modules/game/game.protocol.ts backend/src/modules/game/game.projector.ts backend/src/modules/game/game.projector.test.ts
  git commit -m "feat: add private game snapshots"
  ```

### Task 6: In-Memory Room Store and Reconnection Lifecycle

**Files:**
- Create: `backend/src/modules/rooms/room.types.ts`
- Create: `backend/src/modules/rooms/room.store.ts`
- Create: `backend/src/modules/rooms/room.store.test.ts`

**Interfaces:**
- Consumes: `createGameState`, `applyGameCommand`, protocol envelopes, and player projector from Tasks 2–5.
- Produces: `RoomPeer { id: string; send(message: ServerMessage): void; close(code?: number, reason?: string): void }`, `RoomStoreDeps { now; setTimeout; clearTimeout; random; roomCodeFactory; tokenFactory; cardIdFactory }`, `RoomCredentials`, and `createRoomStore(deps?: Partial<RoomStoreDeps>): RoomStore`. `RoomStore` exposes `createRoom(displayName)`, `joinRoom(roomCode, displayName)`, `connect(roomCode, token, peer)`, `disconnect(roomCode, playerId, peerId)`, `handleCommand(roomCode, playerId, envelope)`, and test-only read methods.

- [ ] **Step 1: Write failing lobby lifecycle tests**

  Cover unique room codes/tokens, normalized duplicate names, blank and overlong names, 2–6 player limits, host-only start, host transfer before start, joining rejection after start, intentional leave, and immediate empty-room deletion.

- [ ] **Step 2: Write failing command-ordering tests**

  Assert stale revisions and duplicate command IDs are rejected, accepted commands apply exactly once, each peer receives a personalized snapshot, and a bad token cannot bind to a seat.

- [ ] **Step 3: Write failing reconnect and timer tests**

  With fake clock/timers, assert disconnect retains the seat for exactly 50 seconds, reconnect cancels expiry and replaces a stale peer, expiry eliminates the player, last-player victory resolves, empty completed rooms delete, and deleted rooms cancel all timers.

- [ ] **Step 4: Add the pending-state expiry tests from Review Focus**

  Test disconnect/reconnect during a color choice and active stack; then test grace expiry clears an impossible owner choice or advances an expired active turn without losing/duplicating the stack or selecting an eliminated player.

- [ ] **Step 5: Add UNO concurrency tests from Review Focus**

  Submit declaration/catch envelopes in both serial orders with duplicate IDs and stale revisions. Assert one deterministic result and one revision increment per accepted command.

- [ ] **Step 6: Run focused tests and verify failure**

  Run: `bun test src/modules/rooms/room.store.test.ts` from `backend`.

  Expected: FAIL because the room store does not exist.

- [ ] **Step 7: Implement the room aggregate and lifecycle**

  Generate six-character room codes from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` and 32-byte base64url tokens with `crypto.getRandomValues`; inject factories in tests. Keep one synchronous mutation boundary per room, retain the latest 256 accepted command IDs per player, and broadcast separate projected snapshots after each accepted mutation.

- [ ] **Step 8: Implement the 50-second grace and deterministic expiry recovery**

  `RoomStoreDeps` must inject `now`, `setTimeout`, and `clearTimeout`. Record a reconnect deadline, ignore superseded timer callbacks, and centralize deletion so all timers and peers are cleaned once.

- [ ] **Step 9: Run room/game tests and typecheck**

  Run: `bun test src/modules/game src/modules/rooms && bun run typecheck` from `backend`.

  Expected: all tests PASS with no leaked fake timers.

- [ ] **Step 10: Commit room lifecycle**

  ```bash
  git add backend/src/modules/rooms/room.types.ts backend/src/modules/rooms/room.store.ts backend/src/modules/rooms/room.store.test.ts
  git commit -m "feat: add in-memory game rooms"
  ```

### Task 7: Room REST API and Application Composition

**Files:**
- Create: `backend/src/modules/rooms/room.route.ts`
- Create: `backend/src/modules/rooms/room.route.test.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/app.test.ts`
- Modify: `backend/src/middleware/cors.ts`

**Interfaces:**
- Consumes: `RoomStore` from Task 6.
- Produces: `createRoomRoutes(store: RoomStore): Hono`; changes `createApp(config?: AppConfig, services?: { roomStore?: RoomStore }): Hono` while preserving its no-argument behavior.

- [ ] **Step 1: Write failing REST contract tests**

  Assert `POST /api/rooms` returns `201` with room code/player ID/token; `POST /api/rooms/:roomCode/players` returns `201`; malformed JSON, blank/overlong names, unknown room, duplicate name, full room, and started room return stable 4xx JSON codes without mutation.

- [ ] **Step 2: Update app tests for endpoint discovery and CORS**

  Assert the root endpoint lists room creation, CORS preflight permits `POST` and `Content-Type`, and existing health/not-found/error contracts remain intact.

- [ ] **Step 3: Run route tests and verify failure**

  Run: `bun test src/modules/rooms/room.route.test.ts src/app.test.ts` from `backend`.

  Expected: room routes are missing and CORS does not permit POST.

- [ ] **Step 4: Implement safe JSON parsing and room routes**

  Map store errors to explicit HTTP status/error-code pairs. Do not return room internals, reconnect deadlines, or tokens belonging to other players.

- [ ] **Step 5: Inject one room store into application composition**

  Mount room routes under `/api/rooms`, list the create endpoint at `/`, and update CORS to allow `GET`, `POST`, and `OPTIONS` with JSON content.

- [ ] **Step 6: Run backend check**

  Run: `bun run check` from `backend`.

  Expected: all backend tests and typecheck PASS.

- [ ] **Step 7: Commit REST room setup**

  ```bash
  git add backend/src/modules/rooms/room.route.ts backend/src/modules/rooms/room.route.test.ts backend/src/app.ts backend/src/app.test.ts backend/src/middleware/cors.ts
  git commit -m "feat: expose room creation API"
  ```

### Task 8: Authenticated WebSocket Gateway

**Files:**
- Create: `backend/src/modules/realtime/realtime.gateway.ts`
- Create: `backend/src/modules/realtime/realtime.gateway.test.ts`
- Create: `backend/src/modules/realtime/realtime.route.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `RoomStore`, `ClientEnvelope`, and `ServerMessage` from Tasks 5–7.
- Produces: `createRealtimeSession(store: RoomStore, roomCode: string, peer: RoomPeer): RealtimeSession`, `realtimeRoutes(store: RoomStore, allowedOrigins: readonly string[]): Hono`, and Bun's `websocket` handler passed to `Bun.serve`.

- [ ] **Step 1: Write failing authentication/session tests**

  Using a fake peer, assert the first message must be `{ version: 1, type: "authenticate", token }`; valid auth binds the seat and sends a snapshot; commands before auth, bad tokens, repeated auth, and unknown rooms close or reject safely.

- [ ] **Step 2: Add malformed-message tests from Review Focus**

  Send non-JSON text, binary data, wrong protocol versions, missing fields, and unknown command types. Assert `INVALID_MESSAGE`, no room revision change, and no uncaught exception.

- [ ] **Step 3: Write failing command and close tests**

  Assert valid envelopes reach `RoomStore.handleCommand`, store rejections are serialized, explicit `leave-room` differs from unexpected socket close, stale peer close events do not disconnect a replacement peer, unexpected close starts grace, configured browser origins may upgrade, and unconfigured origins receive `403`.

- [ ] **Step 4: Run focused tests and verify failure**

  Run: `bun test src/modules/realtime/realtime.gateway.test.ts` from `backend`.

  Expected: FAIL because the gateway does not exist.

- [ ] **Step 5: Implement the transport-independent realtime session**

  Parse strings defensively, reject messages above 16,384 bytes before parsing, authenticate once, translate socket close into `RoomStore.disconnect`, and never include tokens in server messages or logs.

- [ ] **Step 6: Mount Bun/Hono WebSocket support**

  Use `createBunWebSocket()` from the installed Hono 4 `hono/bun` adapter. Mount `GET /api/rooms/:roomCode/socket` with `upgradeWebSocket`, and pass the matching `websocket` handler in `Bun.serve({ port, fetch, websocket })`.

- [ ] **Step 7: Run backend check and a local handshake smoke test**

  Run: `bun run check` from `backend`, then start the server and connect with Bun's native `WebSocket` to authenticate against a room created over REST.

  Expected: checks PASS; the socket receives a version-1 personalized snapshot and closes cleanly.

- [ ] **Step 8: Commit realtime transport**

  ```bash
  git add backend/src/modules/realtime/realtime.gateway.ts backend/src/modules/realtime/realtime.gateway.test.ts backend/src/modules/realtime/realtime.route.ts backend/src/app.ts backend/src/server.ts
  git commit -m "feat: add realtime game gateway"
  ```

### Task 9: Frontend Protocol, Room API, Session Storage, and Reconnect Client

**Files:**
- Create: `frontend/src/game/protocol.ts`
- Create: `frontend/src/api/rooms.ts`
- Create: `frontend/src/api/rooms.test.ts`
- Create: `frontend/src/game/session.ts`
- Create: `frontend/src/game/session.test.ts`
- Create: `frontend/src/api/gameSocket.ts`
- Create: `frontend/src/api/gameSocket.test.ts`

**Interfaces:**
- Consumes: exact public JSON shapes from backend Task 5 and REST routes from Task 7.
- Produces: mirrored `PlayerSnapshot`, `ClientCommand`, and `ServerMessage` types; `createRoom(displayName, apiBaseUrl?)`, `joinRoom(roomCode, displayName, apiBaseUrl?)`, `loadSession()`, `saveSession(credentials)`, `clearSession()`, and `createGameSocket(options): GameSocketClient`.

- [ ] **Step 1: Write failing room API tests**

  Assert normalized base URLs, exact POST paths and JSON bodies, credential responses, structured server errors, and safe fallback for non-JSON failures.

- [ ] **Step 2: Write failing session-storage tests**

  Assert save/load/clear under one versioned key, invalid stored JSON is discarded, and only room code/player ID/player token are persisted.

- [ ] **Step 3: Write failing WebSocket client tests**

  With a fake `WebSocket` and fake timers, assert open sends authentication, snapshots update callbacks, commands include version/ID/revision, intentional leave does not reconnect, and unexpected close retries exactly ten times at 5,000 ms.

- [ ] **Step 4: Test reconnect success and exhaustion**

  Assert a successful reconnect cancels future retries and re-authenticates; exhaustion calls `onForfeit` once, clears session credentials, and never creates an eleventh socket.

- [ ] **Step 5: Run focused tests and verify failure**

  Run: `bun run test -- src/api/rooms.test.ts src/game/session.test.ts src/api/gameSocket.test.ts` from `frontend`.

  Expected: FAIL because the clients do not exist.

- [ ] **Step 6: Mirror the public protocol and implement clients**

  Keep WebSocket construction and timers injectable for tests. Derive `ws:`/`wss:` from `VITE_API_URL`; send the player token only in the first authentication message, not in the URL.

- [ ] **Step 7: Run focused tests and frontend typecheck**

  Run: `bun run test -- src/api/rooms.test.ts src/game/session.test.ts src/api/gameSocket.test.ts && bun run typecheck` from `frontend`.

  Expected: tests PASS and TypeScript exits 0.

- [ ] **Step 8: Commit frontend networking**

  ```bash
  git add frontend/src/game/protocol.ts frontend/src/api/rooms.ts frontend/src/api/rooms.test.ts frontend/src/game/session.ts frontend/src/game/session.test.ts frontend/src/api/gameSocket.ts frontend/src/api/gameSocket.test.ts
  git commit -m "feat: add multiplayer frontend client"
  ```

### Task 10: Create/Join Flow and Live Lobby

**Files:**
- Create: `frontend/src/game/useGameSession.ts`
- Create: `frontend/src/components/RoomDialog.tsx`
- Create: `frontend/src/components/LobbyScreen.tsx`
- Create: `frontend/src/components/RoomFlow.test.tsx`
- Modify: `frontend/src/components/HomeScreen.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: Task 9 API/session/socket clients and `PlayerSnapshot`.
- Produces: `useGameSession(): GameSessionController`, `RoomDialog`, and `LobbyScreen`; `App` gains `home | lobby | game | dev | gameboard | cards` flow without removing dev mode.

- [ ] **Step 1: Write failing create/join UI tests**

  Assert both existing home buttons open the correct dialog, create submits a display name, join submits room code plus display name, validation and server errors remain in the dialog, and successful credentials enter the lobby and persist the session.

- [ ] **Step 2: Write failing lobby tests**

  Assert room code, player names, host/online status, 2–6 occupancy, host-only start control, disabled start below two players, and intentional leave returning home and clearing session.

- [ ] **Step 3: Write failing reload and dev-mode isolation tests**

  Assert a saved session reconnects on mount, a forfeited/closed room clears it, and dev mode still opens without constructing a room socket.

- [ ] **Step 4: Run focused tests and verify failure**

  Run: `bun run test -- src/components/RoomFlow.test.tsx src/App.test.tsx` from `frontend`.

  Expected: new room-flow tests FAIL while existing dev-mode tests remain green.

- [ ] **Step 5: Implement `useGameSession` state orchestration**

  Expose status, credentials, snapshot, latest rejection, reconnect attempt, and actions `create`, `join`, `start`, `send`, and `leave`. Keep network logic outside visual components.

- [ ] **Step 6: Implement room dialogs and lobby using existing visual language**

  Reuse current typography, panels, buttons, and responsive conventions. Add accessible labels, focus behavior, submit states, and inline errors.

- [ ] **Step 7: Wire App flow while preserving dev routes and uncommitted work**

  Re-read the current working copies immediately before editing and merge around existing tests/GameBoard changes rather than restoring or replacing them.

- [ ] **Step 8: Run frontend tests and build**

  Run: `bun run test && bun run build` from `frontend`.

  Expected: all tests PASS and the production build succeeds.

- [ ] **Step 9: Commit room and lobby UI**

  ```bash
  git add frontend/src/game/useGameSession.ts frontend/src/components/RoomDialog.tsx frontend/src/components/LobbyScreen.tsx frontend/src/components/RoomFlow.test.tsx frontend/src/components/HomeScreen.tsx frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/index.css
  git commit -m "feat: connect room and lobby flow"
  ```

### Task 11: Server-Driven Board, Choices, and Two-to-Six Seat Layout

**Files:**
- Modify: `frontend/src/game/cards.ts`
- Create: `frontend/src/game/cards.test.ts`
- Create: `frontend/src/components/LiveGameScreen.tsx`
- Create: `frontend/src/components/GameChoiceDialog.tsx`
- Create: `frontend/src/components/LiveGameScreen.test.tsx`
- Modify: `frontend/src/components/GameBoard.tsx`
- Modify: `frontend/src/components/GameCard.tsx`
- Modify: `frontend/src/components/PlayerSeat.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `PlayerSnapshot` and `GameSessionController.send` from Tasks 9–10.
- Produces: `LiveGameScreen { snapshot; connectionState; reconnectAttempt; onCommand }`; extends `GameBoard` with a server-driven view model and callbacks while retaining its no-prop dev fixture.

- [ ] **Step 1: Write failing card-catalog tests**

  Assert frontend face IDs match backend public IDs, colored Draw 4 uses each colored artwork, Wild Reverse Draw 4 maps to its wild artwork, and the catalog contains neither a basic Wild nor a conventional Wild Draw 4.

- [ ] **Step 2: Write failing board projection tests**

  Assert own faces and opponent backs/counts, current player, active color, direction, draw count, discard, stack amount, eliminated/online states, and winner all render from the supplied snapshot rather than fixtures.

- [ ] **Step 3: Write failing interaction tests**

  Assert only server-listed card IDs are enabled; card click sends `play-card`; draw sends `draw-until-playable`; stack acceptance sends `accept-draw`; pending color/swap/roulette dialogs send the matching choice; UNO toggles between declare and catch; read-only reconnect state sends nothing.

- [ ] **Step 4: Write failing 2–6 seat-layout tests from Review Focus**

  Render two through six players with the viewer at every order index. Assert the viewer is always bottom, every opponent appears once, stable position classes exist for upper corners, and eliminated players are not chosen as the current-player visual.

- [ ] **Step 5: Run focused tests and verify failure**

  Run: `bun run test -- src/game/cards.test.ts src/components/LiveGameScreen.test.tsx src/App.test.tsx` from `frontend`.

  Expected: server-driven cases FAIL; existing visual tests remain green.

- [ ] **Step 6: Correct the logical frontend card catalog**

  Keep asset filenames stable, use `faceId` lookup compatible with backend snapshots, and update dev-card expectations to the actual No Mercy families.

- [ ] **Step 7: Refactor GameBoard into fixture and live presentation paths**

  Preserve `<GameBoard />` for dev mode. Add a typed view-model prop for live state, event callbacks, disabled-card styling, dynamic status-rail actions, and semantic labels.

- [ ] **Step 8: Implement live choices, reconnect banner, and responsive seats**

  Add top-left/top-right placement for five or six players without disturbing existing two-to-four layouts. Keep mandatory choices modal and keyboard accessible.

- [ ] **Step 9: Wire live snapshots into App**

  Transition lobby to live game when the snapshot phase starts; return home on explicit leave/forfeit; keep a completed board visible until the local player leaves.

- [ ] **Step 10: Run the complete frontend check**

  Run: `bun run check` from `frontend`.

  Expected: all Vitest tests, TypeScript compilation, and Vite production build PASS.

- [ ] **Step 11: Commit playable board integration**

  ```bash
  git add frontend/src/game/cards.ts frontend/src/game/cards.test.ts frontend/src/components/LiveGameScreen.tsx frontend/src/components/GameChoiceDialog.tsx frontend/src/components/LiveGameScreen.test.tsx frontend/src/components/GameBoard.tsx frontend/src/components/GameCard.tsx frontend/src/components/PlayerSeat.tsx frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/index.css
  git commit -m "feat: make game board playable"
  ```

### Task 12: End-to-End Verification and Operating Documentation

**Files:**
- Modify: `README.md`
- Modify: `backend/.env.example` only if a new documented configuration value is actually needed
- Modify: `frontend/.env.example` only if the existing `VITE_API_URL` description needs WebSocket clarification

**Interfaces:**
- Consumes: the complete backend and frontend.
- Produces: documented local multiplayer workflow, single-instance/in-memory limitations, and verified two-browser behavior.

- [ ] **Step 1: Update README usage and architecture notes**

  Document create/join/start/play flow, two-browser local testing, 50-second reconnect behavior, room cleanup, single backend instance requirement, and the fact that restart/deploy clears every room.

- [ ] **Step 2: Run the complete automated verification**

  Run from repository root: `bun run check && bun run build`.

  Expected: backend tests/typecheck and frontend tests/typecheck/build all PASS.

- [ ] **Step 3: Start both applications and perform a two-browser smoke game**

  Run: `bun run dev` from repository root.

  Verify: create room; join from a second isolated browser session; start; make a legal play; observe identical public state and private hands; attempt one invalid action and receive a safe rejection; disconnect/reconnect within grace; intentionally leave; confirm the remaining player wins or the room closes as appropriate.

- [ ] **Step 4: Verify expiry and memory cleanup**

  Disconnect a player without leaving, observe ten client attempts five seconds apart, confirm server elimination at 50 seconds, then leave all remaining clients and assert the room code returns `ROOM_NOT_FOUND` on reconnect/join.

- [ ] **Step 5: Inspect final diff and working tree**

  Run: `git diff --check && git status --short && git log --oneline --decorate -15`.

  Expected: no whitespace errors; only intentionally preserved pre-existing changes remain uncommitted; implementation commits are present in task order.

- [ ] **Step 6: Commit documentation**

  ```bash
  git add README.md backend/.env.example frontend/.env.example
  git commit -m "docs: explain multiplayer game operation"
  ```

- [ ] **Step 7: Request whole-branch code review**

  Use `superpowers:requesting-code-review` against the implementation branch, address verified findings, then rerun `bun run check && bun run build` before declaring completion.

