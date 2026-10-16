# Rules and Multi-Round Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the revised setup/draw/Discard All rules and add authoritative multi-round scoring through a 1,000-point match.

**Architecture:** Keep `GameState` as the pure single-round state machine. Add a room-owned `MatchState` and pure scoring module for cumulative scores, round results, dealer rotation, and next-round authorization. Extend personalized snapshots and the React UI with public standings and round/match result screens.

**Tech Stack:** Bun, TypeScript, Hono, native WebSockets, React 19, Vite, Vitest, Bun Test.

**Spec:** `docs/superpowers/specs/2026-10-16-rules-and-multi-round-scoring-design.md`

## Global Constraints

- Preserve the canonical 168-card deck and 2–6 player limits.
- Keep the backend authoritative for card legality, scoring, turn sequencing, hidden hands, and match transitions.
- Keep version-1 envelopes, monotonic room revisions, per-room command serialization, and command deduplication.
- Use a fixed match target of 1,000 points; do not add configuration for alternate targets.
- Eliminated, intentionally departed, and reconnect-expired hands score zero card points.
- Direct gameplay-caused eliminations award 250 points; leave/expiry eliminations award no elimination bonus.
- Do not add persistence, accounts, bots, matchmaking, spectators, distributed state, or restart recovery.
- Use deterministic injected decks, card IDs, randomness, and clocks in tests.

## Review Focus

- A drawn playable card must be played immediately, while a voluntarily drawn card must remain in hand and end the turn; pin both behaviors in the engine tests in Task 2.
- A Discard All must remain the visible top discard even after removing matching-color cards; pin discard ordering and empty-hand win in Task 2.
- A round must be finalized once even if the completion path or next command is retried; pin `finalizedRoundNumber` idempotence in Task 4.
- A score snapshot must expose standings without exposing any opponent card identities; pin projection privacy in Task 5.
- A stale or duplicate `start-next-round` must not rotate the dealer or reset scores; pin room command serialization in Task 4.

---

### Task 1: Define match, scoring, and protocol contracts

**Files:**
- Modify: `backend/src/modules/game/game.types.ts`
- Modify: `backend/src/modules/game/game.protocol.ts`
- Modify: `backend/src/modules/rooms/room.types.ts`
- Modify: `frontend/src/game/protocol.ts`
- Create: `backend/src/modules/game/game.protocol.test.ts`

**Interfaces:**
- Produces `MatchStatus = "lobby" | "round-active" | "round-complete" | "match-complete"`.
- Produces `PlayerScore { playerId: string; points: number }`.
- Produces `RoundScoreBreakdown { playerId: string; cardPoints: number; eliminationBonus: number; roundPoints: number; cumulativePoints: number }`.
- Produces `RoundResult { roundNumber: number; winnerId: string; breakdown: RoundScoreBreakdown[]; matchWinnerId: string | null }`.
- Produces `MatchState { status: MatchStatus; roundNumber: number; targetScore: 1000; scoresByPlayerId: Record<string, number>; lastRoundResult: RoundResult | null; winner: string | null; finalizedRoundNumber: number | null; dealerIndex: number }`.
- Adds `start-next-round` to backend/frontend client command unions.
- Adds `matchStatus`, `roundNumber`, `targetScore`, `scores`, `roundResult`, and `matchWinner` to `PlayerSnapshot`.
- Adds stable `round-not-complete` and `match-complete` command errors while reusing `NOT_HOST` for authorization.

- [ ] **Step 1: Write failing type/protocol tests** asserting `start-next-round` parses and snapshot fixtures can contain the new match fields.
- [ ] **Step 2: Run the focused protocol tests**

Run: `bun test backend/src/modules/game/game.protocol.test.ts`

Expected: FAIL because the new command and match contract are not defined.

- [ ] **Step 3: Add the shared backend and frontend types** with exact literal unions and nullable result fields from the Interfaces block; keep match metadata public and round hands out of the match contract.
- [ ] **Step 4: Run focused tests and type checks**

