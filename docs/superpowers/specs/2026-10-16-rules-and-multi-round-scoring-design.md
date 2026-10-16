# UNO No Mercy Rules and Multi-Round Scoring Design

## Objective

Update the authoritative multiplayer game to match the current `GAME_RULES.md` and add optional multi-round scoring. The existing single-round engine remains the source of truth for card legality and turn transitions; a room-owned match layer will persist scores and coordinate multiple rounds.

Success means a complete round follows the revised setup, draw, and Discard All rules; a finished round produces deterministic scores; players can start subsequent rounds without losing cumulative scores; and the match ends when a player reaches 1,000 points. Active-play hidden information, reconnect behavior, room serialization, and protocol revision guarantees remain intact.

## Scope and decisions

### Revised rules in scope

- During setup, cards are flipped until a number card is face-up. Any action cards flipped before it remain in the discard pile.
- If the active player has no playable card, `draw-until-playable` draws one card at a time and immediately plays the first playable card.
- If the active player has a playable card and chooses not to play it, `draw-and-pass` draws exactly one card and ends the turn without playing it.
- Discard All removes every other card in the player’s hand matching its color; the played Discard All remains the visible top discard.

### Scoring decisions

- Scoring is enabled for every room; it is optional only in the sense that it applies to multi-round play and does not change single-round rule resolution.
- The target score is fixed at 1,000 points.
- At round completion, the round winner receives the value of all non-eliminated opponents’ remaining hands.
- Number cards are worth their face value.
- Colored action cards are worth 20 points.
- Wild action cards are worth 50 points.
- Cards removed by Mercy elimination, intentional leave, or reconnect expiry are worth zero points.
- A player receives a 250-point elimination bonus for each opponent that a gameplay action directly caused to be eliminated. Disconnect- and leave-triggered eliminations have no credited eliminator.
- The round winner’s own remaining hand is never scored.
- A match ends as soon as a cumulative score reaches or exceeds 1,000. If multiple players cross the threshold in the same completed round, the highest cumulative score wins; an exact tie is resolved by that round’s winner.

## Architecture

The current `GameState` remains a single-round state machine. The room aggregate gains a `MatchState` that owns cumulative state and round transitions.

```text
Room
├── seats, peers, reconnect timers, command history
├── match: MatchState
└── game: GameState | null          # current round only

MatchState
├── status: lobby | round-active | round-complete | match-complete
├── roundNumber
├── targetScore: 1000
├── scoresByPlayerId
├── lastRoundResult
└── winner
```

The engine continues to accept a `GameState` and a validated game command, returning a deterministic transition. The room store owns room authorization, match commands, scoring invocation, and creation of the next round. A dedicated scoring module accepts a completed round snapshot and returns a `RoundResult`; it must not mutate the round state.

The existing projection boundary remains in place. The room combines match metadata with the personalized round projection so all players receive the same public scores and round result while each player sees only their own active hand.

## Match and round lifecycle

### First round

- The lobby starts in `match.status = lobby`, with zero scores for every seat.
- The host’s existing `start-game` command creates the first round, sets `roundNumber = 1`, rotates no dealer beyond the initial randomized dealer choice, and changes status to `round-active`.
- The room creates a fresh 168-card deck for each round.

### Round completion

- The game engine reaches `phase = finished` with a round winner.
- The room finalizes scoring exactly once, guarded against duplicate command delivery or repeated snapshot handling.
- The room stores `lastRoundResult`, updates cumulative scores, and changes status to `match-complete` if the target is reached; otherwise it changes status to `round-complete`.
- `round-complete` is a waiting state. Gameplay commands are rejected until the next round begins.

### Next round

- The host may submit `start-next-round` only in `round-complete`.
- The same player seats and IDs remain in the match; cumulative scores persist.
- The dealer advances to the next retained seat in seat order before the new deal.
- A fresh round state is created with new physical card IDs, seven-card hands, setup discard initialization, and a new round revision under the room’s monotonic revision stream.
- The prior `lastRoundResult` and cumulative standings remain visible while the new round is active.

### Match completion and departures

- In `match-complete`, no new round can begin. The final winner and standings remain available until the room is cleaned up by the existing lifecycle rules.
- A player leaving or expiring during a round follows the current elimination behavior and cannot receive an elimination bonus for that departure.
- A player leaving between rounds is removed from future deals but their accumulated score remains in the historical result. The implementation must keep the score entry stable for snapshots of the completed match and exclude the departed seat from future active rounds.
- If host authority changes, the new host controls `start-next-round`.

## Rule-resolution changes

### Setup discard initialization

`createGameState` must repeatedly remove the next card from the draw pile, append it to the discard pile, and stop only when the visible card is a number. Action cards flipped during setup remain in discard order and are not returned to the draw pile. The active color is the number card’s color and the first player is the player to the dealer’s left.

### Draw behavior

The engine must distinguish these two legal actions:

- `draw-until-playable`: valid only when no playable card is already in the active hand and no draw stack is pending. Draw cards sequentially, checking Mercy after each draw. The first playable drawn card is immediately passed through normal play resolution, including wild choices, 7 swaps, 0 passes, action effects, UNO, and terminal-win handling.
- `draw-and-pass`: valid only when the active hand contains at least one playable card and no draw stack is pending. Draw exactly one card, do not play it even if playable, then advance the turn.

The draw pile reshuffle preserves the visible top discard. If no drawable card exists, the command is rejected without committing a partial transition.

### Discard All

When a Discard All is played, remove only the other cards in the player’s hand whose color matches the played card. Place those removed cards into the discard pile before appending the played Discard All, so the played card remains the top visible discard. A player who becomes empty through this effect wins immediately, before any later action effect or turn advance.

