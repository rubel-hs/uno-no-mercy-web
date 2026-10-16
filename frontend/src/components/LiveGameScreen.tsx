import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import directionIcon from "../assets/icons/game_direction.png";
import { cardBack, findCard, type CardDefinition } from "../game/cards";
import type { CardColor, ClientCommand, PlayerSnapshot } from "../game/protocol";
import { CardFlightOverlay, isReducedMotionActive, type FlightRequest } from "./CardFlightOverlay";
import { GameCard } from "./GameCard";
import { GameChoiceDialog } from "./GameChoiceDialog";
import { MatchResultScreen } from "./MatchResultScreen";
import { PlayerSeat } from "./PlayerSeat";

export interface LiveGameScreenProps {
  snapshot: PlayerSnapshot;
  connectionState?: string;
  reconnectAttempt?: number;
  flightDuration?: number;
  onCommand: (command: ClientCommand) => void;
  onLeaveRoom: () => void;
}

const DEFAULT_FLIGHT_DURATION = 0.28;

function getElementCoordinates(
  element: Element | null,
  fallback: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  if (!element) return fallback;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return fallback;
  }
  return {
    x: rect.x ?? rect.left ?? fallback.x,
    y: rect.y ?? rect.top ?? fallback.y,
    width: rect.width || fallback.width,
    height: rect.height || fallback.height,
  };
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
  flightDuration = DEFAULT_FLIGHT_DURATION,
  onCommand,
  onLeaveRoom,
}: LiveGameScreenProps) {
  const isReconnecting = connectionState === "reconnecting";
  const motionReduced = useReducedMotion();
  const shouldReduceMotion = isReducedMotionActive(motionReduced);

  const discardPileRef = useRef<HTMLDivElement | null>(null);
  const drawPileRef = useRef<HTMLButtonElement | null>(null);
  const [activeFlights, setActiveFlights] = useState<FlightRequest[]>([]);
  const activeFlightsRef = useRef<FlightRequest[]>([]);
  const [hiddenCardInstanceId, setHiddenCardInstanceId] = useState<string | null>(null);
  const [hiddenCardIds, setHiddenCardIds] = useState<string[]>([]);
  const stagedHandCardRef = useRef<{ instanceId: string; faceId: string; index: number } | null>(null);
  const playedCardRef = useRef<CardDefinition | null>(null);
  const snapshotRef = useRef<PlayerSnapshot>(snapshot);
  const prevSnapshotRef = useRef<PlayerSnapshot | null>(null);

  const [visualTopDiscard, setVisualTopDiscard] = useState<CardDefinition | null>(() =>
    snapshot.topDiscard ? findCard(snapshot.topDiscard.faceId) : null,
  );

  const flushFlights = useCallback(() => {
    setActiveFlights([]);
    activeFlightsRef.current = [];
    setHiddenCardIds([]);
    setHiddenCardInstanceId(null);
    stagedHandCardRef.current = null;
    playedCardRef.current = null;
    if (snapshotRef.current.topDiscard) {
      setVisualTopDiscard(findCard(snapshotRef.current.topDiscard.faceId));
    }
  }, []);

  const handleFlightEnd = useCallback((flightId: string) => {
    setActiveFlights((prev) => {
      const next = prev.filter((f) => f.id !== flightId);
      activeFlightsRef.current = next;
      const remainingDiscardFlight = next.some(
        (f) => f.id.startsWith("flight-play-") || f.id.startsWith("flight-opponent-"),
      );
      if (!remainingDiscardFlight) {
        if (flightId.startsWith("flight-play-") && playedCardRef.current) {
          setVisualTopDiscard(playedCardRef.current);
        } else if (snapshotRef.current.topDiscard) {
          setVisualTopDiscard(findCard(snapshotRef.current.topDiscard.faceId));
        } else if (playedCardRef.current) {
          setVisualTopDiscard(playedCardRef.current);
        }
      }
      return next;
    });

    if (flightId.startsWith("flight-play-")) {
      setHiddenCardInstanceId(null);
      stagedHandCardRef.current = null;
      playedCardRef.current = null;
    }

    if (flightId.startsWith("flight-draw-viewer-")) {
      const instanceId = flightId.slice("flight-draw-viewer-".length);
      setHiddenCardIds((prev) => prev.filter((id) => id !== instanceId));
    }
  }, []);

  useEffect(() => {
    snapshotRef.current = snapshot;
    const prevSnapshot = prevSnapshotRef.current;
    prevSnapshotRef.current = snapshot;

    if (!prevSnapshot) {
      if (snapshot.topDiscard) {
        setVisualTopDiscard(findCard(snapshot.topDiscard.faceId));
      }
      return;
    }

    const prevDiscardId = prevSnapshot.topDiscard?.faceId;
    const currentDiscardId = snapshot.topDiscard?.faceId;
    const discardChanged = currentDiscardId && currentDiscardId !== prevDiscardId;

    const isGameplay =
      prevSnapshot.phase === "playing" &&
      snapshot.phase === "playing" &&
      prevSnapshot.matchStatus === "round-active" &&
      snapshot.matchStatus === "round-active" &&
      prevSnapshot.roundNumber === snapshot.roundNumber;

    const newFlights: FlightRequest[] = [];

    if (isGameplay) {
      if (discardChanged) {
        const prevActiveId = prevSnapshot.currentPlayerId;
        if (prevActiveId && prevActiveId !== snapshot.viewerId) {
          const prevOpponent = prevSnapshot.players.find((p) => p.id === prevActiveId);
          const currentOpponent = snapshot.players.find((p) => p.id === prevActiveId);
          const cardCountDecreased =
            prevOpponent && currentOpponent && currentOpponent.cardCount < prevOpponent.cardCount;

          if (cardCountDecreased) {
            const cardToFly = findCard(currentDiscardId);
            const opponentSeatEl =
              document.querySelector(`[data-player-id="${prevActiveId}"]`) ||
              document.querySelector(`.player-seat[aria-label*="${prevOpponent.name}"]`);

            const fromRect = getElementCoordinates(opponentSeatEl, {
              x: 300,
              y: 100,
              width: 80,
              height: 120,
            });
            const toRect = getElementCoordinates(discardPileRef.current, {
              x: 400,
              y: 300,
              width: 80,
              height: 120,
            });

            const flightId = `flight-opponent-${prevActiveId}-${Date.now()}`;
            newFlights.push({
              id: flightId,
              card: cardToFly,
              fromRect,
              toRect,
              duration: flightDuration,
            });
          }
        }
      }

      // Local player draw flights
      const prevHandIds = new Set(prevSnapshot.hand.map((h) => h.instanceId));
      const newlyDrawnCards = snapshot.hand.filter((h) => !prevHandIds.has(h.instanceId));

      if (newlyDrawnCards.length > 0) {
        const newCardIds = newlyDrawnCards.map((c) => c.instanceId);
        setHiddenCardIds((prev) => [...prev, ...newCardIds]);

        const drawFromRect = getElementCoordinates(drawPileRef.current, {
          x: 250,
          y: 300,
          width: 80,
          height: 120,
        });

        const bottomHandEl = document.querySelector(".player-seat--bottom .player-seat__hand");
        const handRect = getElementCoordinates(bottomHandEl, {
          x: 300,
          y: 600,
          width: 400,
          height: 120,
        });

        newlyDrawnCards.forEach((cardItem, index) => {
          const cardDef = findCard(cardItem.faceId);
          const cardEl = document.querySelector(`[data-card-instance-id="${cardItem.instanceId}"]`);
          const toRect = getElementCoordinates(cardEl, {
            x: handRect.x + index * 40,
            y: handRect.y,
            width: 80,
            height: 120,
          });

          newFlights.push({
            id: `flight-draw-viewer-${cardItem.instanceId}`,
            card: cardDef,
            fromRect: drawFromRect,
            toRect,
            duration: flightDuration,
            delay: index * 0.06,
            onComplete: () => {
              setHiddenCardIds((prev) => prev.filter((id) => id !== cardItem.instanceId));
            },
          });
        });
      }

      // Opponent draw flights
      if (snapshot.drawCount < prevSnapshot.drawCount) {
        for (const player of snapshot.players) {
          if (player.id === snapshot.viewerId) continue;
          const prevPlayer = prevSnapshot.players.find((p) => p.id === player.id);
          if (prevPlayer && player.cardCount > prevPlayer.cardCount) {
            const countDrawn = player.cardCount - prevPlayer.cardCount;
            const opponentSeatEl =
              document.querySelector(`[data-player-id="${player.id}"]`) ||
              document.querySelector(`.player-seat[aria-label*="${player.name}"]`);
            const toRect = getElementCoordinates(opponentSeatEl, {
              x: 300,
              y: 100,
              width: 80,
              height: 120,
            });
            const drawFromRect = getElementCoordinates(drawPileRef.current, {
              x: 250,
              y: 300,
              width: 80,
              height: 120,
            });

            for (let i = 0; i < countDrawn; i++) {
              newFlights.push({
                id: `flight-draw-opponent-${player.id}-${i}-${Date.now()}`,
                card: cardBack,
                fromRect: drawFromRect,
                toRect,
                duration: flightDuration,
                delay: i * 0.06,
              });
            }
          }
        }
      }
    }

    if (newFlights.length > 0) {
      setActiveFlights((prev) => {
        const next = [...prev, ...newFlights];
        activeFlightsRef.current = next;
        return next;
      });
    }

    const hasDiscardFlight =
      activeFlightsRef.current.some(
        (f) => f.id.startsWith("flight-play-") || f.id.startsWith("flight-opponent-"),
      ) ||
      newFlights.some(
        (f) => f.id.startsWith("flight-play-") || f.id.startsWith("flight-opponent-"),
      );
    if (!hasDiscardFlight) {
      setVisualTopDiscard(snapshot.topDiscard ? findCard(snapshot.topDiscard.faceId) : null);
    }
  }, [snapshot, flightDuration]);

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

  const handlePlayCard = (cardId: string) => {
    if (isReconnecting || !snapshot.legalCardIds.includes(cardId)) {
      return;
    }

    flushFlights();

    const playedCardItem = snapshot.hand.find((h) => h.instanceId === cardId);
    const cardIndex = snapshot.hand.findIndex((h) => h.instanceId === cardId);

    if (playedCardItem) {
      const cardDef = findCard(playedCardItem.faceId);
      stagedHandCardRef.current = {
        instanceId: cardId,
        faceId: playedCardItem.faceId,
        index: cardIndex >= 0 ? cardIndex : 0,
      };
      playedCardRef.current = cardDef;
      setHiddenCardInstanceId(cardId);

      const cardElement = document.querySelector(`[data-card-instance-id="${cardId}"]`);
      const fromRect = getElementCoordinates(cardElement, {
        x: 300,
        y: 600,
        width: 80,
        height: 120,
      });
      const toRect = getElementCoordinates(discardPileRef.current, {
        x: 400,
        y: 300,
        width: 80,
        height: 120,
      });

      const flightId = `flight-play-${cardId}-${Date.now()}`;
      const newFlight: FlightRequest = {
        id: flightId,
        card: cardDef,
        fromRect,
        toRect,
        duration: flightDuration,
      };

      setActiveFlights((prev) => {
        const next = [...prev, newFlight];
        activeFlightsRef.current = next;
        return next;
      });
    }

    onCommand({ type: "play-card", cardId });
  };

  const renderedHand = [...snapshot.hand];
  if (
    hiddenCardInstanceId &&
    stagedHandCardRef.current &&
    !renderedHand.some((h) => h.instanceId === stagedHandCardRef.current!.instanceId)
  ) {
    const insertIdx = Math.min(stagedHandCardRef.current.index, renderedHand.length);
    renderedHand.splice(insertIdx, 0, {
      instanceId: stagedHandCardRef.current.instanceId,
      faceId: stagedHandCardRef.current.faceId,
    });
  }

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
      transition={{ duration: shouldReduceMotion ? 0 : 0.38 }}
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
          playerId={player.id}
          points={snapshot.scores.find((score) => score.playerId === player.id)?.points ?? 0}
          position={position}
        />
      ))}

      {/* Viewer Seat (Always placed at bottom) */}
      {viewer && (
        <PlayerSeat
          active={snapshot.currentPlayerId === viewer.id}
          cardIds={renderedHand.map((h) => h.instanceId)}
          cards={renderedHand.map((h) => findCard(h.faceId))}
          count={viewer.cardCount}
          disabled={isReconnecting}
          eliminated={viewer.eliminated}
          hiddenCardInstanceId={hiddenCardInstanceId}
          hiddenCardIds={hiddenCardIds}
          legalCardIds={snapshot.legalCardIds}
          name={viewer.name}
          online={viewer.online}
          onPlayCard={handlePlayCard}
          orientation="horizontal"
          playerId={viewer.id}
          points={snapshot.scores.find((score) => score.playerId === viewer.id)?.points ?? 0}
          position="bottom"
        />
      )}

      {/* Center Play Area */}
      <div className="table-center">
        <div className="play-zone">
          <button
            ref={drawPileRef}
            aria-label={drawAndPass ? "Draw one card and pass" : "Draw cards from draw pile"}
            className="pile pile--draw"
            disabled={!canDraw || isReconnecting}
            onClick={() => {
              if (canDraw && !isReconnecting) {
                flushFlights();
                onCommand({ type: drawAndPass ? "draw-and-pass" : "draw-until-playable" });
              }
            }}
            type="button"
          >
            <span className="pile__count">{snapshot.drawCount}</span>
            <GameCard card={cardBack} size="large" />
          </button>

          <div className="pile pile--discard" ref={discardPileRef}>
            <span className="pile__echo" aria-hidden="true" />
            {visualTopDiscard && <GameCard card={visualTopDiscard} size="large" />}
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
                  flushFlights();
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
            flushFlights();
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
          onChooseColor={(color: CardColor) => {
            if (!isReconnecting) {
              flushFlights();
              onCommand({ type: "choose-color", color });
            }
          }}
          onChooseRouletteColor={(color: CardColor) => {
            if (!isReconnecting) {
              flushFlights();
              onCommand({ type: "choose-roulette-color", color });
            }
          }}
          onChooseSwapTarget={(targetPlayerId: string) => {
            if (!isReconnecting) {
              flushFlights();
              onCommand({ type: "choose-swap-target", targetPlayerId });
            }
          }}
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

      {/* Flight Animation Overlay */}
      <CardFlightOverlay flights={activeFlights} onFlightEnd={handleFlightEnd} />
    </motion.section>
  );
}
