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

function drawFixture(overrides: Partial<GameState> = {}): GameState {
  const state = fixture(overrides);
  state.players[0]!.hand = [card("bad", "green-2")];
  return state;
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
    const state = drawFixture({ drawPile: [card("d1", "green-1"), card("d2", "yellow-2"), card("d3", "blue-5"), card("d4", "red-9")] });
    const before = structuredClone(state);
    const result = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(result.ok).toBe(true);
    expect(result.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual(["bad", "d1", "d2"]);
    expect(result.state.discardPile.at(-1)).toEqual(card("d3", "blue-5"));
    expect(result.state.drawPile).toEqual([card("d4", "red-9")]);
    expect(result.state.currentPlayerId).toBe("b");
    expect(result.state.revision).toBe(1);
    expect(state).toEqual(before);
  });

  // Catches bypassing a mandatory held play through any legal match category.
  test.each([
    ["color", "red-3", "red-5"],
    ["number", "blue-5", "red-5"],
    ["symbol", "blue-skip", "red-skip"],
    ["wild", "wild-draw-6", "red-5"],
  ])("rejects drawing with a playable %s match in hand", (_match, faceId, topFaceId) => {
    const state = fixture({ discardPile: [card("top", topFaceId)] });
    state.players[0]!.hand = [card("held", faceId), card("bad", "green-2")];
    const before = structuredClone(state);
    const result = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(result).toMatchObject({ ok: false, code: "playable-card-in-hand" });
    expect(result.state).toBe(state);
    expect(state).toEqual(before);
    expect(state.revision).toBe(0);
  });

  // Catches skipping a playable action or wild while searching for a number.
  test.each(["red-skip", "wild-draw-6"])("immediately plays drawn %s and resolves or requests its choice", (faceId) => {
    const state = drawFixture({ drawPile: [card("action", faceId), card("later", "red-9")] });
    const result = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(result.ok).toBe(true);
    expect(result.state.discardPile.at(-1)).toEqual(card("action", faceId));
    expect(result.state.drawPile).toEqual([card("later", "red-9")]);
    expect(result.state.players[0]!.hand).toHaveLength(1);
    expect(result.state.phase).toBe(faceId === "red-skip" ? "playing" : "awaiting-choice");
    expect(result.state.pendingChoice).toEqual(faceId === "red-skip" ? null : { type: "choose-color", playerId: "a" });
    expect(result.state.currentPlayerId).toBe(faceId === "red-skip" ? "c" : "a");
    expect(result.state.revision).toBe(1);
  });

  // Catches taking the previous player in the wrong direction.
  test("advances counterclockwise when direction is reversed", () => {
    const result = applyGameCommand(fixture({ direction: -1 }), { type: "play-card", playerId: "a", cardId: "red" });
    expect(result.state.currentPlayerId).toBe("c");
  });
});

function actionFixture(faceId: string, count = 3): GameState {
  const state = fixture();
  state.players = ["a", "b", "c", "d", "e", "f"].slice(0, count).map((id) => ({
    id, hand: [card(`${id}-keep`, "blue-1")], eliminated: false,
  }));
  state.players[0]!.hand.unshift(card("action", faceId));
  state.drawPile = Array.from({ length: 24 }, (_, i) => card(`penalty-${i}`, "green-2"));
  return state;
}

