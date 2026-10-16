import { expect, test } from "bun:test";
import { applyMercyRule, passHands, swapHands } from "./hand-rules";
import { createGameState } from "./game.engine";
import type { GameState } from "./game.types";

function table(direction: 1 | -1 = 1): GameState {
  const state = createGameState({ playerIds: ["a", "b", "c", "d"], dealerIndex: 3,
    deck: Array.from({ length: 30 }, (_, i) => ({ instanceId: `c${i}`, faceId: "red-1" })),
  });
  state.players.forEach((player) => { player.hand = [{ instanceId: player.id, faceId: "blue-1" }]; });
  state.players[1]!.eliminated = true;
  state.players[1]!.hand = [];
  state.direction = direction;
  return state;
}

// Break caught: rotating by seat rather than eligible player or ignoring direction.
test.each([[1, ["d", null, "a", "c"]], [-1, ["c", null, "d", "a"]]] as const)("passes complete hands in direction %i excluding eliminated seats", (direction, expected) => {
  const state = table(direction);
  const before = structuredClone(state);
  const next = passHands(state);
  expect(next.players.map(({ hand }) => hand[0]?.instanceId ?? null)).toEqual([...expected]);
  expect(state).toEqual(before);
});

// Break caught: swapping a single card instead of complete hands or mutating input.
test("swaps complete active hands immutably", () => {
  const state = table();
  state.players[2]!.hand.push({ instanceId: "extra", faceId: "red-2" });
  const before = structuredClone(state);
  const next = swapHands(state, "a", "c");
  expect(next.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(["c", "extra"]);
  expect(next.players[2]!.hand.map(({ instanceId }) => instanceId)).toEqual(["a"]);
  expect(state).toEqual(before);
});

// Break caught: threshold >25 or returning eliminated cards to either pile.
test("Mercy removes hands at 25 and above while preserving 24 and both piles", () => {
  const state = table();
  for (const [index, count] of [[0, 24], [2, 25], [3, 26]]) {
    state.players[index!]!.hand = Array.from({ length: count! }, (_, i) => ({ instanceId: `${index}-${i}`, faceId: "red-1" }));
  }
  const before = structuredClone(state);
  const next = applyMercyRule(state);
  expect(next.players.map(({ eliminated, hand }) => [eliminated, hand.length])).toEqual([[false, 24], [true, 0], [true, 0], [true, 0]]);
  expect(next.drawPile).toEqual(before.drawPile);
  expect(next.discardPile).toEqual(before.discardPile);
  expect(next.players.every(({ eliminatedByPlayerId }) => eliminatedByPlayerId === null)).toBe(true);
  expect(state).toEqual(before);
});

// Catches dropping the gameplay actor or replacing a previously recorded cause.
test("Mercy attributes only new eliminations to the supplied actor", () => {
  const state = table();
  state.players[1]!.eliminatedByPlayerId = "d";
  state.players[2]!.hand = Array.from({ length: 25 }, (_, i) => ({ instanceId: `large-${i}`, faceId: "blue-2" }));
  const before = structuredClone(state);
  const next = applyMercyRule(state, "a");
  expect(next.players[2]).toMatchObject({ eliminated: true, hand: [], eliminatedByPlayerId: "a" });
  expect(next.players[0]).toMatchObject({ eliminated: false, eliminatedByPlayerId: null });
  expect(next.players[1]).toMatchObject({ eliminated: true, eliminatedByPlayerId: "d" });
  expect(applyMercyRule(next, "c").players[2]!.eliminatedByPlayerId).toBe("a");
  expect(applyMercyRule(next).players[2]!.eliminatedByPlayerId).toBe("a");
  expect(state).toEqual(before);
});
