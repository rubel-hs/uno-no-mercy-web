import { getPlayableCardIds } from "./game.engine";
import type { ClientCommand, PlayerSnapshot } from "./game.protocol";
import type { GameState } from "./game.types";
import type { MatchState } from "../rooms/room.types";

export function projectPlayerSnapshot(state: GameState, viewerId: string, match: MatchState): PlayerSnapshot {
  const viewer = state.players.find(({ id }) => id === viewerId);
  const activeViewer = viewer && !viewer.eliminated && state.phase !== "finished";
  const legalCardIds = activeViewer && state.phase === "playing" && state.pendingChoice === null && state.currentPlayerId === viewerId
    ? getPlayableCardIds(state, viewerId) : [];
  const pending = state.phase === "awaiting-choice" ? state.pendingChoice : null;
  const pendingChoice: PlayerSnapshot["pendingChoice"] = pending && pending.type !== "resolve-action"
    ? { type: pending.type, playerId: pending.playerId } : null;
  const window = state.unoWindow;
  const unoWindow: PlayerSnapshot["unoWindow"] = state.phase !== "finished" && window &&
    state.gameplaySequence < window.expiresAtGameplaySequence &&
    state.players.some(({ id, eliminated, hand }) => id === window.playerId && !eliminated && hand.length === 1)
    ? { playerId: window.playerId, declared: window.declared } : null;
  const allowedControls: ClientCommand["type"][] = [];
  if (activeViewer) {
    if (legalCardIds.length > 0) allowedControls.push("play-card");
    if (state.phase === "playing" && state.pendingChoice === null && state.currentPlayerId === viewerId) {
      if (state.drawStack) allowedControls.push("accept-draw");
      else if (legalCardIds.length > 0) allowedControls.push("draw-and-pass");
      else allowedControls.push("draw-until-playable");
    }
    if (pendingChoice?.playerId === viewerId && (pendingChoice.type !== "choose-swap-target" ||
      state.players.some(({ id, eliminated }) => id !== viewerId && !eliminated))) allowedControls.push(pendingChoice.type);
    if (unoWindow && !unoWindow.declared) allowedControls.push(unoWindow.playerId === viewerId ? "declare-uno" : "catch-uno");
  }
  if (viewer) allowedControls.push("leave-room");
  const top = state.discardPile.at(-1);
  // Every nested value is an allowlisted copy: never spread private domain or room objects.
  return {
    viewerId,
    revision: state.revision,
    phase: state.phase,
    players: state.players.map((player, order) => ({
      id: player.id, name: player.name ?? player.id, order, cardCount: player.hand.length,
      online: player.online ?? true, eliminated: player.eliminated,
    })),
    hand: viewer?.hand.map(({ instanceId, faceId }) => ({ instanceId, faceId })) ?? [],
    drawCount: state.drawPile.length,
    topDiscard: top ? { faceId: top.faceId } : null,
    currentPlayerId: state.currentPlayerId,
    direction: state.direction,
    activeColor: state.activeColor,
    pendingChoice,
    drawStack: state.drawStack ? { amount: state.drawStack.amount, minimumDrawValue: state.drawStack.minimumDrawValue } : null,
    unoWindow,
    winner: state.winner,
    legalCardIds,
    allowedControls,
    matchStatus: match.status,
    roundNumber: match.roundNumber,
    targetScore: match.targetScore,
    scores: Object.entries(match.scoresByPlayerId).map(([playerId, points]) => ({ playerId, points })),
    roundResult: match.lastRoundResult ? {
      roundNumber: match.lastRoundResult.roundNumber,
      winnerId: match.lastRoundResult.winnerId,
      matchWinnerId: match.lastRoundResult.matchWinnerId,
      breakdown: match.lastRoundResult.breakdown.map(({ playerId, cardPoints, eliminationBonus, roundPoints, cumulativePoints }) => ({
        playerId, cardPoints, eliminationBonus, roundPoints, cumulativePoints,
      })),
    } : null,
    matchWinner: match.winner,
  };
}