## Scoring model

The scoring module must expose pure functions equivalent to:

```text
cardPointValue(face): number
calculateRoundResult(completedRound, priorScores): RoundResult
```

`RoundResult` contains:

- round number and winner ID;
- per-player card points;
- per-player elimination bonuses;
- per-player round totals;
- per-player cumulative totals;
- match winner, if the target was reached.

For card scoring, count only non-eliminated opponents’ hands at the instant the round finishes. For elimination bonuses, the round state must record `eliminatedByPlayerId` whenever a game action causes a Mercy elimination. The hand-rule helper may still apply the elimination, but the engine or room transition must preserve the cause before removed cards are discarded. Automatic expiry and intentional leave use a null cause.

Scoring must be idempotent: applying it twice to the same completed round must return the same result and must not add points twice. `MatchState` must record an explicit `finalizedRoundNumber` completion marker.

## State and protocol changes

Extend backend and frontend shared protocol types with:

- `MatchStatus` and `MatchState`/projection types;
- `RoundResult` and per-player score breakdowns;
- `start-next-round` client command;
- match metadata on `PlayerSnapshot`;
- stable errors for `round-not-complete` and `match-complete`; the existing `NOT_HOST` error covers host authorization failures.

The snapshot must expose cumulative scores during active play, and expose the completed round’s breakdown after the round ends. Opponent card identities, draw order, player tokens, and private room data remain hidden. `allowedControls` must include `start-next-round` only for the host while status is `round-complete`.

The existing version-1 envelope and monotonic room revision remain unchanged. Every accepted next-round command increments the room revision, is added to command history, and is broadcast through the same personalized snapshot path. Stale and duplicate commands must not mutate match state.

## Frontend behavior

Update the session and screens as follows:

- Render cumulative points on every player seat during active play.
- Replace the current terminal round overlay with a server-driven round-complete view when another round is available.
- Show the round winner, per-player score breakdown, cumulative standings, and a host-only Next Round control.
- Show a final match-complete view with the match winner and cumulative standings when the target is reached.
- Keep the latest match metadata through reconnects and render read-only state while reconnecting.
- Do not return to the lobby automatically after a round; the room remains in the same match.

The existing draw-pile control continues to derive its behavior from `allowedControls`: it offers draw-until-playable when no legal card exists and draw-one-and-pass when a legal card exists. The UI must not infer legality locally beyond rendering server-provided legal card IDs.

## Files and module responsibilities

Expected backend changes:

- `backend/src/modules/game/game.types.ts`: round cause tracking and completed-round data needed by scoring.
- `backend/src/modules/game/game.engine.ts` and `hand-rules.ts`: revised rule assertions and elimination-cause propagation.
- `backend/src/modules/game/scoring.ts`: pure card-value and round-score calculation.
- `backend/src/modules/game/game.protocol.ts`: match metadata, result types, command, and errors.
- `backend/src/modules/game/game.projector.ts`: combine round and match projection without leaking hands.
- `backend/src/modules/rooms/room.types.ts` and `room.store.ts`: match ownership, round transitions, scoring finalization, dealer rotation, and command authorization.

Expected frontend changes:

- `frontend/src/game/protocol.ts`: mirror match and scoring contracts.
- `frontend/src/game/useGameSession.ts`: send the next-round command and preserve server-driven match state.
- `frontend/src/components/LiveGameScreen.tsx`, `LobbyScreen.tsx`, or a focused match-result component: active scores, round results, next-round control, and final standings.
- `frontend/src/components/PlayerSeat.tsx`: render real cumulative points rather than the current placeholder zero.
- Relevant CSS and tests for the new result states.

No database, accounts, bots, matchmaking, spectators, distributed room store, or optional 1,000-point configuration is included.

## Error handling and concurrency

The existing per-room command serialization applies to scoring and round transitions. Finalizing a round and accepting `start-next-round` must occur in the same serialized room mutation path. A second finalization attempt is a no-op or returns the current completed snapshot; it must never award points twice.

Reject:

- `start-next-round` from a non-host;
- `start-next-round` during an active round or lobby;
- `start-next-round` after match completion;
- all gameplay commands while a round result is being shown;
- commands using stale revisions or already accepted command IDs.

Unexpected scoring or transition failures must leave the prior committed room state intact and return a generic internal error without exposing server details.

## Testing and verification

Backend tests must cover:

- Setup action cards retained before the first number card.
- Draw-until-playable with multiple draws and immediate action-card resolution.
- Draw-and-pass with a playable drawn card that remains in hand.
- Discard All placement, empty-hand win, and reshuffle behavior.
- Exact card point values for every card family.
- Eliminated-hand exclusion and direct elimination attribution.
- Idempotent round scoring and cumulative score updates.
- First-round start, next-round host gating, dealer rotation, score persistence, and match completion at 1,000.
- Tie resolution, host transfer, disconnect/leave behavior, stale revisions, duplicate commands, reconnect, and personalized snapshots.

Frontend tests must cover:

- Cumulative scores on seats.
- Round-complete result and standings rendering.
- Host-only next-round control and command dispatch.
- Match-complete winner display with no next-round control.
- Reconnect restoration and read-only behavior.
- Existing legal-card, draw-mode, UNO, and choice-dialog behavior.

Verification requires `bun run check`, `bun run build`, and a manual two-browser smoke test covering two rounds, score persistence, next-round authorization, reconnect between rounds, and final match completion. The implementation plan should include deterministic test fixtures for completed rounds so scoring tests do not require playing an entire random game.

## Out of scope

- Configurable scoring targets or alternate scoring modes.
- Match persistence across backend restart.
- Partial-match rejoining after a player’s seat is permanently removed.
- Spectator views or score-history export.
