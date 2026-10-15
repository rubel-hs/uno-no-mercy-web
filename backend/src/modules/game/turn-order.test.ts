import { describe, expect, test } from "bun:test";
import { createGameState } from "./game.engine";
import { getNextEligiblePlayerId } from "./turn-order";
import type { GameState } from "./game.types";

function table(ids: string[], eliminated: string[] = [], direction: 1 | -1 = 1): GameState {
  const state = createGameState({ playerIds: ids, dealerIndex: ids.length - 1,
    deck: Array.from({ length: ids.length * 7 + 2 }, (_, i) => ({ instanceId: `c${i}`, faceId: "red-1" })),
  });
  state.players.forEach((player) => { player.eliminated = eliminated.includes(player.id); });
  state.direction = direction;
  return state;
}

describe("eligible turn traversal", () => {
  // Catches wrong direction, incorrect wraparound, or counting seats instead of eligible players.
  test.each([
    [1, "a", 1, "b"], [1, "c", 1, "a"], [-1, "a", 1, "c"], [-1, "b", 2, "c"],
  ] as const)("moves direction %i from %s by %i eligible turns", (direction, fromPlayerId, steps, expected) => {
    expect(getNextEligiblePlayerId(table(["a", "b", "c"], [], direction), { fromPlayerId, steps })).toBe(expected);
  });

  test("defaults to the current player and one step", () => {
    expect(getNextEligiblePlayerId(table(["a", "b", "c"]))).toBe("b");
  });

  test.each([1, -1] as const)("wraps two-player turns in direction %i", (direction) => {
    const state = table(["a", "b"], [], direction);
    expect(getNextEligiblePlayerId(state)).toBe("b");
    expect(getNextEligiblePlayerId(state, { steps: 2 })).toBe("a");
  });

  test.each([[1, "c", "f"], [-1, "f", "c"]] as const)("skips multiple eliminated seats in direction %i", (direction, first, second) => {
    const state = table(["a", "b", "c", "d", "e", "f"], ["b", "d", "e"], direction);
    expect(getNextEligiblePlayerId(state)).toBe(first);
    expect(getNextEligiblePlayerId(state, { steps: 2 })).toBe(second);
    expect(getNextEligiblePlayerId(state, { steps: 3 })).toBe("a");
  });

  // Catches wrongly treating a temporary disconnect as elimination.
  test("keeps a disconnected player eligible during grace", () => {
    const state = table(["a", "b", "c"]);
    Object.assign(state.players[1]!, { online: false });
    expect(getNextEligiblePlayerId(state)).toBe("b");
  });

  test("returns the sole eligible player without selecting eliminated seats", () => {
    expect(getNextEligiblePlayerId(table(["a", "b", "c"], ["a", "b"]))).toBe("c");
  });

  test("returns null when no eligible player remains", () => {
    expect(getNextEligiblePlayerId(table(["a", "b", "c"], ["a", "b", "c"]))).toBeNull();
  });

  test("returns null for an empty table or unknown starting player", () => {
    expect(getNextEligiblePlayerId({ ...table(["a", "b"]), players: [] })).toBeNull();
    expect(getNextEligiblePlayerId(table(["a", "b"]), { fromPlayerId: "absent" })).toBeNull();
  });
});
