import { cardBack, type CardDefinition } from "../game/cards";
import { GameCard } from "./GameCard";

export type PlayerSeatProps = {
  playerId?: string;
  cards?: CardDefinition[];
  cardIds?: string[];
  count: number;
  name: string;
  orientation: "horizontal" | "vertical";
  points: number;
  position: "top" | "right" | "bottom" | "left" | "top-left" | "top-right";
  active?: boolean;
  eliminated?: boolean;
  online?: boolean;
  legalCardIds?: string[];
  hiddenCardInstanceId?: string | null;
  hiddenCardIds?: string[];
  onPlayCard?: (cardId: string) => void;
  disabled?: boolean;
};

export function calculateHandOverlap(cardCount: number, cardWidth = 100, containerWidth = 900): number {
  if (cardCount <= 7) {
    return Math.round(cardWidth * 0.42);
  }
  const naturalWidth = cardCount * cardWidth;
  if (naturalWidth <= containerWidth) {
    return Math.round(cardWidth * 0.42);
  }
  const neededOverlap = (naturalWidth - containerWidth) / (cardCount - 1);
  const minVisibleBadge = 34;
  const maxOverlap = cardWidth - minVisibleBadge;
  const minOverlap = Math.round(cardWidth * 0.42);
  return Math.round(Math.min(maxOverlap, Math.max(minOverlap, neededOverlap)));
}

export function PlayerSeat({
  playerId,
  cards,
  cardIds,
  count,
  name,
  orientation,
  points,
  position,
  active = false,
  eliminated = false,
  online = true,
  legalCardIds,
  hiddenCardInstanceId,
  hiddenCardIds,
  onPlayCard,
  disabled = false,
}: PlayerSeatProps) {
  const isActualActive = active && !eliminated;
  const visibleCards = cards ?? Array.from({ length: Math.min(count, 7) }, () => cardBack);
  const dynamicOverlap = position === "bottom" ? calculateHandOverlap(visibleCards.length) : undefined;

  return (
    <section
      className={`player-seat player-seat--${position} player-seat--${orientation} ${
        isActualActive ? "is-active" : ""
      } ${eliminated ? "is-eliminated" : ""} ${!online ? "is-offline" : ""}`}
      data-player-id={playerId}
      aria-label={`${name}, ${points} points${isActualActive ? ", current player" : ""}${
        eliminated ? ", eliminated" : ""
      }${!online ? ", offline" : ""}`}
    >
      <div className="player-seat__meta">
        <span className="player-seat__identity">
          <b>{name}</b>
          {isActualActive && <small>Current player</small>}
          {eliminated && <span className="player-seat__status-tag">Eliminated</span>}
          {!online && !eliminated && <span className="player-seat__status-tag">Offline</span>}
        </span>
        <span className="player-seat__score" title="Cumulative points">
          {points}<i aria-hidden="true">★</i>
        </span>
      </div>
      <div
        className="player-seat__hand"
        aria-hidden={position !== "bottom" ? "true" : undefined}
        style={
          dynamicOverlap !== undefined
            ? ({ "--dynamic-overlap": `-${dynamicOverlap}px` } as React.CSSProperties)
            : undefined
        }
      >
        {visibleCards.map((card, index) => {
          const instanceId = cardIds?.[index] ?? (position === "bottom" ? card.id : `${card.id}-${index}`);
          const isLegal = legalCardIds ? legalCardIds.includes(instanceId) : true;
          const isPlayable = position === "bottom" && isLegal && !disabled;
          const isHidden = hiddenCardInstanceId === instanceId || Boolean(hiddenCardIds?.includes(instanceId));

          return (
            <GameCard
              alignFlat={orientation === "horizontal"}
              card={card}
              className={`player-seat__card ${
                position === "bottom" && !isLegal ? "is-disabled" : ""
              } ${isHidden ? "is-staged-hidden" : ""}`}
              data-card-instance-id={instanceId}
              disabled={position === "bottom" && (!isPlayable || isHidden)}
              key={cardIds?.[index] ? `${name}-${cardIds[index]}` : `${name}-${card.id}-${index}`}
              onClick={() => {
                if (isPlayable && !isHidden && onPlayCard) {
                  onPlayCard(instanceId);
                }
              }}
              pointerOnly={position === "bottom"}
              rotation={
                position === "left" || position === "top-left"
                  ? 90
                  : position === "right" || position === "top-right"
                  ? -90
                  : undefined
              }
              size={position === "bottom" ? "large" : "small"}
              style={isHidden ? { visibility: "hidden", pointerEvents: "none" } : undefined}
            />
          );
        })}
      </div>
      {position === "bottom" && <span className="sr-only">Your hand</span>}
    </section>
  );
}
