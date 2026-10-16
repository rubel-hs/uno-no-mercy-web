import type { ClientCommand, PlayerSnapshot } from "../game/protocol";

interface MatchResultScreenProps {
  snapshot: PlayerSnapshot;
  connectionState: string;
  reconnectAttempt: number;
  onCommand: (command: ClientCommand) => void;
  onLeaveRoom: () => void;
}

export function MatchResultScreen({
  snapshot,
  connectionState,
  reconnectAttempt,
  onCommand,
  onLeaveRoom,
}: MatchResultScreenProps) {
  const isMatchComplete = snapshot.matchStatus === "match-complete";
  const isReadOnly = connectionState !== "connected";
  const canStartNextRound = snapshot.matchStatus === "round-complete" &&
    snapshot.allowedControls.includes("start-next-round");
  const result = snapshot.roundResult;
  const roundNumber = result?.roundNumber ?? snapshot.roundNumber;
  const playerName = (id: string | null | undefined) =>
    snapshot.players.find((player) => player.id === id)?.name ?? id ?? "Player";
  const winner = isMatchComplete
    ? snapshot.matchWinner ?? result?.matchWinnerId
    : result?.winnerId ?? snapshot.winner;
  const standings = [...snapshot.scores].sort((a, b) => b.points - a.points);

  return (
    <div
      aria-labelledby="match-result-title"
      aria-modal="true"
      className="game-winner-overlay"
      role="dialog"
    >
      <div className="game-winner-card match-result-card">
        <span className="section-kicker">First to {snapshot.targetScore} points</span>
        <h2 id="match-result-title">
          {isMatchComplete ? "Match complete" : `Round ${roundNumber} complete`}
        </h2>
        <h3 className="game-winner-name">
          {isMatchComplete ? "Match winner" : "Round winner"}: {playerName(winner)}
        </h3>

        {result && (
          <div className="match-result-table-scroll" tabIndex={0} role="region" aria-label="Round score details">
            <table className="match-result-table">
              <caption>Round {result.roundNumber} score breakdown</caption>
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">Card points</th>
                  <th scope="col">Elimination bonus</th>
                  <th scope="col">Round points</th>
                  <th scope="col">Cumulative points</th>
                </tr>
              </thead>
              <tbody>
                {result.breakdown.map((score) => (
                  <tr key={score.playerId}>
                    <th scope="row">{playerName(score.playerId)}</th>
                    <td>{score.cardPoints}</td>
                    <td>{score.eliminationBonus}</td>
                    <td>{score.roundPoints}</td>
                    <td>{score.cumulativePoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <table className="match-result-table">
          <caption>Cumulative standings</caption>
          <thead>
            <tr><th scope="col">Player</th><th scope="col">Points</th></tr>
          </thead>
          <tbody>
            {standings.map((score) => (
              <tr key={score.playerId}>
                <th scope="row">{playerName(score.playerId)}</th>
                <td>{score.points}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {isReadOnly ? (
          <p role="status">
            {connectionState === "reconnecting"
              ? `Reconnecting to game server (attempt ${reconnectAttempt})...`
              : "Waiting for connection to game server..."}
          </p>
        ) : !isMatchComplete && !canStartNextRound ? (
          <p role="status">Waiting for host to start the next round...</p>
        ) : null}

        <div className="match-result-actions">
          {canStartNextRound && (
            <button
              className="control-button control-button--primary"
              disabled={isReadOnly}
              onClick={() => {
                if (!isReadOnly && canStartNextRound) {
                  onCommand({ type: "start-next-round" });
                }
              }}
              type="button"
            >
              Next Round
            </button>
          )}
          <button
            className="control-button"
            disabled={isReadOnly}
            onClick={onLeaveRoom}
            type="button"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