describe("action cards", () => {
  // Catches missing effects, incorrect turn counts, and counting eliminated seats as active.
  test.each([
    ["red-skip", 3, "c", 1], ["red-reverse", 3, "c", -1],
    ["red-reverse", 2, "a", -1], ["red-skip-everyone", 6, "a", 1],
  ] as const)("resolves %s with %i players", (faceId, count, currentPlayerId, direction) => {
    const state = actionFixture(faceId, count);
    const before = structuredClone(state);
    const result = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    expect(result.ok).toBe(true);
    expect(result.state).toMatchObject({ currentPlayerId, direction, phase: "playing", pendingChoice: null, revision: 1 });
    expect(state).toEqual(before);
    if (result.ok) expect(result.events.at(-1)).toEqual({ type: "turn-changed", playerId: currentPlayerId });
  });

  test.each([
    ["red-3", 1, "c"], ["red-skip", 1, "f"], ["red-reverse", -1, "f"],
  ] as const)("traverses six seats after %s", (faceId, direction, expected) => {
    const state = actionFixture(faceId, 6);
    state.players.forEach((player) => { player.eliminated = ["b", "d", "e"].includes(player.id); });
    const result = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    expect(result.state.currentPlayerId).toBe(expected);
    expect(result.state.direction).toBe(direction);
  });

  test("uses the two-active-player Reverse rule even with eliminated seats", () => {
    const state = actionFixture("red-reverse", 6);
    state.players.forEach((player) => { player.eliminated = !["a", "e"].includes(player.id); });
    expect(applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" }).state.currentPlayerId).toBe("a");
  });

  test.each([["red-draw-2", 2], ["red-draw-4", 4]] as const)("starts %s with penalty %i", (faceId, amount) => {
    const result = applyGameCommand(actionFixture(faceId), { type: "play-card", playerId: "a", cardId: "action" });
    expect(result.ok).toBe(true);
    expect(result.state).toMatchObject({ currentPlayerId: "b", phase: "playing", drawStack: { amount, minimumDrawValue: amount } });
  });

  // Catches moving the turn before the actor's mandatory color choice or reversing too late.
  test.each([
    ["wild-draw-6", 3, 6, 1, "b"], ["wild-draw-10", 3, 10, 1, "b"],
    ["wild-reverse-draw-4", 3, 4, -1, "c"], ["wild-reverse-draw-4", 2, 4, -1, "a"],
  ] as const)("resolves color for %s with %i players", (faceId, count, amount, direction, nextPlayer) => {
    const played = applyGameCommand(actionFixture(faceId, count), { type: "play-card", playerId: "a", cardId: "action" });
    expect(played.ok).toBe(true);
    expect(played.state).toMatchObject({ currentPlayerId: "a", direction, phase: "awaiting-choice", pendingChoice: { type: "choose-color", playerId: "a" } });
    expect(getPlayableCardIds(played.state, "a")).toEqual([]);
    const chosen = applyGameCommand(played.state, { type: "choose-color", playerId: "a", color: "yellow" });
    expect(chosen.ok).toBe(true);
    expect(chosen.state).toMatchObject({ currentPlayerId: nextPlayer, direction, activeColor: "yellow", phase: "playing", pendingChoice: null, drawStack: { amount, minimumDrawValue: amount }, revision: 2 });
  });

  test("allows a two-player Wild Reverse Draw 4 user to stack onto their own penalty", () => {
    const state = actionFixture("wild-reverse-draw-4", 2);
    state.players[0]!.hand.push(card("stack", "green-draw-4"));
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    const chosen = applyGameCommand(played.state, { type: "choose-color", playerId: "a", color: "red" });
    const stacked = applyGameCommand(chosen.state, { type: "play-card", playerId: "a", cardId: "stack" });
    expect(stacked.ok).toBe(true);
    expect(stacked.state).toMatchObject({ currentPlayerId: "b", drawStack: { amount: 8, minimumDrawValue: 4 } });
  });

  test("prompts the next eligible player for roulette color", () => {
    const state = actionFixture("wild-color-roulette", 6);
    state.players[1]!.eliminated = true;
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    expect(played.ok).toBe(true);
    expect(played.state).toMatchObject({ currentPlayerId: "c", phase: "awaiting-choice", pendingChoice: { type: "choose-roulette-color", playerId: "c" }, drawStack: null });
    expect(played.state.drawPile).toEqual(state.drawPile);
  });

  test("rejects unrelated commands and the wrong owner while a color is pending", () => {
    const played = applyGameCommand(actionFixture("wild-draw-6"), { type: "play-card", playerId: "a", cardId: "action" }).state;
    const before = structuredClone(played);
    expect(applyGameCommand(played, { type: "play-card", playerId: "a", cardId: "a-keep" })).toMatchObject({ ok: false, code: "invalid-phase" });
    expect(applyGameCommand(played, { type: "accept-draw", playerId: "a" })).toMatchObject({ ok: false, code: "invalid-phase" });
    expect(applyGameCommand(played, { type: "choose-color", playerId: "b", color: "blue" })).toMatchObject({ ok: false, code: "out-of-turn" });
    expect(played).toEqual(before);
  });

  test("rejects color choices without a pending color choice", () => {
    const state = fixture();
    expect(applyGameCommand(state, { type: "choose-color", playerId: "a", color: "blue" })).toEqual({ ok: false, code: "invalid-phase", state });
  });
});

describe("draw stacking", () => {
  function stackFixture(): GameState {
    const state = actionFixture("red-draw-4");
    state.drawStack = { amount: 10, minimumDrawValue: 4 };
    state.players[0]!.hand = [card("low", "red-draw-2"), card("equal", "blue-draw-4"), card("high", "wild-draw-6"), card("ordinary", "red-3"), card("roulette", "wild-color-roulette")];
    return state;
  }

  // Catches using accumulated total, color restrictions, or admitting unrelated wild/number cards.
  test("offers only equal-or-higher printed draw values regardless of color", () => {
    expect(getPlayableCardIds(stackFixture(), "a")).toEqual(["equal", "high"]);
  });

  test.each(["low", "ordinary", "roulette"])("rejects %s during a draw stack without mutation", (cardId) => {
    const state = stackFixture();
    const before = structuredClone(state);
    expect(applyGameCommand(state, { type: "play-card", playerId: "a", cardId })).toEqual({ ok: false, code: "illegal-play", state });
    expect(state).toEqual(before);
  });

  test("accumulates penalties using the latest printed value as the next threshold", () => {
    const state = stackFixture();
    state.players[1]!.hand.push(card("next-stack", "yellow-draw-4"));
    const first = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "equal" });
    expect(first.ok).toBe(true);
    expect(first.state).toMatchObject({ currentPlayerId: "b", activeColor: "blue", drawStack: { amount: 14, minimumDrawValue: 4 } });
    const second = applyGameCommand(first.state, { type: "play-card", playerId: "b", cardId: "next-stack" });
    expect(second.ok).toBe(true);
    expect(second.state).toMatchObject({ currentPlayerId: "c", activeColor: "yellow", drawStack: { amount: 18, minimumDrawValue: 4 } });
  });

  test("extends a stack with a higher wild value and waits for its color", () => {
    const played = applyGameCommand(stackFixture(), { type: "play-card", playerId: "a", cardId: "high" });
    expect(played.ok).toBe(true);
    expect(played.state.drawStack).toEqual({ amount: 16, minimumDrawValue: 6 });
    expect(played.state.pendingChoice).toEqual({ type: "choose-color", playerId: "a" });
    const chosen = applyGameCommand(played.state, { type: "choose-color", playerId: "a", color: "green" });
    expect(chosen.ok).toBe(true);
    expect(chosen.state).toMatchObject({ currentPlayerId: "b", drawStack: { amount: 16, minimumDrawValue: 6 } });
  });

  test("accepts the accumulated penalty even when a stack card is held and skips that turn", () => {
    const state = stackFixture();
    const before = structuredClone(state);
    const result = applyGameCommand(state, { type: "accept-draw", playerId: "a" });
    expect(result.ok).toBe(true);
    expect(result.state.players[0]!.hand.slice(5).map(({ instanceId }) => instanceId)).toEqual(["penalty-0", "penalty-1", "penalty-2", "penalty-3", "penalty-4", "penalty-5", "penalty-6", "penalty-7", "penalty-8", "penalty-9"]);
    expect(result.state).toMatchObject({ currentPlayerId: "b", drawStack: null, phase: "playing", revision: 1 });
    expect(result.state.drawPile).toHaveLength(14);
    expect(state).toEqual(before);
    if (result.ok) expect(result.events.map(({ type }) => type)).toEqual(["cards-drawn", "turn-changed"]);
  });

  test("recycles older discards while accepting a penalty and preserves the visible card", () => {
    const state = stackFixture();
    state.drawStack = { amount: 2, minimumDrawValue: 2 };
    state.drawPile = [card("first", "green-1")];
    state.discardPile = [card("recycled", "blue-2"), card("top", "red-draw-2")];
    const result = applyGameCommand(state, { type: "accept-draw", playerId: "a" });
    expect(result.ok).toBe(true);
    expect(result.state.players[0]!.hand.slice(5)).toEqual([card("first", "green-1"), card("recycled", "blue-2")]);
    expect(result.state.discardPile).toEqual([card("top", "red-draw-2")]);
  });

  test("rejects an impossible penalty atomically without losing cards", () => {
    const state = stackFixture();
    state.drawPile = [card("only", "green-1")];
    const before = structuredClone(state);
    expect(applyGameCommand(state, { type: "accept-draw", playerId: "a" })).toEqual({ ok: false, code: "deck-exhausted", state });
    expect(state).toEqual(before);
  });

  test("rejects ordinary drawing during a stack", () => {
    const state = stackFixture();
    expect(applyGameCommand(state, { type: "draw-until-playable", playerId: "a" })).toMatchObject({ ok: false, code: "invalid-phase" });
  });

  test("rejects taking a nonexistent penalty or acting out of turn", () => {
    expect(applyGameCommand(fixture(), { type: "accept-draw", playerId: "a" })).toMatchObject({ ok: false, code: "invalid-phase" });
    expect(applyGameCommand(stackFixture(), { type: "accept-draw", playerId: "b" })).toMatchObject({ ok: false, code: "out-of-turn" });
  });
});

