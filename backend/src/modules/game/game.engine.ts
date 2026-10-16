import { CARD_FACES, shuffleDeck } from "./deck";
import type { CardFace, CreateGameInput, GameCommand, GameEvent, GameState, GameTransition, PhysicalCard } from "./game.types";
import { getNextEligiblePlayerId } from "./turn-order";
import { applyMercyRule, passHands, swapHands } from "./hand-rules";

const faces = new Map(CARD_FACES.map((face) => [face.faceId, face]));

function faceOf(card: PhysicalCard): CardFace {
  const face = faces.get(card.faceId);
  if (!face) throw new Error(`Unknown card face: ${card.faceId}`);
  return face;
}

export function createGameState(input: CreateGameInput): GameState {
  const { playerIds, dealerIndex } = input;
  if (playerIds.length < 2 || playerIds.length > 6 || new Set(playerIds).size !== playerIds.length || playerIds.some((id) => !id)) {
    throw new Error("Expected two through six distinct player ids");
  }
  if (!Number.isInteger(dealerIndex) || dealerIndex < 0 || dealerIndex >= playerIds.length) {
    throw new Error("Invalid dealer index");
  }
  if (new Set(input.deck.map((card) => card.instanceId)).size !== input.deck.length) {
    throw new Error("Duplicate physical card id");
  }
  input.deck.forEach(faceOf);
  const drawPile = input.deck.map((card) => ({ ...card }));
  const players = playerIds.map((id) => ({ id, hand: [] as PhysicalCard[], eliminated: false, eliminatedByPlayerId: null }));
  for (let round = 0; round < 7; round++) {
    for (let offset = 1; offset <= players.length; offset++) {
      const card = drawPile.shift();
      if (!card) throw new Error("Insufficient cards to deal");
      players[(dealerIndex + offset) % players.length]!.hand.push(card);
    }
  }
  const discardPile: PhysicalCard[] = [];
  let visible: CardFace;
  do {
    const card = drawPile.shift();
    if (!card) throw new Error("Setup requires a visible number card");
    discardPile.push(card);
    visible = faceOf(card);
  } while (visible.kind !== "number");

  return {
    players, drawPile, discardPile, direction: 1,
    currentPlayerId: playerIds[(dealerIndex + 1) % playerIds.length]!,
    activeColor: visible.color as GameState["activeColor"],
    phase: "playing", pendingChoice: null, drawStack: null, unoWindow: null, winner: null, revision: 0, gameplaySequence: 0,
  };
}

function isPlayable(state: GameState, card: PhysicalCard): boolean {
  const face = faceOf(card);
  if (state.drawStack) return (face.drawValue ?? 0) >= state.drawStack.minimumDrawValue;
  const top = state.discardPile.at(-1);
  if (!top) return false;
  const visible = faceOf(top);
  return face.color === "wild" || face.color === state.activeColor ||
    (face.kind === "number" && visible.kind === "number" && face.value === visible.value) ||
    (face.kind !== "number" && face.kind === visible.kind);
}

export function getPlayableCardIds(state: GameState, playerId: string): string[] {
  if (state.phase !== "playing") return [];
  const player = state.players.find((player) => player.id === playerId && !player.eliminated);
  return player?.hand.filter((card) => isPlayable(state, card)).map((card) => card.instanceId) ?? [];
}

/** Helpers below mutate only a private transition copy. */
function advanceTurn(state: GameState, events: GameEvent[], steps = 1): void {
  const nextId = getNextEligiblePlayerId(state, { steps });
  if (nextId === null) return;
  state.currentPlayerId = nextId;
  events.push({ type: "turn-changed", playerId: nextId });
}

function activePlayerCount(state: GameState): number {
  return state.players.filter(({ eliminated }) => !eliminated).length;
}

function finishGame(state: GameState, winner: string): void {
  state.winner = winner;
  state.phase = "finished";
  state.pendingChoice = null;
  state.drawStack = null;
  state.unoWindow = null;
}

function reconcileUnoWindow(state: GameState): void {
  if (state.unoWindow && !state.players.some(({ id, eliminated, hand }) =>
    id === state.unoWindow!.playerId && !eliminated && hand.length === 1)) state.unoWindow = null;
}

function checkMercy(state: GameState, actingPlayerId: string): void {
  state.players = applyMercyRule(state, actingPlayerId).players;
  reconcileUnoWindow(state);
  const active = state.players.filter(({ eliminated }) => !eliminated);
  if (active.length === 1) finishGame(state, active[0]!.id);
}

function beginGameplay(state: GameState): void {
  state.gameplaySequence++;
  if (state.unoWindow && state.gameplaySequence >= state.unoWindow.expiresAtGameplaySequence) state.unoWindow = null;
}

function openUnoWindow(state: GameState, playerId: string, declared: boolean): void {
  if (state.players.find(({ id }) => id === playerId)!.hand.length === 1) {
    state.unoWindow = { playerId, declared, expiresAtGameplaySequence: state.gameplaySequence + 1 };
  }
}

