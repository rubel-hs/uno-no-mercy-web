import type { GameState } from "./game.types";
import { getNextEligiblePlayerId } from "./turn-order";

/** Attribute newly eliminated hands only when resolving a gameplay action. */
export function applyMercyRule(state: GameState, actingPlayerId: string | null = null): GameState {
  return { ...state, players: state.players.map((player) =>
    player.eliminated ? { ...player, hand: [] } : player.hand.length >= 25
      ? { ...player, eliminated: true, hand: [], eliminatedByPlayerId: actingPlayerId }
      : player,
  ) };
}

export function passHands(state: GameState): GameState {
  const next = structuredClone(state);
  for (const player of state.players.filter(({ eliminated }) => !eliminated)) {
    const recipient = getNextEligiblePlayerId(state, { fromPlayerId: player.id });
    if (recipient) next.players.find(({ id }) => id === recipient)!.hand = structuredClone(player.hand);
  }
  return next;
}

/** The engine validates distinct active targets before applying the swap. */
export function swapHands(state: GameState, firstId: string, secondId: string): GameState {
  const next = structuredClone(state);
  const first = next.players.find(({ id, eliminated }) => id === firstId && !eliminated);
  const second = next.players.find(({ id, eliminated }) => id === secondId && !eliminated);
  if (first && second) [first.hand, second.hand] = [second.hand, first.hand];
  return next;
}
