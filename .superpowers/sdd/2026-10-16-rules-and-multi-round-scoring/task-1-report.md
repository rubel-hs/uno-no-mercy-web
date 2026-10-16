# Task 1 report

Status: complete

Commit: `99c18b28852a3da9920f404c190ddf3dcf215cac` (`Define match scoring protocol contracts`)

Tests run:

- `bun test backend/src/modules/game/game.protocol.test.ts` — passed (2 tests, 0 failures).
- `bun run --cwd frontend typecheck` — passed.
- `git diff --check` — passed.
- Before implementation, the protocol test was run and failed because `start-next-round` was rejected as `INVALID_MESSAGE`, as expected.

Changed files:

- `backend/src/modules/game/game.types.ts`
- `backend/src/modules/game/game.protocol.ts`
- `backend/src/modules/rooms/room.types.ts`
- `frontend/src/game/protocol.ts`
- `backend/src/modules/game/game.protocol.test.ts`

Concerns: Snapshot match metadata is optional in this contract step because room snapshot projection is outside Task 1 and existing producers do not yet populate it. `GamePlayer.eliminatedByPlayerId` is required so subsequent game-state changes must initialize or preserve it.

## Round 1 findings fix

Status: complete; contract compilation fixes only. Next-round lifecycle remains for Task 4, and match snapshot population remains for Task 5.

Changed files:

- `backend/src/modules/game/game.engine.ts` — initializes `eliminatedByPlayerId` to `null` when authoritative round state is created.
- `backend/src/modules/game/game.engine.test.ts` and `backend/src/modules/game/game.projector.test.ts` — initialize the required field in typed fixtures.
- `backend/src/modules/rooms/room.store.ts` — leaves attribution null on departure and handles `start-next-round` at the room boundary, preserving `NOT_HOST` and returning `round-not-complete` for the not-yet-implemented transition.
- `backend/src/modules/realtime/realtime.gateway.ts` and `backend/src/modules/rooms/room.store.ts` — provide stable messages for both new match errors.
- `backend/src/modules/game/game.protocol.ts` — clarifies that the optional snapshot fields are public metadata and must be populated by the room projection when match state is wired in.
- This report.

Commands and output:

- `bun run --cwd backend typecheck` — passed; `tsc --noEmit` exited 0.
- `bun test backend/src/modules/game/game.protocol.test.ts` — passed; 2 tests, 0 failures.
- `bun run --cwd frontend typecheck` — passed; `tsc -b` exited 0.
- `git diff --check` — passed.

Concerns: Match fields remain optional until Task 5 populates room snapshots. `start-next-round` is parsed and safely rejected at the room boundary for now; no match state transition is implemented. Elimination cause defaults to `null` in fresh state and departure paths, leaving gameplay attribution available for the later scoring work.