function drawCard(state: GameState): PhysicalCard | null {
  if (state.drawPile.length === 0) {
    if (state.discardPile.length <= 1) return null;
    const visible = state.discardPile.at(-1)!;
    state.drawPile = shuffleDeck(state.discardPile.slice(0, -1));
    state.discardPile = [visible];
  }
  return state.drawPile.shift()!;
}

function playCard(state: GameState, playerId: string, card: PhysicalCard, events: GameEvent[], declared = false): void {
  const player = state.players.find((player) => player.id === playerId)!;
  player.hand = player.hand.filter(({ instanceId }) => instanceId !== card.instanceId);
  const face = faceOf(card);
  if (face.kind === "discard-all") {
    state.discardPile.push(...player.hand.filter((held) => faceOf(held).color === face.color));
    player.hand = player.hand.filter((held) => faceOf(held).color !== face.color);
  }
  state.discardPile.push(card);
  if (face.color !== "wild") state.activeColor = face.color;
  events.push({ type: "card-played", playerId, cardId: card.instanceId });
  if (player.hand.length === 0) { finishGame(state, playerId); return; }
  openUnoWindow(state, playerId, declared);
  if (face.kind === "number" && face.value === 7) {
    state.phase = "awaiting-choice";
    state.pendingChoice = { type: "choose-swap-target", playerId };
    return;
  }
  if (face.kind === "number" && face.value === 0) {
    state.players = passHands(state).players;
    checkMercy(state, playerId);
    if (state.winner) return;
  }
  if (face.kind === "reverse" || face.kind === "wild-reverse-draw-4") state.direction = state.direction === 1 ? -1 : 1;
  if (face.drawValue) {
    state.drawStack = { amount: (state.drawStack?.amount ?? 0) + face.drawValue, minimumDrawValue: face.drawValue };
  }
  if (face.kind === "wild-color-roulette") {
    advanceTurn(state, events);
    state.phase = "awaiting-choice";
    state.pendingChoice = { type: "choose-roulette-color", playerId: state.currentPlayerId };
    return;
  }
  if (face.color === "wild") {
    state.phase = "awaiting-choice";
    state.pendingChoice = { type: "choose-color", playerId };
    return;
  }
  if (face.kind === "skip-everyone") {
    advanceTurn(state, events, activePlayerCount(state));
  } else {
    advanceTurn(state, events, face.kind === "skip" || (face.kind === "reverse" && activePlayerCount(state) === 2) ? 2 : 1);
  }
}

