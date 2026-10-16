import { describe, expect, test } from "bun:test";
import { applyGameCommand, createGameState, getPlayableCardIds } from "./game.engine";
import type { GameState, PhysicalCard } from "./game.types";

const card = (instanceId: string, faceId: string): PhysicalCard => ({ instanceId, faceId });

// Task 4 fixtures name physical cards so effects can be checked independently.
const handOf = (state: GameState, id: string) => state.players.find((player) => player.id === id)!.hand.map((card) => card.instanceId);

function fixture(overrides: Partial<GameState> = {}): GameState {
  return {
    players: [
      { id: "a", hand: [card("red", "red-3"), card("number", "blue-5"), card("bad", "green-2")], eliminated: false, eliminatedByPlayerId: null },
      { id: "b", hand: [card("b1", "yellow-1")], eliminated: false, eliminatedByPlayerId: null },
      { id: "c", hand: [card("c1", "blue-1")], eliminated: false, eliminatedByPlayerId: null },
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
    gameplaySequence: 0,
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

  test("draws one playable card without playing it and passes", () => {
    const state = fixture({ drawPile: [card("drawn", "red-skip"), card("later", "green-9")] });
    const before = structuredClone(state);
    const result = applyGameCommand(state, { type: "draw-and-pass", playerId: "a" });

    expect(result.ok).toBe(true);
    expect(result.state.players[0]!.hand.map(({ instanceId }) => instanceId)).toEqual([
      "red", "number", "bad", "drawn",
    ]);
    expect(result.state.discardPile).toEqual(before.discardPile);
    expect(result.state.drawPile).toEqual([card("later", "green-9")]);
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

  // Catches bypassing action effects or UNO after multiple unsuccessful draws.
  test("multiple draws immediately resolve the first playable action", () => {
    const state = drawFixture({ drawPile: [
      card("miss-1", "blue-2"), card("miss-2", "yellow-4"),
      card("action", "red-draw-2"), card("later", "red-9"),
    ] });
    const result = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(result.ok).toBe(true);
    expect(handOf(result.state, "a")).toEqual(["bad", "miss-1", "miss-2"]);
    expect(result.state.discardPile.at(-1)?.instanceId).toBe("action");
    expect(result.state.drawPile).toEqual([card("later", "red-9")]);
    expect(result.state).toMatchObject({ currentPlayerId: "b", drawStack: { amount: 2, minimumDrawValue: 2 } });
    if (result.ok) expect(result.events).toEqual([
      { type: "cards-drawn", playerId: "a", cardIds: ["miss-1", "miss-2", "action"] },
      { type: "card-played", playerId: "a", cardId: "action" },
      { type: "turn-changed", playerId: "b" },
    ]);
  });

  test("drawn wild opens UNO and completes its normal color choice and penalty", () => {
    const state = drawFixture({ drawPile: [card("wild", "wild-draw-6"), card("later", "blue-8")] });
    const played = applyGameCommand(state, { type: "draw-until-playable", playerId: "a" });
    expect(played.ok).toBe(true);
    expect(played.state).toMatchObject({
      phase: "awaiting-choice", pendingChoice: { type: "choose-color", playerId: "a" },
      unoWindow: { playerId: "a", declared: false }, drawStack: { amount: 6, minimumDrawValue: 6 },
    });
    const chosen = applyGameCommand(played.state, { type: "choose-color", playerId: "a", color: "yellow" });
    expect(chosen.ok).toBe(true);
    expect(chosen.state).toMatchObject({ phase: "playing", activeColor: "yellow", currentPlayerId: "b", revision: 2 });
    expect(handOf(chosen.state, "a")).toEqual(["bad"]);
    expect(chosen.state.drawPile).toEqual([card("later", "blue-8")]);
  });

  test("rejects draw-and-pass without a playable held card atomically", () => {
    const state = drawFixture();
    const before = structuredClone(state);
    expect(applyGameCommand(state, { type: "draw-and-pass", playerId: "a" })).toEqual({ ok: false, code: "invalid-phase", state });
    expect(state).toEqual(before);
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
    id, hand: [card(`${id}-keep`, "blue-1")], eliminated: false, eliminatedByPlayerId: null,
  }));
  state.players[0]!.hand.unshift(card("action", faceId));
  state.drawPile = Array.from({ length: 24 }, (_, i) => card(`penalty-${i}`, "green-2"));
  return state;
}

describe("hand effects and immediate wins", () => {
  // Break caught: 7 advancing before target choice, accepting self/eliminated targets, or partial swap.
  test("requires an active other target for 7 then swaps complete hands", () => {
    const state = actionFixture("red-7", 4);
    state.players[2]!.eliminated = true;
    state.players[1]!.hand.push(card("b-extra", "yellow-2"));
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    expect(played.state.pendingChoice).toEqual({ type: "choose-swap-target", playerId: "a" });
    for (const targetPlayerId of ["a", "c", "absent"]) {
      const rejected = applyGameCommand(played.state, { type: "choose-swap-target", playerId: "a", targetPlayerId });
      expect(rejected.ok).toBe(false);
      expect(rejected.state).toBe(played.state);
    }
    expect(applyGameCommand(played.state, { type: "choose-swap-target", playerId: "b", targetPlayerId: "d" }).ok).toBe(false);
    const swapped = applyGameCommand(played.state, { type: "choose-swap-target", playerId: "a", targetPlayerId: "b" });
    expect(swapped.ok).toBe(true);
    expect(handOf(swapped.state, "a")).toEqual(["b-keep", "b-extra"]);
    expect(handOf(swapped.state, "b")).toEqual(["a-keep"]);
    expect(swapped.state).toMatchObject({ currentPlayerId: "b", pendingChoice: null, phase: "playing", revision: 2 });
  });

  test.each([[1, ["f-keep", "a-keep", "c-keep"]], [-1, ["c-keep", "f-keep", "a-keep"]]] as const)("0 passes active hands in direction %i through six seats", (direction, expected) => {
    const state = actionFixture("red-0", 6);
    state.direction = direction;
    state.players.forEach((player) => { if (["b", "d", "e"].includes(player.id)) { player.eliminated = true; player.hand = []; } });
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    expect([handOf(played.state, "a")[0], handOf(played.state, "c")[0], handOf(played.state, "f")[0]]).toEqual([...expected]);
    expect(played.state.currentPlayerId).toBe(direction === 1 ? "c" : "f");
  });

  // Break caught: extra discards covering the action or discarding unrelated colors.
  test("Discard All places every matching card beneath the visible action", () => {
    const state = actionFixture("red-discard-all");
    state.players[0]!.hand.push(card("red-number", "red-2"), card("red-action", "red-draw-4"));
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    expect(handOf(played.state, "a")).toEqual(["a-keep"]);
    expect(played.state.discardPile.map(({ instanceId }) => instanceId)).toEqual(["top", "red-number", "red-action", "action"]);
    expect(played.state).toMatchObject({ phase: "playing", currentPlayerId: "b", pendingChoice: null });
  });

  // Break caught: final effects (direction/penalty/pass/swap/roulette) running after victory.
  test.each(["red-3", "red-7", "red-0", "red-reverse", "red-draw-4", "wild-reverse-draw-4", "wild-draw-10", "wild-color-roulette", "red-discard-all"])("playing final %s wins before residual effects", (faceId) => {
    const state = actionFixture(faceId);
    state.players[0]!.hand = [card("action", faceId)];
    const before = structuredClone(state);
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    expect(played.ok).toBe(true);
    expect(played.state).toMatchObject({ phase: "finished", winner: "a", pendingChoice: null, drawStack: null, unoWindow: null, direction: 1, revision: 1 });
    expect(handOf(played.state, "b")).toEqual(["b-keep"]);
    expect(state).toEqual(before);
    expect(applyGameCommand(played.state, { type: "declare-uno", playerId: "b" }).ok).toBe(false);
  });

  test("Discard All wins when its extra discards empty the hand", () => {
    const state = actionFixture("red-discard-all");
    state.players[0]!.hand[1] = card("extra", "red-9");
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    expect(played.state).toMatchObject({ phase: "finished", winner: "a" });
    expect(handOf(played.state, "a")).toEqual([]);
    expect(played.state.discardPile.map(({ instanceId }) => instanceId)).toEqual(["top", "extra", "action"]);
  });
});

describe("roulette and Mercy", () => {
  // Break caught: wrong owner, wild matching a color, partial reveal retention, or wrong turn/color.
  test("roulette affected player reveals through wilds to the chosen color then loses their turn", () => {
    const state = actionFixture("wild-color-roulette");
    state.drawPile = [card("wild", "wild-draw-6"), card("other", "green-2"), card("match", "yellow-3"), card("later", "blue-4")];
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" }).state;
    expect(applyGameCommand(played, { type: "choose-roulette-color", playerId: "a", color: "yellow" }).ok).toBe(false);
    const resolved = applyGameCommand(played, { type: "choose-roulette-color", playerId: "b", color: "yellow" });
    expect(resolved.ok).toBe(true);
    expect(handOf(resolved.state, "b")).toEqual(["b-keep", "wild", "other", "match"]);
    expect(resolved.state.drawPile.map(({ instanceId }) => instanceId)).toEqual(["later"]);
    expect(resolved.state).toMatchObject({ currentPlayerId: "c", activeColor: "yellow", phase: "playing", pendingChoice: null, revision: 2 });
  });

  test("roulette rejects impossible reveal atomically", () => {
    const state = actionFixture("wild-color-roulette");
    state.drawPile = [card("other", "green-2")];
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" }).state;
    const before = structuredClone(played);
    expect(applyGameCommand(played, { type: "choose-roulette-color", playerId: "b", color: "yellow" })).toEqual({ ok: false, code: "deck-exhausted", state: played });
    expect(played).toEqual(before);
  });

  // Break caught: drawing through 25, auto-playing a 25th playable card, or selecting an eliminated seat.
  test.each(["draw-until-playable", "accept-draw", "roulette"] as const)("Mercy interrupts %s on the 25th card and traverses six seats", (mode) => {
    const state = actionFixture("red-3", 6);
    state.players[0]!.hand = Array.from({ length: 24 }, (_, i) => card(`held-${i}`, "green-1"));
    state.players.forEach((player) => { if (["b", "d", "e"].includes(player.id)) { player.eliminated = true; player.hand = []; } });
    state.drawPile = [card("twenty-fifth", "red-2"), card("untouched", "yellow-3")];
    if (mode === "accept-draw") state.drawStack = { amount: 10, minimumDrawValue: 4 };
    if (mode === "roulette") { state.phase = "awaiting-choice"; state.pendingChoice = { type: "choose-roulette-color", playerId: "a" }; }
    const result = applyGameCommand(state, mode === "roulette" ? { type: "choose-roulette-color", playerId: "a", color: "yellow" } : { type: mode, playerId: "a" });
    expect(result.ok).toBe(true);
    expect(result.state.players[0]).toMatchObject({ eliminated: true, hand: [], eliminatedByPlayerId: "a" });
    expect(result.state.drawPile.map(({ instanceId }) => instanceId)).toEqual(["untouched"]);
    expect(result.state).toMatchObject({ phase: "playing", currentPlayerId: "c", drawStack: null, pendingChoice: null });
    expect(result.state.discardPile).toEqual([card("top", "red-5")]);
  });

  test.each(["red-0", "red-7"])("Mercy runs after %s transfers a hand", (faceId) => {
    const state = actionFixture(faceId);
    state.players[1]!.hand = Array.from({ length: 25 }, (_, i) => card(`large-${i}`, "blue-2"));
    let result = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    if (faceId === "red-7") result = applyGameCommand(result.state, { type: "choose-swap-target", playerId: "a", targetPlayerId: "b" });
    const eliminatedId = faceId === "red-0" ? "c" : "a";
    expect(result.state.players.find(({ id }) => id === eliminatedId)).toMatchObject({ eliminated: true, hand: [], eliminatedByPlayerId: "a" });
  });

  // Catches skipping Mercy on a voluntary draw or advancing after the last opponent is eliminated.
  test.each([2, 3])("draw-and-pass applies Mercy and attribution with %i players", (count) => {
    const state = actionFixture("red-3", count);
    state.players[0]!.hand = Array.from({ length: 24 }, (_, i) => card(`held-${i}`, "red-1"));
    state.drawPile = [card("twenty-fifth", "red-skip"), card("untouched", "yellow-3")];
    const before = structuredClone(state);
    const result = applyGameCommand(state, { type: "draw-and-pass", playerId: "a" });
    expect(result.ok).toBe(true);
    expect(result.state.players[0]).toMatchObject({ eliminated: true, hand: [], eliminatedByPlayerId: "a" });
    expect(result.state.drawPile).toEqual([card("untouched", "yellow-3")]);
    expect(result.state.discardPile).toEqual(before.discardPile);
    expect(result.state).toMatchObject({ phase: count === 2 ? "finished" : "playing", winner: count === 2 ? "b" : null, revision: 1 });
    if (result.ok) expect(result.events).toEqual(count === 2 ? [
      { type: "cards-drawn", playerId: "a", cardIds: ["twenty-fifth"] },
    ] : [
      { type: "cards-drawn", playerId: "a", cardIds: ["twenty-fifth"] },
      { type: "turn-changed", playerId: "b" },
    ]);
    expect(state).toEqual(before);
  });

  test("the last active player wins when a draw eliminates their only opponent", () => {
    const state = actionFixture("red-3", 2);
    state.players[0]!.hand = Array.from({ length: 24 }, (_, i) => card(`held-${i}`, "blue-2"));
    state.drawStack = { amount: 6, minimumDrawValue: 6 };
    const result = applyGameCommand(state, { type: "accept-draw", playerId: "a" });
    expect(result.state).toMatchObject({ phase: "finished", winner: "b", pendingChoice: null, drawStack: null, unoWindow: null });
    expect(handOf(result.state, "a")).toEqual([]);
  });

  test("Mercy attribution on accept-draw and roulette credits the attacking player who played the card", () => {
    // 1. Draw stack: "a" plays red-draw-4, "b" holds 22 cards and accepts draw
    const drawState = actionFixture("red-draw-4", 3);
    drawState.players[1]!.hand = Array.from({ length: 22 }, (_, i) => card(`b-${i}`, "blue-1"));
    drawState.drawPile = Array.from({ length: 10 }, (_, i) => card(`d-${i}`, "yellow-1"));
    const afterPlay = applyGameCommand(drawState, { type: "play-card", playerId: "a", cardId: "action" });
    expect(afterPlay.ok).toBe(true);
    expect(afterPlay.state.currentPlayerId).toBe("b");
    const afterAccept = applyGameCommand(afterPlay.state, { type: "accept-draw", playerId: "b" });
    expect(afterAccept.ok).toBe(true);
    expect(afterAccept.state.players.find(({ id }) => id === "b")!).toMatchObject({
      eliminated: true,
      eliminatedByPlayerId: "a",
    });

    // 2. Roulette: "a" plays wild-color-roulette, "b" holds 24 cards and chooses color
    const rouletteState = actionFixture("wild-color-roulette", 3);
    rouletteState.players[1]!.hand = Array.from({ length: 24 }, (_, i) => card(`b-${i}`, "blue-1"));
    rouletteState.drawPile = [card("r-1", "green-1"), card("r-2", "yellow-1")];
    const afterRoulettePlay = applyGameCommand(rouletteState, { type: "play-card", playerId: "a", cardId: "action" });
    expect(afterRoulettePlay.ok).toBe(true);
    expect(afterRoulettePlay.state.pendingChoice).toMatchObject({ type: "choose-roulette-color", playerId: "b" });
    const afterChoice = applyGameCommand(afterRoulettePlay.state, { type: "choose-roulette-color", playerId: "b", color: "yellow" });
    expect(afterChoice.ok).toBe(true);
    expect(afterChoice.state.players.find(({ id }) => id === "b")!).toMatchObject({
      eliminated: true,
      eliminatedByPlayerId: "a",
    });
  });
});

describe("serialized UNO race", () => {
  const opening = (declareUno = false) => applyGameCommand(actionFixture("red-3"), { type: "play-card", playerId: "a", cardId: "action", declareUno }).state;

  // Break caught: ignoring inline declaration or letting a resolved catch penalize twice.
  test("inline UNO prevents a catch", () => {
    const state = opening(true);
    expect(state.unoWindow).toMatchObject({ playerId: "a", declared: true });
    expect(applyGameCommand(state, { type: "catch-uno", playerId: "b", targetPlayerId: "a" }).ok).toBe(false);
    expect(handOf(state, "a")).toEqual(["a-keep"]);
  });

  test("a separate declaration wins the race before a valid next action", () => {
    const declared = applyGameCommand(opening(), { type: "declare-uno", playerId: "a" });
    expect(declared.ok).toBe(true);
    expect(declared.state.revision).toBe(2);
    expect(applyGameCommand(declared.state, { type: "catch-uno", playerId: "c", targetPlayerId: "a" }).ok).toBe(false);
  });

  test("a catch first draws exactly two and closes the vulnerability", () => {
    const state = opening();
    const before = structuredClone(state);
    const caught = applyGameCommand(state, { type: "catch-uno", playerId: "c", targetPlayerId: "a" });
    expect(caught.ok).toBe(true);
    expect(handOf(caught.state, "a")).toEqual(["a-keep", "penalty-0", "penalty-1"]);
    expect(caught.state).toMatchObject({ currentPlayerId: "b", revision: 2, unoWindow: null });
    expect(applyGameCommand(caught.state, { type: "declare-uno", playerId: "a" }).ok).toBe(false);
    expect(applyGameCommand(caught.state, { type: "catch-uno", playerId: "b", targetPlayerId: "a" }).ok).toBe(false);
    expect(state).toEqual(before);
  });

  test("invalid gameplay does not close UNO but the next accepted action does", () => {
    const state = opening();
    expect(applyGameCommand(state, { type: "play-card", playerId: "b", cardId: "missing" }).ok).toBe(false);
    expect(applyGameCommand(state, { type: "declare-uno", playerId: "a" }).ok).toBe(true);
    state.players[1]!.hand.push(card("b-play", "red-2"));
    const advanced = applyGameCommand(state, { type: "play-card", playerId: "b", cardId: "b-play" });
    expect(advanced.ok).toBe(true);
    expect(applyGameCommand(advanced.state, { type: "catch-uno", playerId: "c", targetPlayerId: "a" }).ok).toBe(false);
  });

  test("own mandatory choice does not consume the next-player UNO boundary", () => {
    const played = applyGameCommand(actionFixture("wild-draw-6"), { type: "play-card", playerId: "a", cardId: "action" });
    const chosen = applyGameCommand(played.state, { type: "choose-color", playerId: "a", color: "red" });
    expect(applyGameCommand(chosen.state, { type: "declare-uno", playerId: "a" }).ok).toBe(true);
    expect(applyGameCommand(chosen.state, { type: "catch-uno", playerId: "b", targetPlayerId: "a" }).ok).toBe(true);
  });

  test("only another active player can catch the vulnerable player", () => {
    const state = opening();
    state.players[2]!.eliminated = true;
    for (const playerId of ["a", "c", "absent"]) expect(applyGameCommand(state, { type: "catch-uno", playerId, targetPlayerId: "a" }).ok).toBe(false);
    expect(applyGameCommand(state, { type: "declare-uno", playerId: "b" }).ok).toBe(false);
  });

  test("an impossible UNO penalty rejects atomically and preserves the open race", () => {
    const state = opening();
    state.drawPile = [card("only-draw", "green-2")];
    state.discardPile = [state.discardPile.at(-1)!];
    const before = structuredClone(state);
    const caught = applyGameCommand(state, { type: "catch-uno", playerId: "b", targetPlayerId: "a" });
    expect(caught).toEqual({ ok: false, code: "deck-exhausted", state });
    expect(state).toEqual(before);
    expect(applyGameCommand(state, { type: "declare-uno", playerId: "a" }).ok).toBe(true);
  });

  // Ruling: forced recipients never open a new window; preserve it only for
  // the actor who reduced their own hand to one and still holds one afterward.
  test.each(["red-0", "red-7"])("%s keeps UNO tied to its actor through the hand effect", (faceId) => {
    const state = actionFixture(faceId);
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    const resolved = faceId === "red-7" ? applyGameCommand(played.state, { type: "choose-swap-target", playerId: "a", targetPlayerId: "b" }) : played;
    expect(resolved.state.unoWindow).toMatchObject({ playerId: "a", declared: false });
    expect(applyGameCommand(resolved.state, { type: "declare-uno", playerId: "b" }).ok).toBe(false);
  });

  test.each(["red-0", "red-7"])("%s clears actor UNO after receiving a larger hand", (faceId) => {
    const state = actionFixture(faceId);
    state.players[faceId === "red-7" ? 1 : 2]!.hand.push(card("extra", "blue-2"));
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    const resolved = faceId === "red-7" ? applyGameCommand(played.state, { type: "choose-swap-target", playerId: "a", targetPlayerId: "b" }) : played;
    expect(resolved.state.unoWindow).toBeNull();
    expect(applyGameCommand(resolved.state, { type: "catch-uno", playerId: "c", targetPlayerId: "a" }).ok).toBe(false);
  });

  test.each(["red-0", "red-7"])("%s does not open UNO just for receiving a single card", (faceId) => {
    const state = actionFixture(faceId);
    state.players[0]!.hand.push(card("extra", "green-2"));
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    const resolved = faceId === "red-7" ? applyGameCommand(played.state, { type: "choose-swap-target", playerId: "a", targetPlayerId: "b" }) : played;
    expect(handOf(resolved.state, "a")).toHaveLength(1);
    expect(resolved.state.unoWindow).toBeNull();
  });
});

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
    expect(played.state.drawStack).toMatchObject({ amount: 16, minimumDrawValue: 6 });
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

  test.each(["draw-until-playable", "draw-and-pass"] as const)("rejects %s during a stack", (type) => {
    const state = stackFixture();
    expect(applyGameCommand(state, { type, playerId: "a" })).toMatchObject({ ok: false, code: "invalid-phase" });
  });

  test("rejects taking a nonexistent penalty or acting out of turn", () => {
    expect(applyGameCommand(fixture(), { type: "accept-draw", playerId: "a" })).toMatchObject({ ok: false, code: "invalid-phase" });
    expect(applyGameCommand(stackFixture(), { type: "accept-draw", playerId: "b" })).toMatchObject({ ok: false, code: "out-of-turn" });
  });
});

describe("draw pile boundaries", () => {
  // Catches a Discard All becoming drawable when its removed cards are recycled.
  test("recycles Discard All extras while retaining the action as the visible discard", () => {
    const state = actionFixture("red-discard-all");
    state.players[0]!.hand.push(card("extra", "red-9"));
    state.drawPile = [];
    const played = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "action" });
    const drawn = applyGameCommand(played.state, { type: "draw-until-playable", playerId: "b" });
    expect(drawn.ok).toBe(true);
    expect(drawn.state.discardPile[0]).toEqual(card("action", "red-discard-all"));
    const recycledIds = [
      ...handOf(drawn.state, "b"), ...drawn.state.drawPile.map(({ instanceId }) => instanceId),
      ...drawn.state.discardPile.slice(1).map(({ instanceId }) => instanceId),
    ].sort();
    expect(recycledIds).toEqual(["b-keep", "extra", "top"]);
    expect(drawn.state.discardPile.at(-1)?.instanceId).not.toBe("action");
  });
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