Run: `bun test backend/src/modules/game/game.protocol.test.ts && bun run --cwd frontend typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/game/game.types.ts backend/src/modules/game/game.protocol.ts backend/src/modules/rooms/room.types.ts frontend/src/game/protocol.ts backend/src/modules/game/game.protocol.test.ts
git commit -m "feat: define match scoring contracts"
```

### Task 2: Lock down revised single-round rule behavior

**Files:**
- Modify: `backend/src/modules/game/game.engine.ts`
- Modify: `backend/src/modules/game/hand-rules.ts`
- Modify: `backend/src/modules/game/game.types.ts`
- Test: `backend/src/modules/game/game.engine.test.ts`
- Test: `backend/src/modules/game/hand-rules.test.ts`

**Interfaces:**
- Consumes the existing `createGameState(input: CreateGameInput)` and `applyGameCommand(state: GameState, command: GameCommand)`.
- Produces a round state whose `GamePlayer` records `eliminatedByPlayerId: string | null`.
- Preserves `draw-until-playable`, `draw-and-pass`, and Discard All command semantics.

- [ ] **Step 1: Add failing engine tests** for: action cards retained before the first setup number; multiple draws ending in immediate play; a drawn wild entering its choice phase; a playable hand rejecting draw-until-playable; draw-and-pass keeping the drawn card; Discard All leaving itself on top; Discard All empty-hand win; and action-caused Mercy attribution.
- [ ] **Step 2: Run the focused engine suite**

Run: `bun test backend/src/modules/game/game.engine.test.ts backend/src/modules/game/hand-rules.test.ts`

Expected: FAIL for each missing or incorrect assertion.

- [ ] **Step 3: Implement the minimum engine changes**: preserve setup action cards, keep draw-until-playable’s first playable card in the normal play path, keep draw-and-pass as a non-playing one-card transition, append Discard All’s removed cards before the played card, and record the acting player as the elimination cause before Mercy removes cards.
- [ ] **Step 4: Run all game-engine tests**

Run: `bun test backend/src/modules/game`