export function applyGameCommand(state: GameState, command: GameCommand): GameTransition {
  if (state.phase === "finished") return { ok: false, code: "invalid-phase", state };
  if (command.type === "declare-uno" || command.type === "catch-uno") {
    const window = state.unoWindow;
    const actor = state.players.find(({ id, eliminated }) => id === command.playerId && !eliminated);
    if (!actor || !window || window.declared || state.gameplaySequence >= window.expiresAtGameplaySequence ||
      (command.type === "declare-uno" ? window.playerId !== command.playerId : window.playerId !== command.targetPlayerId || window.playerId === command.playerId)) {
      return { ok: false, code: "uno-unavailable", state };
    }
    const next = structuredClone(state);
    const events: GameEvent[] = [];
    if (command.type === "declare-uno") {
      next.unoWindow!.declared = true;
    } else {
      const drawnIds: string[] = [];
      for (let i = 0; i < 2; i++) {
        const drawn = drawCard(next);
        if (!drawn) return { ok: false, code: "deck-exhausted", state };
        next.players.find(({ id }) => id === window.playerId)!.hand.push(drawn);
        drawnIds.push(drawn.instanceId);
        checkMercy(next, command.playerId);
        if (next.players.find(({ id }) => id === window.playerId)!.eliminated) break;
      }
      next.unoWindow = null;
      events.push({ type: "cards-drawn", playerId: window.playerId, cardIds: drawnIds });
    }
    next.revision++;
    return { ok: true, state: next, events };
  }
  if (command.type === "choose-swap-target" || command.type === "choose-roulette-color") {
    if (state.phase !== "awaiting-choice" || state.pendingChoice?.type !== command.type) return { ok: false, code: "invalid-phase", state };
    if (state.pendingChoice.playerId !== command.playerId || !state.players.some(({ id, eliminated }) => id === command.playerId && !eliminated)) return { ok: false, code: "out-of-turn", state };
    if (command.type === "choose-swap-target" && (command.targetPlayerId === command.playerId || !state.players.some(({ id, eliminated }) => id === command.targetPlayerId && !eliminated))) return { ok: false, code: "invalid-target", state };
    const next = structuredClone(state);
    const events: GameEvent[] = [];
    next.phase = "playing";
    next.pendingChoice = null;
    if (command.type === "choose-swap-target") {
      next.players = swapHands(next, command.playerId, command.targetPlayerId).players;
      checkMercy(next, command.playerId);
    } else {
      // Choosing roulette is the affected next player's first gameplay action.
      beginGameplay(next);
      next.activeColor = command.color;
      const drawnIds: string[] = [];
      let drawn: PhysicalCard;
      do {
        const card = drawCard(next);
        if (!card) return { ok: false, code: "deck-exhausted", state };
        drawn = card;
        next.players.find(({ id }) => id === command.playerId)!.hand.push(drawn);
        drawnIds.push(drawn.instanceId);
        checkMercy(next, command.playerId);
        if (next.players.find(({ id }) => id === command.playerId)!.eliminated) break;
      } while (faceOf(drawn).color !== command.color);
      events.push({ type: "cards-drawn", playerId: command.playerId, cardIds: drawnIds });
    }
    if (!next.winner) advanceTurn(next, events);
    next.revision++;
    return { ok: true, state: next, events };
  }
  if (command.type === "choose-color") {
    if (state.phase !== "awaiting-choice" || state.pendingChoice?.type !== "choose-color") {
      return { ok: false, code: "invalid-phase", state };
    }
    if (state.pendingChoice.playerId !== command.playerId || !state.players.some(({ id, eliminated }) => id === command.playerId && !eliminated)) {
      return { ok: false, code: "out-of-turn", state };
    }
    const next = structuredClone(state);
    const events: GameEvent[] = [];
    next.activeColor = command.color;
    next.phase = "playing";
    next.pendingChoice = null;
    const reverseSelfPenalty = faceOf(next.discardPile.at(-1)!).kind === "wild-reverse-draw-4" && activePlayerCount(next) === 2;
    advanceTurn(next, events, reverseSelfPenalty ? 2 : 1);
    next.revision++;
    return { ok: true, state: next, events };
  }
  if (state.phase !== "playing" || state.pendingChoice !== null ||
      ((command.type === "draw-until-playable" || command.type === "draw-and-pass") && state.drawStack !== null) ||
      (command.type === "accept-draw" && state.drawStack === null)) {
    return { ok: false, code: "invalid-phase", state };
  }
  const player = state.players.find((player) => player.id === command.playerId && !player.eliminated);
  if (command.playerId !== state.currentPlayerId || !player) return { ok: false, code: "out-of-turn", state };
  if (command.type === "draw-until-playable" && player.hand.some((card) => isPlayable(state, card))) {
    return { ok: false, code: "playable-card-in-hand", state };
  }
  if (command.type === "draw-and-pass" && !player.hand.some((card) => isPlayable(state, card))) {
    return { ok: false, code: "invalid-phase", state };
  }
  let selected: PhysicalCard | undefined;
  if (command.type === "play-card") {
    selected = player.hand.find((card) => card.instanceId === command.cardId);
    if (!selected) return { ok: false, code: "card-not-in-hand", state };
    if (!isPlayable(state, selected)) return { ok: false, code: "illegal-play", state };
  }
  const next = structuredClone(state);
  const events: GameEvent[] = [];
  beginGameplay(next);
  if (command.type === "accept-draw") {
    const drawnIds: string[] = [];
    for (let i = 0; i < next.drawStack!.amount; i++) {
      const drawn = drawCard(next);
      if (!drawn) return { ok: false, code: "deck-exhausted", state };
      next.players.find(({ id }) => id === command.playerId)!.hand.push(drawn);
      drawnIds.push(drawn.instanceId);
      checkMercy(next, command.playerId);
      if (next.players.find(({ id }) => id === command.playerId)!.eliminated) break;
    }
    next.drawStack = null;
    events.push({ type: "cards-drawn", playerId: command.playerId, cardIds: drawnIds });
    if (!next.winner) advanceTurn(next, events);
    next.revision++;
    return { ok: true, state: next, events };
  }
  if (command.type === "draw-and-pass") {
    const drawn = drawCard(next);
    if (!drawn) return { ok: false, code: "deck-exhausted", state };
    next.players.find(({ id }) => id === command.playerId)!.hand.push(drawn);
    events.push({ type: "cards-drawn", playerId: command.playerId, cardIds: [drawn.instanceId] });
    checkMercy(next, command.playerId);
    if (!next.winner) advanceTurn(next, events);
    next.revision++;
    return { ok: true, state: next, events };
  }
  if (command.type === "draw-until-playable") {
    const drawnIds: string[] = [];
    do {
      const drawn = drawCard(next);
      if (!drawn) return { ok: false, code: "deck-exhausted", state };
      selected = drawn;
      next.players.find((player) => player.id === command.playerId)!.hand.push(selected);
      drawnIds.push(selected.instanceId);
      checkMercy(next, command.playerId);
      if (next.players.find(({ id }) => id === command.playerId)!.eliminated) break;
    } while (!isPlayable(next, selected));
    events.push({ type: "cards-drawn", playerId: command.playerId, cardIds: drawnIds });
  }
  if (next.players.find(({ id }) => id === command.playerId)!.eliminated) {
    if (!next.winner) advanceTurn(next, events);
  } else {
    playCard(next, command.playerId, selected!, events, command.type === "play-card" && command.declareUno === true);
  }
  next.revision++;
  return { ok: true, state: next, events };
}