describe("draw pile boundaries", () => {
  // Catches recycling the visible card or losing old discards during rebuild.
  test("rebuilds the draw pile while preserving the visible discard", () => {
    const state = drawFixture({ drawPile: [], discardPile: [card("recycle", "blue-5"), card("top", "red-5")] });
    const before = structuredClone(state);
    const result = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(result.ok).toBe(true);
    expect(result.state.discardPile).toEqual([card("top", "red-5"), card("recycle", "blue-5")]);
    expect(result.state.drawPile).toEqual([]);
    expect(state).toEqual(before);
  });

  // Catches duplicating the sole visible discard into a player's hand.
  test("does not duplicate the sole visible discard", () => {
    const state = drawFixture({ drawPile: [] });
    const result = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(result).toEqual({ ok: false, code: "deck-exhausted", state });
    expect(result.state.discardPile).toEqual([card("top", "red-5")]);
    expect(result.state.players[0]!.hand).toHaveLength(1);
  });

  // Catches partial draws leaking into rejected state when all available cards fail to match.
  test("returns deck-exhausted without mutating state when no card can be recycled", () => {
    const state = drawFixture({ drawPile: [card("unplayable", "green-1")] });
    const before = structuredClone(state);
    const result = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(result).toEqual({ ok: false, code: "deck-exhausted", state });
    expect(result.state).toBe(state);
    expect(state).toEqual(before);
  });
});
