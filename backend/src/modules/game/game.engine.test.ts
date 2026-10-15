import { describe, expect, test } from "bun:test";
import { applyGameCommand, createGameState, getPlayableCardIds } from "./game.engine";
import type { GameState, PhysicalCard } from "./game.types";

const card = (instanceId: string, faceId: string): PhysicalCard => ({ instanceId, faceId });

function fixture(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      { id: "a", hand: [card("red", "red-3"), card("number", "blue-5"), card("bad", "green-2")], eliminated: false },
      { id: "b", hand: [card("b1", "yellow-1")], eliminated: false },
      { id: "c", hand: [card("c1", "blue-1")], eliminated: false },
    ],
    drawPile: [card("draw", "red-8")],
    discardPile: [card("top", "red-5")],
    direction: 1,
    currentPlayerId: "a",
    activeColor: "red",
    phase: "playing",
    pendingChoice: null,
    drawStack: null,
    unoWindow: null,
    winner: null,
    revision: 0,
    ...overrides,
  };
}

describe("game setup", () => {
  // Catches dealing the wrong count, wrong order, or consuming the wrong deck end.
  test.each([2, 3, 4, 5, 6])("deals seven cards to %i players", (count) => {
    const deck = Array.from({ length: count * 7 + 3 }, (_, index) => card(`c${index}`, "red-1"));
    const playerIds = ["a", "b", "c", "d", "e", "f"].slice(0, count);
    const before = structuredClone(deck);
    const state = createGameState({ playerIds, deck, dealerIndex: count - 1 });
    expect(state.players.map(({ id }) => id)).toEqual(playerIds);
    expect(state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      [0, 1, 2, 3, 4, 5, 6].map((round) => `c${round * count}`),
    );
    expect(state.players[count - 1]!.hand.map(({ instanceId }) => instanceId)).toEqual(
      [0, 1, 2, 3, 4, 5, 6].map((round) => `c${round * count + count - 1}`),
    );
    expect(state.players.every(({ hand }) => hand.length === 7)).toBe(true);
    expect(state.drawPile).toHaveLength(2);
    expect(state.discardPile).toEqual([card(`c${count * 7}`, "red-1")]);
    expect(state.revision).toBe(0);
    expect(deck).toEqual(before);
  });

  // Catches ignoring the injected dealer or starting counterclockwise.
  test.each([[0, "b"], [1, "c"], [2, "a"]] as const)("chooses the player left of dealer %i and starts clockwise", (dealerIndex, expected) => {
    const state = createGameState({ playerIds: ["a", "b", "c"], deck: Array.from({ length: 25 }, (_, i) => card(`c${i}`, "blue-2")), dealerIndex });
    expect(state.currentPlayerId).toBe(expected);
    expect(state.direction).toBe(1);
  });

  // Catches losing setup actions or applying their effects instead of exposing a number.
  test("moves setup action cards into discard until a number is visible", () => {
    const state = createGameState({ playerIds: ["a", "b"], dealerIndex: 1, deck: [
      ...Array.from({ length: 14 }, (_, i) => card(`c${i}`, "red-1")),
      card("skip", "red-skip"), card("wild", "wild-draw-10"), card("number", "blue-4"), card("remaining", "green-2"),
    ] });
    expect(state.discardPile.map(({ instanceId }) => instanceId)).toEqual(["skip", "wild", "number"]);
    expect(state.drawPile).toEqual([card("remaining", "green-2")]);
    expect(state.activeColor).toBe("blue");
    expect(state.currentPlayerId).toBe("a");
    expect(state.drawStack).toBeNull();
    expect(state.pendingChoice).toBeNull();
    expect(state.phase).toBe("playing");
  });
});

