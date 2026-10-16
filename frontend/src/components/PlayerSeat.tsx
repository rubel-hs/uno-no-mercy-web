import { cardBack, type CardDefinition } from "../game/cards";
import { GameCard } from "./GameCard";

export type PlayerSeatProps = {
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
  onPlayCard?: (cardId: string) => void;
  disabled?: boolean;
};

export function PlayerSeat({
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
  onPlayCard,
  disabled = false,
}: PlayerSeatProps) {
  const isActualActive = active && !eliminated;
  const visibleCards = cards ?? Array.from({ length: Math.min(count, 7) }, () => cardBack);

  return (
    <section
      className={`player-seat player-seat--${position} player-seat--${orientation} ${
        isActualActive ? "is-active" : ""
      } ${eliminated ? "is-eliminated" : ""} ${!online ? "is-offline" : ""}`}
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
      <div className="player-seat__hand" aria-hidden={position !== "bottom" ? "true" : undefined}>
        {visibleCards.map((card, index) => {
          const instanceId = cardIds?.[index] ?? card.id;
          const isLegal = legalCardIds ? legalCardIds.includes(instanceId) : true;
          const isPlayable = position === "bottom" && isLegal && !disabled;

          return (
            <GameCard
              alignFlat={orientation === "horizontal"}
              card={card}
              className={`player-seat__card ${
                position === "bottom" && !isLegal ? "is-disabled" : ""
              }`}
              disabled={position === "bottom" && !isPlayable}
              key={`${name}-${card.id}-${index}`}
              onClick={() => {
                if (isPlayable && onPlayCard) {
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
            />
          );
        })}
      </div>
      {position === "bottom" && <span className="sr-only">Your hand</span>}
    </section>
  );
}
