import { cardBack, type CardDefinition } from "../game/cards";
import { GameCard } from "./GameCard";

type PlayerSeatProps = {
  cards?: CardDefinition[];
  count: number;
  name: string;
  orientation: "horizontal" | "vertical";
  points: number;
  position: "top" | "right" | "bottom" | "left";
  active?: boolean;
};

export function PlayerSeat({ cards, count, name, orientation, points, position, active = false }: PlayerSeatProps) {
  const visibleCards = cards ?? Array.from({ length: Math.min(count, 7) }, () => cardBack);

  return (
    <section
      className={`player-seat player-seat--${position} player-seat--${orientation} ${active ? "is-active" : ""}`}
      aria-label={`${name}, ${points} points${active ? ", current player" : ""}`}
    >
      <div className="player-seat__meta">
        <span className="player-seat__identity">
          <b>{name}</b>
          {active && <small>Current player</small>}
        </span>
        <span className="player-seat__score">
          {points}<i aria-hidden="true">★</i>
        </span>
      </div>
      <div className="player-seat__hand" aria-hidden="true">
        {visibleCards.map((card, index) => (
          <GameCard
            alignFlat={orientation === "horizontal"}
            card={card}
            className="player-seat__card"
            key={`${name}-${card.id}-${index}`}
            pointerOnly={position === "bottom"}
            rotation={position === "left" ? 90 : position === "right" ? -90 : undefined}
            size={position === "bottom" ? "large" : "small"}
          />
        ))}
      </div>
      {position === "bottom" && <span className="sr-only">Your hand</span>}
    </section>
  );
}
