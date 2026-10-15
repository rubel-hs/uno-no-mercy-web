import { motion } from "motion/react";
import type { PlayerSnapshot } from "../game/protocol";

export interface LobbyScreenProps {
  snapshot: PlayerSnapshot;
  viewerId: string;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  reconnectAttempt?: number;
  connectionState?: string;
}

export function LobbyScreen({
  snapshot,
  viewerId,
  onStartGame,
  onLeaveRoom,
  reconnectAttempt = 0,
  connectionState = "connected",
}: LobbyScreenProps) {
  const isHost = viewerId === snapshot.hostPlayerId;
  const playerCount = snapshot.players.length;
  const canStart = isHost && playerCount >= 2;

  return (
    <main className="lobby-screen">
      <div className="home-screen__grid" aria-hidden="true" />

      {connectionState === "reconnecting" && (
        <div className="reconnect-banner" role="status">
          <i className="status-dot status-dot--amber" />
          <span>
            Reconnecting to server (attempt {reconnectAttempt} of 10)...
          </span>
        </div>
      )}

      <header className="lobby-nav">
        <div className="wordmark" aria-label="UNO No Mercy">
          <span>UNO</span>
          <b>NO MERCY</b>
        </div>

        <div className="lobby-nav__room" aria-label={`Room code: ${snapshot.roomCode || ""}`}>
          <span className="lobby-nav__label">Room Code</span>
          <strong className="lobby-nav__code">{snapshot.roomCode}</strong>
        </div>

        <button
          aria-label="Leave room"
          className="control-button"
          onClick={onLeaveRoom}
          type="button"
        >
          ← Leave room
        </button>
      </header>

      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="lobby-content"
        initial={{ opacity: 0, y: 16 }}
      >
        <div className="lobby-header">
          <span className="section-kicker">Multiplayer table</span>
          <h1>Game Lobby</h1>
          <p>
            Share the room code with friends. The game can start with 2 to 6
            players.
          </p>
          <div className="lobby-occupancy">
            <span className="occupancy-pill">
              <strong>{playerCount} / 6</strong> players joined
            </span>
          </div>
        </div>

        <div className="lobby-players">
          <ul aria-label="Players in room" className="lobby-players__list">
            {snapshot.players.map((player) => {
              const isPlayerHost = player.id === snapshot.hostPlayerId;
              const isViewer = player.id === viewerId;

              return (
                <li
                  className={`lobby-player-card ${
                    isViewer ? "lobby-player-card--you" : ""
                  }`}
                  key={player.id}
                >
                  <div className="lobby-player-card__avatar">
                    <span aria-hidden="true">
                      {player.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="lobby-player-card__info">
                    <div className="lobby-player-card__name-row">
                      <strong className="lobby-player-card__name">
                        {player.name}
                      </strong>
                      {isViewer && (
                        <span className="lobby-badge lobby-badge--you">You</span>
                      )}
                      {isPlayerHost && (
                        <span className="lobby-badge lobby-badge--host">
                          Host
                        </span>
                      )}
                    </div>
                    <span className="lobby-player-card__status">
                      <i
                        className={`status-dot ${
                          player.online
                            ? "status-dot--green"
                            : "status-dot--gray"
                        }`}
                      />
                      {player.online ? "Ready" : "Disconnected"}
                    </span>
                  </div>
                </li>
              );
            })}

            {/* Empty seat placeholders up to 6 */}
            {Array.from({ length: 6 - playerCount }).map((_, index) => (
              <li
                className="lobby-player-card lobby-player-card--empty"
                key={`empty-${index}`}
              >
                <div className="lobby-player-card__avatar">
                  <span aria-hidden="true">＋</span>
                </div>
                <div className="lobby-player-card__info">
                  <span className="lobby-player-card__empty-label">
                    Open Seat {playerCount + index + 1}
                  </span>
                  <span className="lobby-player-card__empty-hint">
                    Waiting for player...
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="lobby-actions">
          {isHost ? (
            <div className="lobby-host-controls">
              <button
                aria-label="Start game"
                className="control-button control-button--primary start-game-button"
                disabled={!canStart}
                onClick={onStartGame}
                type="button"
              >
                Start game
              </button>
              {!canStart && (
                <span className="lobby-action-hint">
                  Waiting for at least 2 players to start
                </span>
              )}
            </div>
          ) : (
            <div className="lobby-guest-waiting">
              <i className="status-dot status-dot--green" />
              <span>Waiting for host to start the game...</span>
            </div>
          )}
        </div>
      </motion.section>

      <footer className="home-meta">
        <span>168 card deck</span>
        <span>2–6 players</span>
        <span>25 card mercy rule</span>
      </footer>
    </main>
  );
}
