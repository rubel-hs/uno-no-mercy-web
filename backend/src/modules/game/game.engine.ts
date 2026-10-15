import { CARD_FACES, shuffleDeck } from "./deck";
import type { CardFace, CreateGameInput, GameCommand, GameEvent, GameState, GameTransition, PhysicalCard } from "./game.types";

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
  const players = playerIds.map((id) => ({ id, hand: [] as PhysicalCard[], eliminated: false }));
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
    phase: "playing", pendingChoice: null, drawStack: null, unoWindow: null, winner: null, revision: 0,
  };
}

function isPlayable(state: GameState, card: PhysicalCard): boolean {
  const face = faceOf(card);
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

/** Mutates only a private transition copy; action resolution is extended in Task 3. */
function playCard(state: GameState, playerId: string, card: PhysicalCard, events: GameEvent[]): void {
  const player = state.players.find((player) => player.id === playerId)!;
  player.hand = player.hand.filter(({ instanceId }) => instanceId !== card.instanceId);
  state.discardPile.push(card);
  const face = faceOf(card);
  if (face.color !== "wild") state.activeColor = face.color;
  events.push({ type: "card-played", playerId, cardId: card.instanceId });
  if (face.kind !== "number") {
    state.phase = "pending-effect";
    state.pendingChoice = { type: "resolve-action", playerId, cardId: card.instanceId };
    return;
  }
  const index = state.players.findIndex((player) => player.id === playerId);
  let nextIndex = index;
  do {
    nextIndex = (nextIndex + state.direction + state.players.length) % state.players.length;
  } while (state.players[nextIndex]!.eliminated && nextIndex !== index);
  state.currentPlayerId = state.players[nextIndex]!.id;
  events.push({ type: "turn-changed", playerId: state.currentPlayerId });
}

export function applyGameCommand(state: GameState, command: GameCommand): GameTransition {
  if (command.type !== "play-card" && command.type !== "draw-until-playable") {
    return { ok: false, code: "unsupported-command", state };
  }
  if (state.phase !== "playing" || state.drawStack !== null || state.pendingChoice !== null) {
    return { ok: false, code: "invalid-phase", state };
  }
  const player = state.players.find((player) => player.id === command.playerId && !player.eliminated);
  if (command.playerId !== state.currentPlayerId || !player) return { ok: false, code: "out-of-turn", state };
  if (command.type === "draw-until-playable" && player.hand.some((card) => isPlayable(state, card))) {
    return { ok: false, code: "playable-card-in-hand", state };
  }
  let selected: PhysicalCard | undefined;
  if (command.type === "play-card") {
    selected = player.hand.find((card) => card.instanceId === command.cardId);
    if (!selected) return { ok: false, code: "card-not-in-hand", state };
    if (!isPlayable(state, selected)) return { ok: false, code: "illegal-play", state };
  }
  const next = structuredClone(state);
  const events: GameEvent[] = [];
  if (command.type === "draw-until-playable") {
    const drawnIds: string[] = [];
    do {
      if (next.drawPile.length === 0) {
        if (next.discardPile.length <= 1) return { ok: false, code: "deck-exhausted", state };
        const visible = next.discardPile.at(-1)!;
        next.drawPile = shuffleDeck(next.discardPile.slice(0, -1));
        next.discardPile = [visible];
      }
      selected = next.drawPile.shift()!;
      next.players.find((player) => player.id === command.playerId)!.hand.push(selected);
      drawnIds.push(selected.instanceId);
    } while (!isPlayable(next, selected));
    events.push({ type: "cards-drawn", playerId: command.playerId, cardIds: drawnIds });
  }
  playCard(next, command.playerId, selected!, events);
  next.revision++;
  return { ok: true, state: next, events };
}
