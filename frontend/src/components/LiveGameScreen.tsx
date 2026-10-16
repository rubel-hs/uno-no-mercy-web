import { motion } from "motion/react";

import directionIcon from "../assets/icons/game_direction.png";
import { cardBack, findCard } from "../game/cards";
import type { CardColor, ClientCommand, PlayerSnapshot } from "../game/protocol";
import { GameCard } from "./GameCard";
import { GameChoiceDialog } from "./GameChoiceDialog";
import { MatchResultScreen } from "./MatchResultScreen";
import { PlayerSeat } from "./PlayerSeat";

export interface LiveGameScreenProps {
  snapshot: PlayerSnapshot;
  connectionState?: string;
  reconnectAttempt?: number;
  onCommand: (command: ClientCommand) => void;
  onLeaveRoom: () => void;
}

const SEAT_LAYOUTS: Record<number, ("top" | "left" | "right" | "top-left" | "top-right")[]> = {
  1: ["top"],
  2: ["left", "right"],
  3: ["left", "top", "right"],
  4: ["left", "top-left", "top-right", "right"],
  5: ["left", "top-left", "top", "top-right", "right"],
};

export function LiveGameScreen({
  snapshot,
  connectionState = "connected",
  reconnectAttempt = 1,
  onCommand,
  onLeaveRoom,
}: LiveGameScreenProps) {
  const isReconnecting = connectionState === "reconnecting";

  if (snapshot.matchStatus === "round-complete" || snapshot.matchStatus === "match-complete") {
    return (
      <MatchResultScreen
        connectionState={connectionState}
        onCommand={onCommand}
        onLeaveRoom={onLeaveRoom}
        reconnectAttempt={reconnectAttempt}
        snapshot={snapshot}
      />
    );
  }

  // Sort players by order
  const sortedPlayers = [...snapshot.players].sort((a, b) => a.order - b.order);
  const viewerIndex = sortedPlayers.findIndex((p) => p.id === snapshot.viewerId);
  const viewer = viewerIndex >= 0 ? sortedPlayers[viewerIndex] : sortedPlayers[0];

  // Distribute opponents around the table clockwise relative to the viewer
  const opponentCount = Math.max(1, sortedPlayers.length - 1);
  const layout = SEAT_LAYOUTS[opponentCount] ?? ["top"];
  const opponents: {
    player: (typeof sortedPlayers)[number];
    position: "top" | "left" | "right" | "top-left" | "top-right";
    orientation: "horizontal" | "vertical";
  }[] = [];

  for (let i = 1; i < sortedPlayers.length; i++) {
    const player = sortedPlayers[(viewerIndex + i) % sortedPlayers.length];
    const position = layout[i - 1] ?? "top";
    const orientation = position === "top" ? "horizontal" : "vertical";
    opponents.push({ player, position, orientation });
  }

  const topCard = snapshot.topDiscard ? findCard(snapshot.topDiscard.faceId) : null;
  const dirName = snapshot.direction === 1 ? "clockwise" : "counterclockwise";
  const canDraw = snapshot.allowedControls.includes("draw-until-playable") ||
    snapshot.allowedControls.includes("draw-and-pass");
  const drawAndPass = snapshot.allowedControls.includes("draw-and-pass");
  const canUno = snapshot.allowedControls.includes("declare-uno");
  const canAcceptDraw = snapshot.allowedControls.includes("accept-draw");

  return (
    <motion.section
      animate={{ opacity: 1, scale: 1 }}
      aria-label="UNO No Mercy game table"
      className="game-table"
      initial={{ opacity: 0, scale: 0.985 }}
      role="region"
      transition={{ duration: 0.38 }}
    >
      <div className="table-grid" aria-hidden="true" />
      <div className="table-scar table-scar--one" aria-hidden="true" />
      <div className="table-scar table-scar--two" aria-hidden="true" />

      {/* Opponent Seats */}
      {opponents.map(({ player, position, orientation }) => (
        <PlayerSeat
          active={snapshot.currentPlayerId === player.id}
          count={player.cardCount}
          eliminated={player.eliminated}
          key={player.id}
          name={player.name}
          online={player.online}
          orientation={orientation}
          points={snapshot.scores.find((score) => score.playerId === player.id)?.points ?? 0}
          position={position}
        />
      ))}

      {/* Viewer Seat (Always placed at bottom) */}
      {viewer && (
        <PlayerSeat
          active={snapshot.currentPlayerId === viewer.id}
          cardIds={snapshot.hand.map((h) => h.instanceId)}
          cards={snapshot.hand.map((h) => findCard(h.faceId))}
          count={viewer.cardCount}
          disabled={isReconnecting}
          eliminated={viewer.eliminated}
          legalCardIds={snapshot.legalCardIds}
          name={viewer.name}
          online={viewer.online}
          onPlayCard={(cardId) => {
            if (!isReconnecting && snapshot.legalCardIds.includes(cardId)) {
              onCommand({ type: "play-card", cardId });
            }
          }}
          orientation="horizontal"
          points={snapshot.scores.find((score) => score.playerId === viewer.id)?.points ?? 0}
          position="bottom"
        />
      )}

      {/* Center Play Area */}
      <div className="table-center">
        <div className="play-zone">
          <button
            aria-label={drawAndPass ? "Draw one card and pass" : "Draw cards from draw pile"}
            className="pile pile--draw"
            disabled={!canDraw || isReconnecting}
            onClick={() => {
              if (canDraw && !isReconnecting) {
                onCommand({ type: drawAndPass ? "draw-and-pass" : "draw-until-playable" });
              }
            }}
            type="button"
          >
            <span className="pile__count">{snapshot.drawCount}</span>
            <GameCard card={cardBack} size="large" />
          </button>

          <div className="pile pile--discard">
            <span className="pile__echo" aria-hidden="true" />
            {topCard && <GameCard card={topCard} size="large" />}
          </div>
        </div>

        <div className="game-status-rail" aria-label="Table status and actions" role="group">
          {snapshot.drawStack && (
            <div
              aria-label={`Stack penalty: draw ${snapshot.drawStack.amount}`}
              className="game-status-stack"
            >
              <span>Stack</span>
              <strong>+{snapshot.drawStack.amount}</strong>
            </div>
          )}

          <div
            aria-label={`Current color: ${snapshot.activeColor}`}
            className="game-status-color"
            role="img"
            style={{ backgroundColor: `var(--uno-${snapshot.activeColor})` }}
          />

          <div className="game-status-direction">
            <img
              alt={`Play direction: ${dirName}`}
              className={`game-direction-icon game-direction-icon--${dirName}`}
              draggable={false}
              role="img"
              src={directionIcon}
            />
          </div>

          {canAcceptDraw && (
            <button
              aria-label={`Accept draw +${snapshot.drawStack?.amount ?? ""}`}
              className="pass-button pass-button--accept"
              disabled={isReconnecting}
              onClick={() => {
                if (!isReconnecting) {
                  onCommand({ type: "accept-draw" });
                }
              }}
              type="button"
            >
              Take +{snapshot.drawStack?.amount ?? ""}
            </button>
          )}
        </div>
      </div>

      {/* Call UNO button */}
      <button
        aria-label="Declare UNO"
        className={`uno-button ${canUno ? "is-pulse" : ""}`}
        disabled={!canUno || isReconnecting}
        onClick={() => {
          if (!isReconnecting && canUno) {
            onCommand({ type: "declare-uno" });
          }
        }}
        type="button"
      >
        <span>UNO!</span>
        <small>Call it</small>
      </button>

      {/* Choice Modal Dialog */}
      {snapshot.pendingChoice && (
        <GameChoiceDialog
          choice={snapshot.pendingChoice}
          onChooseColor={(color: CardColor) => onCommand({ type: "choose-color", color })}
          onChooseRouletteColor={(color: CardColor) =>
            onCommand({ type: "choose-roulette-color", color })
          }
          onChooseSwapTarget={(targetPlayerId: string) =>
            onCommand({ type: "choose-swap-target", targetPlayerId })
          }
          players={snapshot.players}
          viewerId={snapshot.viewerId}
        />
      )}

      {/* Reconnect Banner */}
      {isReconnecting && (
        <div className="reconnect-banner" role="status">
          <span>Reconnecting to game server (attempt {reconnectAttempt})...</span>
        </div>
      )}
    </motion.section>
  );
}