describe("normal turns", () => {
  // Catches matching by color alone, number alone, or treating wild as a color.
  test("finds legal color, number, symbol, and wild matches", () => {
    const state = fixture();
    state.players[0]!.hand.push(card("wild", "wild-draw-6"));
    expect(getPlayableCardIds(state, "a")).toEqual(["red", "number", "wild"]);
    const symbol = fixture({ discardPile: [card("skip", "yellow-skip")], activeColor: "yellow" });
    symbol.players[0]!.hand = [card("same-symbol", "blue-skip"), card("different-symbol", "blue-reverse")];
    expect(getPlayableCardIds(symbol, "a")).toEqual(["same-symbol"]);
    expect(getPlayableCardIds(state, "absent")).toEqual([]);
  });

  // Catches accepting an unauthorized, missing, or mismatched card and mutation on rejection.
  test.each([
    ["b", "b1", "out-of-turn"], ["a", "missing", "card-not-in-hand"], ["a", "bad", "illegal-play"],
  ] as const)("rejects %s playing %s with %s", (playerId, cardId, code) => {
    const state = fixture();
    const before = structuredClone(state);
    expect(applyGameCommand(state, { type: "play-card", playerId, cardId })).toEqual({ ok: false, code, state });
    expect(state).toEqual(before);
  });

  // Catches failing to remove the physical card, advance the turn, or increment once.
  test.each([["red", "red"], ["number", "blue"]] as const)("plays %s and advances one clockwise turn", (cardId, color) => {
    const state = fixture();
    const before = structuredClone(state);
    const result = applyGameCommand(state, { type: "play-card", playerId: "a", cardId });
    expect(result.ok).toBe(true);
    expect(result.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(cardId === "red" ? ["number", "bad"] : ["red", "bad"]);
    expect(result.state.discardPile.at(-1)?.instanceId).toBe(cardId);
    expect(result.state.currentPlayerId).toBe("b");
    expect(result.state.activeColor).toBe(color);
    expect(result.state.revision).toBe(1);
    expect(state).toEqual(before);
  });

  // Catches drawing a fixed single card, drawing past the playable card, or retaining it in hand.
  test("draws until the first playable card and immediately plays it", () => {
    const state = fixture({ drawPile: [card("d1", "green-1"), card("d2", "yellow-2"), card("d3", "blue-5"), card("d4", "red-9")] });
    const before = structuredClone(state);
    const result = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(result.ok).toBe(true);
    expect(result.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(["red", "number", "bad", "d1", "d2"]);
    expect(result.state.discardPile.at(-1)).toEqual(card("d3", "blue-5"));
    expect(result.state.drawPile).toEqual([card("d4", "red-9")]);
    expect(result.state.currentPlayerId).toBe("b");
    expect(result.state.revision).toBe(1);
    expect(state).toEqual(before);
  });

  // Catches skipping a playable action or wild while searching for a number.
  test.each(["red-skip", "wild-draw-6"])("immediately plays drawn %s and leaves its effect pending", (faceId) => {
    const state = fixture({ drawPile: [card("action", faceId), card("later", "red-9")] });
    const result = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(result.ok).toBe(true);
    expect(result.state.discardPile.at(-1)).toEqual(card("action", faceId));
    expect(result.state.drawPile).toEqual([card("later", "red-9")]);
    expect(result.state.players[0]!.hand).toHaveLength(3);
    expect(result.state.phase).toBe("pending-effect");
    expect(result.state.pendingChoice).toEqual({ type: "resolve-action", playerId: "a", cardId: "action" });
    expect(result.state.currentPlayerId).toBe("a");
    expect(result.state.revision).toBe(1);
  });

  // Catches taking the previous player in the wrong direction.
  test("advances counterclockwise when direction is reversed", () => {
    const result = applyGameCommand(fixture({ direction: -1 }), { type: "play-card", playerId: "a", cardId: "red" });
    expect(result.state.currentPlayerId).toBe("c");
  });
});

describe("draw pile boundaries", () => {
  // Catches recycling the visible card or losing old discards during rebuild.
  test("rebuilds the draw pile while preserving the visible discard", () => {
    const state = fixture({ drawPile: [], discardPile: [card("recycle", "blue-5"), card("top", "red-5")] });
    const before = structuredClone(state);
    const result = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(result.ok).toBe(true);
    expect(result.state.discardPile).toEqual([card("top", "red-5"), card("recycle", "blue-5")]);
    expect(result.state.drawPile).toEqual([]);
    expect(state).toEqual(before);
  });

  // Catches duplicating the sole visible discard into a player's hand.
  test("does not duplicate the sole visible discard", () => {
    const state = fixture({ drawPile: [] });
    const result = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(result).toEqual({ ok: false, code: "deck-exhausted", state });
    expect(result.state.discardPile).toEqual([card("top", "red-5")]);
    expect(result.state.players[0]!.hand).toHaveLength(3);
  });

  // Catches partial draws leaking into rejected state when all available cards fail to match.
  test("returns deck-exhausted without mutating state when no card can be recycled", () => {
    const state = fixture({ drawPile: [card("unplayable", "green-1")] });
    const before = structuredClone(state);
    const result = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(result).toEqual({ ok: false, code: "deck-exhausted", state });
    expect(result.state).toBe(state);
    expect(state).toEqual(before);
  });
});