Expected: PASS, including existing stacking, 0/7, roulette, UNO, reshuffle, and win-condition tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/game/game.engine.ts backend/src/modules/game/hand-rules.ts backend/src/modules/game/game.types.ts backend/src/modules/game/game.engine.test.ts backend/src/modules/game/hand-rules.test.ts
git commit -m "feat: enforce revised round rules"
```

### Task 3: Implement pure round scoring

**Files:**
- Create: `backend/src/modules/game/scoring.ts`
- Create: `backend/src/modules/game/scoring.test.ts`
- Modify: `backend/src/modules/game/game.types.ts`

**Interfaces:**
- Produces `cardPointValue(face: CardFace): number`.
- Produces `calculateRoundResult(round: GameState, priorScores: Readonly<Record<string, number>>, roundNumber: number): RoundResult`.
- Uses 0 points for eliminated hands, 0 for the winner’s own remaining hand, 20 for colored actions, 50 for wild actions, and printed value for number cards.

- [ ] **Step 1: Write failing scoring tests** for every card family, mixed hands, eliminated hands, direct elimination bonuses, null elimination causes, cumulative totals, threshold crossing, and exact ties resolved by the round winner.
- [ ] **Step 2: Run the scoring tests**

Run: `bun test backend/src/modules/game/scoring.test.ts`

Expected: FAIL because `scoring.ts` does not exist.

- [ ] **Step 3: Implement `cardPointValue` and `calculateRoundResult`** as pure functions; derive card faces through the existing card manifest and never mutate the supplied round or score map.
- [ ] **Step 4: Run scoring and type checks**

Run: `bun test backend/src/modules/game/scoring.test.ts && bun run --cwd backend typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/game/scoring.ts backend/src/modules/game/scoring.test.ts backend/src/modules/game/game.types.ts
git commit -m "feat: calculate multi-round scores"
```

### Task 4: Add room-owned match lifecycle and next-round command

**Files:**
- Modify: `backend/src/modules/rooms/room.types.ts`
- Modify: `backend/src/modules/rooms/room.store.ts`
- Modify: `backend/src/modules/rooms/room.store.test.ts`
- Modify: `backend/src/modules/rooms/room.route.test.ts` if room command fixtures require updates

**Interfaces:**
- Consumes `MatchState`, `RoundResult`, `calculateRoundResult`, and `start-next-round` from Tasks 1–3.
- Produces room operations that initialize a match on `start-game`, finalize a finished round once, and accept `start-next-round` only from the host in `round-complete`.
- Preserves the existing `RoomStore.handleCommand(roomCode, playerId, envelope)` return contract and room revision stream.

- [ ] **Step 1: Add failing room-store tests** for zeroed match state, first-round initialization, round finalization, duplicate finalization, host-only next-round, wrong-phase rejection, score persistence, dealer rotation, match completion, host transfer, and stale/duplicate next-round commands.
- [ ] **Step 2: Run the focused room-store suite**

Run: `bun test backend/src/modules/rooms/room.store.test.ts`

Expected: FAIL because the room has no match state or next-round transition.

- [ ] **Step 3: Add match state to the room aggregate** and initialize scores for all seats when the room is created; keep room inspection deterministic for tests.
- [ ] **Step 4: Update `start-game` and completion handling** to set `round-active`, finalize scoring exactly once using `finalizedRoundNumber`, and transition to `round-complete` or `match-complete` without awarding points twice.
- [ ] **Step 5: Implement `start-next-round`** with host/phase/match checks, dealer rotation among retained seats, fresh deck/card IDs, score preservation, and a single committed revision.
- [ ] **Step 6: Run room, route, realtime, and backend type checks**

Run: `bun test backend/src/modules/rooms backend/src/modules/realtime && bun run --cwd backend typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/rooms/room.types.ts backend/src/modules/rooms/room.store.ts backend/src/modules/rooms/room.store.test.ts backend/src/modules/rooms/room.route.test.ts
git commit -m "feat: manage scored match rounds in rooms"
```

### Task 5: Project match metadata without leaking hands

**Files:**
- Modify: `backend/src/modules/game/game.projector.ts`
- Modify: `backend/src/modules/game/game.protocol.ts`
- Modify: `backend/src/modules/rooms/room.store.ts`
- Modify: `backend/src/modules/game/game.projector.test.ts`
- Modify: `backend/src/modules/realtime/realtime.gateway.test.ts`

**Interfaces:**
- Produces `projectPlayerSnapshot(state: GameState, viewerId: string, match: MatchState): PlayerSnapshot` with the same privacy guarantees as the current projector.
- `allowedControls` includes `start-next-round` only for the host when `match.status === "round-complete"`.
- All viewers receive identical public scores and round results while only the viewer receives their hand.

- [ ] **Step 1: Add failing projector/realtime tests** for active scores, completed-round results, final match winner, host-only next-round control, and absence of opponent card identities in serialized snapshots.
- [ ] **Step 2: Run focused projection tests**

Run: `bun test backend/src/modules/game/game.projector.test.ts backend/src/modules/realtime/realtime.gateway.test.ts`

Expected: FAIL because match fields are not projected.

- [ ] **Step 3: Extend projection and room snapshot composition** with allowlisted match metadata; keep lobby snapshots initialized with zero scores and null round results.
- [ ] **Step 4: Run backend projection and type checks**

Run: `bun test backend/src/modules/game/game.projector.test.ts backend/src/modules/realtime/realtime.gateway.test.ts && bun run --cwd backend typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/game/game.projector.ts backend/src/modules/game/game.protocol.ts backend/src/modules/rooms/room.store.ts backend/src/modules/game/game.projector.test.ts backend/src/modules/realtime/realtime.gateway.test.ts
git commit -m "feat: project match standings safely"
```

### Task 6: Add React match results and next-round flow

**Files:**
- Modify: `frontend/src/game/protocol.ts`
- Modify: `frontend/src/game/useGameSession.ts`
- Modify: `frontend/src/components/LiveGameScreen.tsx`
- Create: `frontend/src/components/MatchResultScreen.tsx`
- Modify: `frontend/src/components/PlayerSeat.tsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/LiveGameScreen.test.tsx`
- Modify: `frontend/src/components/RoomFlow.test.tsx`

**Interfaces:**
- Consumes the server snapshot fields and `allowedControls` from Task 5.
- Produces a host-only `start-next-round` command through `useGameSession`.
- Renders cumulative `scores` on seats and round/match result screens without deriving score values from hidden hands.

- [ ] **Step 1: Add failing React tests** for real seat points, round-complete standings and Next Round dispatch, non-host read-only state, match-complete winner display, and reconnect restoration of scores.
- [ ] **Step 2: Run focused frontend tests**

Run: `bun run --cwd frontend test -- src/components/LiveGameScreen.test.tsx src/components/RoomFlow.test.tsx`

Expected: FAIL because the components do not render match states or dispatch the new command.

- [ ] **Step 3: Add the session command helper and snapshot-driven UI states**; keep the existing board controls server-derived and disable result-screen actions while reconnecting.
- [ ] **Step 4: Render cumulative points and score breakdowns** in `PlayerSeat` and the new `MatchResultScreen`, keeping `LiveGameScreen` responsible for selecting active-round versus result-screen rendering.
- [ ] **Step 5: Run frontend tests and typecheck**

Run: `bun run --cwd frontend test && bun run --cwd frontend typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/game/protocol.ts frontend/src/game/useGameSession.ts frontend/src/components/LiveGameScreen.tsx frontend/src/components/LobbyScreen.tsx frontend/src/components/MatchResultScreen.tsx frontend/src/components/PlayerSeat.tsx frontend/src/index.css frontend/src/components/LiveGameScreen.test.tsx frontend/src/components/RoomFlow.test.tsx
git commit -m "feat: show round and match score results"
```

### Task 7: Update integration coverage and verify the full feature

**Files:**
- Modify: `backend/src/modules/realtime/realtime.gateway.test.ts`
- Modify: `backend/src/modules/rooms/room.store.test.ts`
- Modify: `frontend/src/App.test.tsx` and relevant component fixtures
- Modify: `README.md` only if the user-facing feature list or manual test flow needs updating

**Interfaces:**
- Consumes all completed backend and frontend contracts from Tasks 1–6.
- Produces a passing repository-level check and a repeatable two-browser smoke-test checklist.

- [ ] **Step 1: Add an end-to-end protocol test** that creates a room, starts a round, completes a deterministic round fixture, verifies identical public standings across peers, starts the next round as host, rejects a guest/stale retry, and reaches match-complete.
- [ ] **Step 2: Run the full test suites**

Run: `bun run check`

Expected: PASS for backend tests/typecheck and frontend tests/build.

- [ ] **Step 3: Run production validation**

Run: `bun run build`

Expected: PASS for backend typecheck and frontend production build.

- [ ] **Step 4: Perform the manual two-browser smoke test**: create/join, play through a revised draw and Discard All case, finish a round, verify scores, reconnect between rounds, start the next round, and verify final match completion.
- [ ] **Step 5: Commit final test/README updates**

```bash
git add backend/src/modules/realtime/realtime.gateway.test.ts backend/src/modules/rooms/room.store.test.ts frontend/src/App.test.tsx README.md
git commit -m "test: verify multi-round scoring flow"
```

## Plan self-review

- Spec coverage: revised setup, draw modes, Discard All, elimination attribution, pure scoring, room lifecycle, protocol, projection privacy, frontend states, concurrency, and verification are covered by Tasks 2–7.
- Step scan: each task is split into failing test, focused run, implementation, passing run, and commit checkpoints; no task relies on an unspecified function name except where the Interfaces block defines it.
- Type consistency: `RoundResult`, `MatchState`, `start-next-round`, and snapshot metadata are introduced in Task 1 and consumed by later tasks.
- Review focus: each of the five highest-risk failure modes has a test in its owning task.
- Proportion: the plan stays at task/interface/test level and leaves implementation bodies to the engineer.
