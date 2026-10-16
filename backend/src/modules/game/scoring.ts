import { CARD_FACES } from "./deck";
import type { RoundResult } from "./game.protocol";
import type { CardFace, GameState } from "./game.types";

const facesById = new Map(CARD_FACES.map((face) => [face.faceId, face]));

export function cardPointValue(face: CardFace): number {
  if (face.kind === "number") return face.value!;
  return face.color === "wild" ? 50 : 20;
}

export function calculateRoundResult(
  round: GameState,
  priorScores: Readonly<Record<string, number>>,
  roundNumber: number,
): RoundResult {
  if (round.phase !== "finished" || round.winner === null) {
    throw new Error("Scoring requires a finished round with a winner");
  }

  const remainingHandPoints = round.players
    .filter((player) => player.id !== round.winner && !player.eliminated)
    .reduce((total, player) => total + player.hand.reduce(
      (points, card) => points + cardPointValue(facesById.get(card.faceId)!),
      0,
    ), 0);

  // Keep departed players' historical scores available to subsequent rounds.
  const playerIds = new Set([...round.players.map((player) => player.id), ...Object.keys(priorScores)]);
  const breakdown = [...playerIds].map((playerId) => {
    const cardPoints = playerId === round.winner ? remainingHandPoints : 0;
    const eliminationBonus = 250 * round.players.filter((opponent) =>
      opponent.id !== playerId && opponent.eliminated && opponent.eliminatedByPlayerId === playerId,
    ).length;
    const roundPoints = cardPoints + eliminationBonus;
    return {
      playerId,
      cardPoints,
      eliminationBonus,
      roundPoints,
      cumulativePoints: (priorScores[playerId] ?? 0) + roundPoints,
    };
  });

  const contenders = breakdown
    .filter(({ cumulativePoints }) => cumulativePoints >= 1000)
    .sort((left, right) => right.cumulativePoints - left.cumulativePoints);
  const [leader, runnerUp] = contenders;
  const matchWinnerId = !leader ? null
    : leader.cumulativePoints === runnerUp?.cumulativePoints ? round.winner
    : leader.playerId;

  return {
    roundNumber,
    winnerId: round.winner,
    breakdown,
    matchWinnerId,
  };
}
